"""
ClipForge AI — FastAPI Video-to-Shorts Processing Worker

Pipeline:
1. Video Ingest (yt-dlp for YouTube URLs or multipart MP4/MOV upload) + FFmpeg 16kHz WAV extraction
2. Word-Level Transcription (Groq Whisper API `whisper-large-v3` or local `faster-whisper`)
3. Viral Hook Extraction (Gemini Flash / OpenAI-compatible structured JSON output)
4. Smart 9:16 / 1:1 Face-Tracking Crop (OpenCV + MediaPipe) + Dynamic .ASS Subtitle Burn via FFmpeg
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import struct
import subprocess
import time
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Literal, Optional

import cv2
import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage" / "jobs"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]

app = FastAPI(
    title="ClipForge AI Worker",
    version="1.0.0",
    description="Open-source AI Video-to-Shorts pipeline powered by yt-dlp, faster-whisper, MediaPipe, and FFmpeg.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=2)
JOBS: dict[str, dict[str, Any]] = {}


class CreateJobRequest(BaseModel):
    youtube_url: str = Field(..., min_length=5)
    aspect_ratio: Literal["9:16", "1:1"] = "9:16"
    clip_length: Literal["auto", "under30"] = "auto"
    caption_style: Literal["hormozi", "minimal", "karaoke"] = "hormozi"
    auto_face_tracking: bool = True


def _update_job(
    job_id: str,
    *,
    status: Optional[str] = None,
    step: Optional[int] = None,
    progress: Optional[int] = None,
    message: Optional[str] = None,
    clips: Optional[list[dict[str, Any]]] = None,
    error: Optional[str] = None,
) -> None:
    job = JOBS[job_id]
    if status is not None:
        job["status"] = status
    if step is not None:
        job["step"] = step
    if progress is not None:
        job["progress"] = progress
    if message is not None:
        job["message"] = message
    if clips is not None:
        job["clips"] = clips
    if error is not None:
        job["error"] = error
    job["updated_at"] = time.time()

    job_meta = STORAGE_DIR / job_id / "job.json"
    job_meta.parent.mkdir(parents=True, exist_ok=True)
    job_meta.write_text(json.dumps(job, indent=2), encoding="utf-8")


def _run_cmd(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({' '.join(cmd[:4])}): {proc.stderr[-600:]}")


# ---------------------------------------------------------------------------
# Step 1: Video Download (yt-dlp) & Audio Extraction (ffmpeg)
# ---------------------------------------------------------------------------
def download_youtube_video(url: str, dest_dir: Path) -> tuple[Path, str]:
    import yt_dlp

    output_template = str(dest_dir / "source.%(ext)s")
    ydl_opts = {
        "format": "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": output_template,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title") or "YouTube Video"

    mp4_path = dest_dir / "source.mp4"
    if not mp4_path.exists():
        candidates = list(dest_dir.glob("source.*"))
        if not candidates:
            raise FileNotFoundError("yt-dlp did not produce a video file.")
        mp4_path = candidates[0]
    return mp4_path, title


def extract_audio_wav(video_path: Path, wav_path: Path) -> None:
    _run_cmd(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            str(wav_path),
        ]
    )


# ---------------------------------------------------------------------------
# Step 2: Word-Level Transcription (Groq Whisper API or Local faster-whisper)
# ---------------------------------------------------------------------------
def transcribe_word_level(audio_path: Path) -> list[dict[str, Any]]:
    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()

    if groq_api_key:
        with audio_path.open("rb") as f:
            resp = httpx.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {groq_api_key}"},
                data={
                    "model": "whisper-large-v3",
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "word",
                },
                files={"file": (audio_path.name, f, "audio/wav")},
                timeout=300.0,
            )
            resp.raise_for_status()
            payload = resp.json()
            words = payload.get("words") or []
            return [
                {
                    "word": str(w["word"]).strip(),
                    "start": float(w["start"]),
                    "end": float(w["end"]),
                }
                for w in words
                if str(w.get("word", "")).strip()
            ]

    # Free local transcription via faster-whisper
    from faster_whisper import WhisperModel

    model_size = os.getenv("WHISPER_MODEL", "base")
    device = os.getenv("WHISPER_DEVICE", "auto")
    compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    segments, _ = model.transcribe(str(audio_path), word_timestamps=True, vad_filter=True)

    words: list[dict[str, Any]] = []
    for seg in segments:
        if not seg.words:
            continue
        for w in seg.words:
            token = (w.word or "").strip()
            if token:
                words.append(
                    {
                        "word": token,
                        "start": round(float(w.start), 3),
                        "end": round(float(w.end), 3),
                    }
                )
    return words


# ---------------------------------------------------------------------------
# Step 3: Audio Energy Peak Detection + AI Viral Hook Extraction
# ---------------------------------------------------------------------------
def compute_audio_energy_per_second(wav_path: Path) -> list[float]:
    """Computes normalized 0.0..1.0 RMS loudness per second using stdlib wave/struct."""
    try:
        with wave.open(str(wav_path), "rb") as wf:
            rate = wf.getframerate() or 16000
            channels = wf.getnchannels() or 1
            frames_per_sec = rate * channels
            energies: list[float] = []
            while True:
                raw = wf.readframes(rate)
                if not raw:
                    break
                count = len(raw) // 2
                if count == 0:
                    break
                samples = struct.unpack(f"<{count}h", raw[: count * 2])
                rms = math.sqrt(sum(s * s for s in samples) / max(1, count))
                energies.append(rms)
            if not energies:
                return []
            peak = max(energies) or 1.0
            return [round(e / peak, 3) for e in energies]
    except Exception:
        return []


def _format_transcript_for_llm(
    words: list[dict[str, Any]],
    energy_curve: Optional[list[float]] = None,
) -> str:
    if not words:
        return ""
    lines: list[str] = []
    bucket_words: list[str] = []
    bucket_start = words[0]["start"]

    for w in words:
        bucket_words.append(w["word"])
        if len(bucket_words) >= 14 or w["word"].endswith((".", "?", "!")):
            energy_tag = ""
            if energy_curve:
                s_idx = max(0, min(len(energy_curve) - 1, int(bucket_start)))
                e_idx = max(s_idx, min(len(energy_curve) - 1, int(w["end"])))
                local_peak = max(energy_curve[s_idx : e_idx + 1])
                if local_peak >= 0.72:
                    energy_tag = " [HIGH ENERGY]"
            lines.append(
                f"[{bucket_start:.1f}s - {w['end']:.1f}s]{energy_tag} {' '.join(bucket_words)}"
            )
            bucket_words = []
            bucket_start = w["end"]

    if bucket_words:
        lines.append(f"[{bucket_start:.1f}s - {words[-1]['end']:.1f}s] {' '.join(bucket_words)}")
    return "\n".join(lines)


def _extract_json_array(raw_text: str) -> list[dict[str, Any]]:
    cleaned = raw_text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    parsed = json.loads(cleaned)
    if isinstance(parsed, dict) and "clips" in parsed:
        return list(parsed["clips"])
    if isinstance(parsed, list):
        return parsed
    raise ValueError("LLM response did not contain a JSON list of clips.")


def extract_viral_hooks(
    words: list[dict[str, Any]],
    video_duration: float,
    clip_length: Literal["auto", "under30"],
    energy_curve: Optional[list[float]] = None,
) -> list[dict[str, Any]]:
    min_len = 15 if clip_length == "under30" else 25
    max_len = 29 if clip_length == "under30" else 58
    transcript_block = _format_transcript_for_llm(words, energy_curve)

    system_prompt = (
        "You are a master viral short-form editor (OpusClip / ClipSon / MrBeast retention specialist). "
        "Analyze the timestamped transcript (including [HIGH ENERGY] vocal/crowd peaks) and extract the "
        "TOP 3 to 5 craziest, highest-retention standalone viral moments. "
        f"Each clip MUST be between {min_len} and {max_len} seconds long, start on a scroll-stopping hook, "
        "contain zero dead air, and end on a punchy payoff. Return ONLY a JSON array of objects with exact keys: "
        "start_time (number), end_time (number), hook_title (string, 4-8 punchy words), virality_score (integer 75-99), "
        "reason (string citing the exact hook/energy spike), hashtags (array of 4 hashtag strings)."
    )

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    if gemini_key and transcript_block:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        response = client.models.generate_content(
            model=model_name,
            contents=f"{system_prompt}\n\nTRANSCRIPT:\n{transcript_block[:48000]}",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.35,
            ),
        )
        candidates = _extract_json_array(response.text or "[]")
        return _normalize_hooks(candidates, video_duration, max_len)

    if openai_key and transcript_block:
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        resp = httpx.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model_name,
                "temperature": 0.35,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"TRANSCRIPT:\n{transcript_block[:48000]}"},
                ],
            },
            timeout=90.0,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        candidates = _extract_json_array(content)
        return _normalize_hooks(candidates, video_duration, max_len)

    # Energy + Hook-Keyword Heuristic Scorer fallback when no LLM API key is configured
    target_len = float(min(max_len, max(16.0, video_duration / 4.0)))
    hook_triggers = {
        "stop", "never", "secret", "nobody", "why", "truth", "crazy",
        "insane", "actually", "mistake", "wrong", "wait", "million", "zero",
    }
    scored_windows: list[tuple[float, float, float, str]] = []
    step = max(6.0, target_len * 0.45)
    t = 0.0
    while t + 10 < video_duration:
        end_t = min(video_duration, t + target_len)
        win_words = [w for w in words if w["end"] >= t and w["start"] <= end_t]
        text_lower = " ".join(w["word"].lower() for w in win_words)
        trigger_hits = sum(1 for h in hook_triggers if h in text_lower)
        avg_energy = 0.5
        if energy_curve:
            s_i = max(0, min(len(energy_curve) - 1, int(t)))
            e_i = max(s_i, min(len(energy_curve) - 1, int(end_t)))
            avg_energy = sum(energy_curve[s_i : e_i + 1]) / max(1, e_i - s_i + 1)
        score = 72.0 + min(15.0, trigger_hits * 4.5) + avg_energy * 11.0
        headline = " ".join(w["word"] for w in win_words[:7]).strip(".,!? ") or "Peak Viral Moment"
        scored_windows.append((score, round(t, 2), round(end_t, 2), headline))
        t += step

    scored_windows.sort(key=lambda x: x[0], reverse=True)
    clips: list[dict[str, Any]] = []
    for score, s_t, e_t, headline in scored_windows:
        if any(not (e_t <= c["start_time"] + 5 or s_t >= c["end_time"] - 5) for c in clips):
            continue
        clips.append(
            {
                "start_time": s_t,
                "end_time": e_t,
                "hook_title": headline.capitalize(),
                "virality_score": int(min(98, round(score))),
                "reason": "Selected for high vocal energy peaks and strong hook phrasing density.",
                "hashtags": ["#Shorts", "#CreatorClips", "#ViralMoments", "#ClipForgeAI"],
            }
        )
        if len(clips) >= 4:
            break
    return clips


def _normalize_hooks(
    raw: list[dict[str, Any]],
    video_duration: float,
    max_len: int,
) -> list[dict[str, Any]]:
    valid: list[dict[str, Any]] = []
    for i, item in enumerate(raw[:5]):
        start_t = max(0.0, float(item.get("start_time", 0.0)))
        end_t = min(video_duration, float(item.get("end_time", start_t + max_len)))
        if end_t - start_t < 6:
            end_t = min(video_duration, start_t + min(max_len, 25))
        if end_t <= start_t:
            continue
        valid.append(
            {
                "start_time": round(start_t, 2),
                "end_time": round(end_t, 2),
                "hook_title": str(item.get("hook_title") or f"Viral Clip #{i + 1}"),
                "virality_score": int(max(60, min(99, int(item.get("virality_score", 88))))),
                "reason": str(item.get("reason") or "Strong opening hook and clear payoff."),
                "hashtags": list(item.get("hashtags") or ["#Shorts", "#Viral", "#ClipForgeAI"]),
            }
        )
    return valid


# ---------------------------------------------------------------------------
# Step 4: Smart Face-Tracking Crop (OpenCV + MediaPipe) & .ASS Subtitle Burn
# ---------------------------------------------------------------------------
def detect_average_face_center_x(
    video_path: Path,
    start_time: float,
    end_time: float,
) -> float:
    """Returns normalized X center (0.0 .. 1.0) using MediaPipe FaceDetection with EMA smoothing."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return 0.5

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    sample_times = [
        start_time + (end_time - start_time) * frac
        for frac in (0.1, 0.25, 0.4, 0.55, 0.7, 0.85)
    ]

    centers: list[float] = []
    try:
        import mediapipe as mp

        mp_face = mp.solutions.face_detection
        with mp_face.FaceDetection(model_selection=1, min_detection_confidence=0.5) as detector:
            for t in sample_times:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
                ok, frame = cap.read()
                if not ok:
                    continue
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                res = detector.process(rgb)
                if res.detections:
                    # Pick largest / highest-confidence face
                    best = max(
                        res.detections,
                        key=lambda d: d.location_data.relative_bounding_box.width
                        * d.location_data.relative_bounding_box.height,
                    )
                    bbox = best.location_data.relative_bounding_box
                    cx = bbox.xmin + bbox.width / 2.0
                    centers.append(max(0.15, min(0.85, float(cx))))
    except Exception:
        # OpenCV Haar Cascade fallback if MediaPipe is unavailable
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(cascade_path)
        for t in sample_times:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
            ok, frame = cap.read()
            if not ok:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, 1.1, 4)
            if len(faces) > 0:
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
                cx = (x + w / 2.0) / max(1, frame.shape[1])
                centers.append(max(0.15, min(0.85, float(cx))))
    finally:
        cap.release()

    if not centers:
        return 0.5

    # Exponential Moving Average smoothing
    ema = centers[0]
    for c in centers[1:]:
        ema = 0.6 * ema + 0.4 * c
    return ema


def _probe_dimensions(video_path: Path) -> tuple[int, int, float]:
    cap = cv2.VideoCapture(str(video_path))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1920)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1080)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    cap.release()
    duration = frames / fps if frames > 0 else 60.0
    return w, h, duration


def _format_ass_ts(seconds: float) -> str:
    s = max(0.0, seconds)
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    rem = s % 60
    return f"{h}:{m:02d}:{rem:05.2f}"


def generate_ass_subtitles(
    clip_words: list[dict[str, Any]],
    ass_path: Path,
    caption_style: Literal["hormozi", "minimal", "karaoke"],
    target_w: int,
    target_h: int,
) -> None:
    if caption_style == "minimal":
        font_size = 56
        primary_color = "&H00F8FAFC"
        highlight_color = "&H0081B910"  # Emerald (#10B981 in BGR)
        outline = 2
        border_style = 3
        back_color = "&H990D1117"
    elif caption_style == "karaoke":
        font_size = 66
        primary_color = "&H00F8FAFC"
        highlight_color = "&H0081B910"
        outline = 4
        border_style = 1
        back_color = "&H80000000"
    else:  # hormozi
        font_size = 76
        primary_color = "&H00FFFFFF"
        highlight_color = "&H0015CCFA"  # Electric Yellow (#FACC15 in BGR)
        outline = 5
        border_style = 1
        back_color = "&H90000000"

    margin_v = int(target_h * 0.16)
    header = "\n".join(
        [
            "[Script Info]",
            "ScriptType: v4.00+",
            f"PlayResX: {target_w}",
            f"PlayResY: {target_h}",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            f"Style: Default,Arial,{font_size},{primary_color},{highlight_color},&H00000000,{back_color},-1,0,0,0,100,100,0,0,{border_style},{outline},2,2,50,50,{margin_v},1",
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ]
    )

    events: list[str] = []
    chunk_size = 3
    for i in range(0, len(clip_words), chunk_size):
        chunk = clip_words[i : i + chunk_size]
        for active_idx, active_word in enumerate(chunk):
            start_ts = _format_ass_ts(active_word["start"])
            end_ts = _format_ass_ts(active_word["end"])
            rendered_tokens: list[str] = []
            for j, token in enumerate(chunk):
                safe_txt = token["word"].replace("{", "").replace("}", "")
                if caption_style == "hormozi":
                    safe_txt = safe_txt.upper()
                if j == active_idx:
                    rendered_tokens.append(
                        f"{{\\c{highlight_color}\\fscx112\\fscy112}}{safe_txt}{{\\c{primary_color}\\fscx100\\fscy100}}"
                    )
                else:
                    rendered_tokens.append(safe_txt)
            line_text = " ".join(rendered_tokens)
            events.append(f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{line_text}")

    ass_path.write_text(header + "\n" + "\n".join(events) + "\n", encoding="utf-8")


def render_clip_with_ffmpeg(
    source_video: Path,
    output_mp4: Path,
    ass_path: Path,
    start_time: float,
    end_time: float,
    aspect_ratio: Literal["9:16", "1:1"],
    face_center_x: float,
    src_w: int,
    src_h: int,
) -> None:
    duration = max(1.0, end_time - start_time)
    if aspect_ratio == "9:16":
        target_w, target_h = 1080, 1920
        crop_h = src_h
        crop_w = min(src_w, int(crop_h * (9 / 16)))
    else:
        target_w, target_h = 1080, 1080
        crop_h = min(src_h, src_w)
        crop_w = crop_h

    # Ensure even dimensions for x264
    crop_w -= crop_w % 2
    crop_h -= crop_h % 2

    center_px = int(face_center_x * src_w)
    crop_x = max(0, min(src_w - crop_w, center_px - crop_w // 2))
    crop_y = max(0, (src_h - crop_h) // 2)

    # Escape path for FFmpeg libass filter on Windows/POSIX
    escaped_ass = str(ass_path).replace("\\", "/").replace(":", "\\:")
    vf_chain = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},scale={target_w}:{target_h},ass='{escaped_ass}'"

    _run_cmd(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{start_time:.2f}",
            "-i",
            str(source_video),
            "-t",
            f"{duration:.2f}",
            "-vf",
            vf_chain,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(output_mp4),
        ]
    )


def maybe_save_to_supabase(job_id: str, title: str, clips: list[dict[str, Any]]) -> None:
    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not (sb_url and sb_key):
        return

    try:
        from supabase import create_client

        sb = create_client(sb_url, sb_key)
        sb.table("projects").upsert({"id": job_id, "title": title, "status": "completed"}).execute()
        for c in clips:
            sb.table("clips").upsert(
                {
                    "id": f"{job_id}_{c['id']}",
                    "project_id": job_id,
                    "hook_title": c["hook_title"],
                    "virality_score": c["virality_score"],
                    "reason": c["reason"],
                    "start_time": c["start_time"],
                    "end_time": c["end_time"],
                    "hashtags": c["hashtags"],
                    "video_url": c["video_url"],
                }
            ).execute()
    except Exception:
        # Supabase persistence is optional; local filesystem remains authoritative
        pass


# ---------------------------------------------------------------------------
# Background Job Runner
# ---------------------------------------------------------------------------
def process_job(
    job_id: str,
    *,
    youtube_url: Optional[str],
    uploaded_video: Optional[Path],
    aspect_ratio: Literal["9:16", "1:1"],
    clip_length: Literal["auto", "under30"],
    caption_style: Literal["hormozi", "minimal", "karaoke"],
    auto_face_tracking: bool,
) -> None:
    job_dir = STORAGE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Step 1: Fetch video & extract audio
        _update_job(
            job_id,
            status="processing",
            step=1,
            progress=12,
            message="Fetching video stream & extracting 16kHz mono audio...",
        )
        if youtube_url:
            video_path, source_title = download_youtube_video(youtube_url, job_dir)
        elif uploaded_video:
            video_path = uploaded_video
            source_title = uploaded_video.stem
        else:
            raise ValueError("No video source provided.")

        wav_path = job_dir / "audio.wav"
        extract_audio_wav(video_path, wav_path)
        energy_curve = compute_audio_energy_per_second(wav_path)
        src_w, src_h, video_duration = _probe_dimensions(video_path)

        # Step 2: Transcribe speech with word-level timestamps
        _update_job(
            job_id,
            step=2,
            progress=38,
            message="Transcribing speech with word-level Whisper timestamps...",
        )
        words = transcribe_word_level(wav_path)

        # Step 3: AI hook extraction
        _update_job(
            job_id,
            step=3,
            progress=62,
            message="AI scoring high-retention viral hooks & audio energy peaks...",
        )
        hooks = extract_viral_hooks(words, video_duration, clip_length, energy_curve)

        # Step 4: Smart face-tracking crop & burn dynamic captions
        _update_job(
            job_id,
            step=4,
            progress=78,
            message="Tracking speaker faces & burning dynamic .ASS captions...",
        )

        target_w, target_h = (1080, 1920) if aspect_ratio == "9:16" else (1080, 1080)
        rendered_clips: list[dict[str, Any]] = []

        for idx, hook in enumerate(hooks):
            clip_id = f"clip-{idx + 1}"
            s_t = hook["start_time"]
            e_t = hook["end_time"]

            clip_words = [
                {
                    "word": w["word"],
                    "start": round(w["start"] - s_t, 2),
                    "end": round(w["end"] - s_t, 2),
                }
                for w in words
                if w["end"] >= s_t and w["start"] <= e_t
            ]

            face_cx = (
                detect_average_face_center_x(video_path, s_t, e_t)
                if auto_face_tracking
                else 0.5
            )

            ass_path = job_dir / f"{clip_id}.ass"
            mp4_path = job_dir / f"{clip_id}.mp4"
            generate_ass_subtitles(clip_words, ass_path, caption_style, target_w, target_h)
            render_clip_with_ffmpeg(
                source_video=video_path,
                output_mp4=mp4_path,
                ass_path=ass_path,
                start_time=s_t,
                end_time=e_t,
                aspect_ratio=aspect_ratio,
                face_center_x=face_cx,
                src_w=src_w,
                src_h=src_h,
            )

            rendered_clips.append(
                {
                    "id": clip_id,
                    "hook_title": hook["hook_title"],
                    "virality_score": hook["virality_score"],
                    "reason": hook["reason"],
                    "start_time": s_t,
                    "end_time": e_t,
                    "hashtags": hook["hashtags"],
                    "words": clip_words,
                    "transcript_text": " ".join(w["word"] for w in clip_words),
                    "video_url": f"/api/jobs/{job_id}/clips/{clip_id}/stream",
                    "download_url": f"/api/jobs/{job_id}/clips/{clip_id}/download",
                }
            )

            pct = 78 + int(((idx + 1) / max(1, len(hooks))) * 20)
            _update_job(
                job_id,
                step=4,
                progress=min(98, pct),
                message=f"Rendered {idx + 1}/{len(hooks)} HD shorts...",
            )

        maybe_save_to_supabase(job_id, source_title, rendered_clips)
        _update_job(
            job_id,
            status="completed",
            step=4,
            progress=100,
            message="All viral shorts rendered and ready!",
            clips=rendered_clips,
        )
    except Exception as exc:
        _update_job(
            job_id,
            status="failed",
            error=str(exc),
            message=f"Pipeline error: {exc}",
        )


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "clipforge-ai-worker",
        "ffmpeg": shutil.which("ffmpeg") is not None,
    }


@app.post("/api/jobs")
def create_job(req: CreateJobRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "step": 1,
        "progress": 2,
        "message": "Queued YouTube processing job...",
        "clips": [],
        "error": None,
    }
    background_tasks.add_task(
        executor.submit,
        process_job,
        job_id,
        youtube_url=req.youtube_url,
        uploaded_video=None,
        aspect_ratio=req.aspect_ratio,
        clip_length=req.clip_length,
        caption_style=req.caption_style,
        auto_face_tracking=req.auto_face_tracking,
    )
    return {"job_id": job_id}


@app.post("/api/jobs/upload")
async def create_upload_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    aspect_ratio: Literal["9:16", "1:1"] = Form("9:16"),
    clip_length: Literal["auto", "under30"] = Form("auto"),
    caption_style: Literal["hormozi", "minimal", "karaoke"] = Form("hormozi"),
    auto_face_tracking: bool = Form(True),
) -> dict[str, str]:
    job_id = uuid.uuid4().hex[:12]
    job_dir = STORAGE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "upload.mp4").suffix or ".mp4"
    dest = job_dir / f"source{ext}"
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "step": 1,
        "progress": 5,
        "message": f"Uploaded {file.filename}; queued for processing...",
        "clips": [],
        "error": None,
    }

    background_tasks.add_task(
        executor.submit,
        process_job,
        job_id,
        youtube_url=None,
        uploaded_video=dest,
        aspect_ratio=aspect_ratio,
        clip_length=clip_length,
        caption_style=caption_style,
        auto_face_tracking=auto_face_tracking,
    )
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    if job_id in JOBS:
        return JOBS[job_id]
    meta_path = STORAGE_DIR / job_id / "job.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))
    raise HTTPException(status_code=404, detail="Job not found")


@app.get("/api/jobs/{job_id}/clips/{clip_id}/stream")
def stream_clip(job_id: str, clip_id: str) -> FileResponse:
    mp4_path = STORAGE_DIR / job_id / f"{clip_id}.mp4"
    if not mp4_path.exists():
        raise HTTPException(status_code=404, detail="Clip video not found")
    return FileResponse(mp4_path, media_type="video/mp4")


@app.get("/api/jobs/{job_id}/clips/{clip_id}/download")
def download_clip(job_id: str, clip_id: str) -> FileResponse:
    mp4_path = STORAGE_DIR / job_id / f"{clip_id}.mp4"
    if not mp4_path.exists():
        raise HTTPException(status_code=404, detail="Clip video not found")
    return FileResponse(
        mp4_path,
        media_type="video/mp4",
        filename=f"clipforge-{job_id}-{clip_id}.mp4",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

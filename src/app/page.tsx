"use client";

import React, { useEffect, useRef, useState } from "react";
import { LandingAuth } from "@/components/LandingAuth";
import { StudioNavbar } from "@/components/StudioNavbar";
import { StudioDashboard } from "@/components/StudioDashboard";
import { ProcessingTracker } from "@/components/ProcessingTracker";
import { ResultsView } from "@/components/ResultsView";
import {
  AppView,
  GeneratedClip,
  GenerationSettings,
  UserProfile,
} from "@/types/clipforge";
import {
  buildWordTokensFromText,
  SAMPLE_VIDEO_PRESETS,
} from "@/lib/demo-data";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

function probeLocalVideoDuration(file: File): Promise<{ url: string; duration: number }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.src = objectUrl;
    const done = (dur: number) => {
      resolve({ url: objectUrl, duration: Math.max(20, Math.round(dur || 60)) });
    };
    vid.onloadedmetadata = () => done(vid.duration);
    vid.onerror = () => done(60);
  });
}

export default function ClipForgeApp() {
  const [view, setView] = useState<AppView>("landing");
  const [user, setUser] = useState<UserProfile>({
    name: "Creator",
    handle: "ClipForge Studio",
    provider: "demo",
    plan: "Free Tier • Unlimited",
  });

  const [backendOnline, setBackendOnline] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState(SAMPLE_VIDEO_PRESETS[0].url);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<GenerationSettings>({
    aspectRatio: "9:16",
    clipLength: "auto",
    captionStyle: "hormozi",
    autoFaceTracking: true,
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [liveLog, setLiveLog] = useState("Initializing ClipForge AI pipeline...");
  const [sourceLabel, setSourceLabel] = useState("");
  const [clips, setClips] = useState<GeneratedClip[]>([]);

  const cancelFlagRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1600);
        const res = await fetch(`${API_BASE}/api/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (active && res.ok) {
          setBackendOnline(true);
        }
      } catch {
        if (active) setBackendOnline(false);
      }
    };
    void checkHealth();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current);
    };
  }, []);

  const handleAuthenticate = (profile: UserProfile) => {
    setUser(profile);
    setView("studio");
  };

  const handleSignOut = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    cancelFlagRef.current = true;
    setView("landing");
  };

  const handleCancelProcessing = () => {
    cancelFlagRef.current = true;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setView("studio");
  };

  const runRealYouTubeAnalysis = async (url: string) => {
    cancelFlagRef.current = false;
    setCurrentStepIndex(0);
    setProgressPercent(12);
    setLiveLog("Fetching YouTube metadata & extracting timed speech captions...");
    setView("processing");

    // Advance intermediate UI feedback cleanly while /api/analyze executes
    const stageTimer1 = setTimeout(() => {
      if (cancelFlagRef.current) return;
      setCurrentStepIndex(1);
      setProgressPercent(42);
      setLiveLog("Aligning word-level timestamps across full video transcript...");
    }, 900);

    const stageTimer2 = setTimeout(() => {
      if (cancelFlagRef.current) return;
      setCurrentStepIndex(2);
      setProgressPercent(68);
      setLiveLog("Scoring pattern-interrupt hooks, energy spikes & viral payoffs...");
    }, 1800);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: url,
          clipLength: settings.clipLength,
          captionStyle: settings.captionStyle,
        }),
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }

      if (cancelFlagRef.current) return;

      setSourceLabel(`${data.title} • ${data.author}`);
      setCurrentStepIndex(3);
      setProgressPercent(95);
      setLiveLog(
        `Engine (${data.analysisEngine}): mapped ${data.clips.length} viral moments from ${data.segmentCount} transcript segments.`
      );

      setTimeout(() => {
        if (cancelFlagRef.current) return;
        setProgressPercent(100);
        setClips(data.clips);
        setView("results");
      }, 450);
    } catch (err) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      if (cancelFlagRef.current) return;
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not analyze this YouTube URL. Please verify the link."
      );
      setView("studio");
    }
  };

  const runLocalFilePreviewPipeline = async (file: File) => {
    cancelFlagRef.current = false;
    setCurrentStepIndex(0);
    setProgressPercent(18);
    setLiveLog(`Inspecting local video "${file.name}"...`);
    setView("processing");

    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current);
    }
    const { url: objectUrl, duration } = await probeLocalVideoDuration(file);
    localObjectUrlRef.current = objectUrl;

    if (cancelFlagRef.current) return;
    setCurrentStepIndex(2);
    setProgressPercent(65);
    setLiveLog("Segmenting key vertical windows for 9:16 playback...");

    const clipDur = settings.clipLength === "under30" ? 22 : Math.min(40, Math.max(15, Math.floor(duration / 3)));
    const count = duration >= 70 ? 4 : 3;
    const step = Math.max(clipDur, Math.floor(duration / count));
    const hues: Array<"emerald" | "violet" | "blue" | "amber"> = ["emerald", "violet", "blue", "amber"];

    const localClips: GeneratedClip[] = Array.from({ length: count }).map((_, idx) => {
      const startTime = Math.min(Math.max(0, duration - clipDur), idx * step);
      const endTime = Math.min(duration, startTime + clipDur);
      const segDur = Math.max(8, endTime - startTime);
      const sampleText = `Highlight #${idx + 1} from ${file.name.replace(/\.[^.]+$/, "")}. Edit this live caption box or start the FastAPI worker for automatic Whisper transcription & burned-in MP4 export.`;
      return {
        id: `local-${idx + 1}`,
        title: `${file.name.replace(/\.[^.]+$/, "")} — Highlight #${idx + 1}`,
        viralityScore: 93 - idx * 3,
        hookReason:
          "Loaded directly from your local MP4/MOV stream in 9:16 vertical crop. Connect the Python FastAPI worker for Whisper word-level transcription & H.264 MP4 rendering.",
        startTime,
        endTime,
        duration: segDur,
        hashtags: ["#Shorts", "#LocalUpload", "#ClipForgeAI", "#Reels"],
        words: buildWordTokensFromText(sampleText, segDur),
        transcriptText: sampleText,
        captionStyle: settings.captionStyle,
        captionColor: "#10B981",
        captionPosition: "bottom",
        videoUrl: objectUrl,
        downloadUrl: null,
        cropPanX: 0,
        speakerLabel: "Local Upload",
        faceConfidence: 98.0,
        accentHue: hues[idx % hues.length],
      };
    });

    setTimeout(() => {
      if (cancelFlagRef.current) return;
      setCurrentStepIndex(3);
      setProgressPercent(100);
      setClips(localClips);
      setView("results");
    }, 900);
  };

  const handleGenerate = async () => {
    setErrorMessage(null);
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl && !selectedFile) {
      setErrorMessage("Please paste a YouTube URL or upload an MP4/MOV video file.");
      return;
    }

    const label = selectedFile ? selectedFile.name : trimmedUrl;
    setSourceLabel(label);

    // If FastAPI Python FFmpeg worker is online, run the full MP4 rendering pipeline
    if (backendOnline) {
      try {
        cancelFlagRef.current = false;
        setCurrentStepIndex(0);
        setProgressPercent(5);
        setLiveLog("Submitting job to ClipForge FastAPI FFmpeg worker...");
        setView("processing");

        let jobId = "";
        if (selectedFile) {
          const formData = new FormData();
          formData.append("file", selectedFile);
          formData.append("aspect_ratio", settings.aspectRatio);
          formData.append("clip_length", settings.clipLength);
          formData.append("caption_style", settings.captionStyle);
          formData.append("auto_face_tracking", String(settings.autoFaceTracking));

          const res = await fetch(`${API_BASE}/api/jobs/upload`, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error(`Upload failed (${res.status})`);
          const data = (await res.json()) as { job_id: string };
          jobId = data.job_id;
        } else {
          const res = await fetch(`${API_BASE}/api/jobs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              youtube_url: trimmedUrl,
              aspect_ratio: settings.aspectRatio,
              clip_length: settings.clipLength,
              caption_style: settings.captionStyle,
              auto_face_tracking: settings.autoFaceTracking,
            }),
          });
          if (!res.ok) throw new Error(`Job start failed (${res.status})`);
          const data = (await res.json()) as { job_id: string };
          jobId = data.job_id;
        }

        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(async () => {
          if (cancelFlagRef.current) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            return;
          }
          try {
            const statusRes = await fetch(`${API_BASE}/api/jobs/${jobId}`);
            if (!statusRes.ok) return;
            const job = await statusRes.json();
            setCurrentStepIndex(Math.max(0, (job.step ?? 1) - 1));
            setProgressPercent(job.progress ?? 15);
            setLiveLog(job.message ?? "Processing...");

            if (job.status === "completed") {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              const rawClips = Array.isArray(job.clips)
                ? (job.clips as Array<{
                    id?: string;
                    hook_title?: string;
                    virality_score?: number;
                    reason?: string;
                    start_time?: number;
                    end_time?: number;
                    hashtags?: string[];
                    words?: Array<{ word: string; start: number; end: number }>;
                    transcript_text?: string;
                    video_url?: string;
                    download_url?: string;
                  }>)
                : [];
              const mapped: GeneratedClip[] = rawClips.map((c, i) => ({
                  id: c.id || `clip-${i + 1}`,
                  title: c.hook_title || `Viral Clip #${i + 1}`,
                  viralityScore: c.virality_score ?? 90,
                  hookReason: c.reason || "High-retention standalone hook.",
                  startTime: c.start_time ?? 0,
                  endTime: c.end_time ?? 30,
                  duration: Math.max(
                    1,
                    Math.round((c.end_time ?? 30) - (c.start_time ?? 0))
                  ),
                  hashtags: c.hashtags || ["#Shorts", "#ClipForgeAI"],
                  words: c.words || [],
                  transcriptText:
                    c.transcript_text ||
                    (c.words || []).map((w) => w.word).join(" "),
                  captionStyle: settings.captionStyle,
                  captionColor: "#10B981",
                  captionPosition: "bottom",
                  videoUrl: c.video_url ? `${API_BASE}${c.video_url}` : null,
                  downloadUrl: c.download_url ? `${API_BASE}${c.download_url}` : null,
                  cropPanX: 0,
                  speakerLabel: "Tracked Speaker",
                  faceConfidence: 98.5,
                  accentHue: (["emerald", "violet", "blue", "amber"] as const)[i % 4],
                }));
              setClips(mapped);
              setView("results");
            } else if (job.status === "failed") {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              setErrorMessage(job.error || "Worker processing failed.");
              setView("studio");
            }
          } catch {
            // Keep polling on transient network blips
          }
        }, 1200);
        return;
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Could not reach backend worker."
        );
        setView("studio");
        return;
      }
    }

    // Built-in Next.js Server Analysis for YouTube URLs OR Local File Stream Preview
    if (selectedFile) {
      await runLocalFilePreviewPipeline(selectedFile);
    } else {
      await runRealYouTubeAnalysis(trimmedUrl);
    }
  };

  const handleUpdateClip = (updated: GeneratedClip) => {
    setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  if (view === "landing") {
    return <LandingAuth onAuthenticate={handleAuthenticate} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <StudioNavbar
        user={user}
        backendOnline={backendOnline}
        onGoHome={() => {
          if (view === "processing") handleCancelProcessing();
          else setView("studio");
        }}
        onSignOut={handleSignOut}
      />

      {view === "studio" && (
        <StudioDashboard
          youtubeUrl={youtubeUrl}
          onYoutubeUrlChange={setYoutubeUrl}
          selectedFile={selectedFile}
          onFileSelect={setSelectedFile}
          settings={settings}
          onSettingsChange={setSettings}
          backendOnline={backendOnline}
          errorMessage={errorMessage}
          onGenerate={handleGenerate}
        />
      )}

      {view === "processing" && (
        <ProcessingTracker
          currentStepIndex={currentStepIndex}
          progressPercent={progressPercent}
          sourceLabel={sourceLabel}
          liveLog={liveLog}
          onCancel={handleCancelProcessing}
        />
      )}

      {view === "results" && (
        <ResultsView
          sourceLabel={sourceLabel}
          clips={clips}
          aspectRatio={settings.aspectRatio}
          autoFaceTracking={settings.autoFaceTracking}
          onUpdateClip={handleUpdateClip}
          onNewVideo={() => setView("studio")}
        />
      )}

      <footer className="mt-auto border-t border-[#26324D]/60 py-5 text-center text-xs text-[#94A3B8]">
        <span>
          ClipForge AI • Built by{" "}
          <strong className="font-semibold text-[#34D399]">rakeshhh.b</strong>
        </span>
      </footer>
    </div>
  );
}

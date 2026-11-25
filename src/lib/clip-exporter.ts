import { AspectRatio, GeneratedClip, WordToken } from "@/types/clipforge";

export interface ExportClipOptions {
  clip: GeneratedClip;
  aspectRatio: AspectRatio;
  onProgress?: (percent: number, stageLabel: string) => void;
  signal?: AbortSignal;
}

export interface ExportClipResult {
  filename: string;
  mimeType: string;
  durationSeconds: number;
}

function pickSupportedRecorderFormat(): {
  mimeType: string;
  extension: "mp4" | "webm";
} {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video export is not supported in this browser.");
  }

  const candidates: Array<{ mimeType: string; extension: "mp4" | "webm" }> = [
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
    { mimeType: "video/mp4;codecs=avc1.4D401F,mp4a.40.2", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];

  for (const cand of candidates) {
    if (MediaRecorder.isTypeSupported(cand.mimeType)) {
      return cand;
    }
  }

  return { mimeType: "video/webm", extension: "webm" };
}

function getActivePhrase(
  words: WordToken[],
  relTime: number
): { phraseWords: WordToken[]; activeIndex: number } {
  if (words.length === 0) {
    return { phraseWords: [], activeIndex: -1 };
  }

  let activeIdx = words.findIndex(
    (w) => relTime >= w.start && relTime <= w.end
  );
  if (activeIdx === -1) {
    for (let i = words.length - 1; i >= 0; i--) {
      if (relTime >= words[i].start) {
        activeIdx = i;
        break;
      }
    }
    if (activeIdx === -1) activeIdx = 0;
  }

  const chunkSize = 3;
  const chunkStart = Math.floor(activeIdx / chunkSize) * chunkSize;
  return {
    phraseWords: words.slice(chunkStart, chunkStart + chunkSize),
    activeIndex: activeIdx - chunkStart,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCroppedVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetW: number,
  targetH: number,
  cropPanX: number
) {
  const vw = video.videoWidth || targetW;
  const vh = video.videoHeight || targetH;
  const targetAspect = targetW / targetH;
  const srcAspect = vw / vh;

  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;

  if (srcAspect > targetAspect) {
    // Wide source (e.g. 16:9) cropped to 9:16 or 1:1
    sh = vh;
    sw = vh * targetAspect;
    const maxPan = Math.max(0, vw - sw);
    const panFraction = Math.max(0, Math.min(1, 0.5 + cropPanX / 100));
    sx = maxPan * panFraction;
  } else {
    // Tall source cropped vertically
    sw = vw;
    sh = vw / targetAspect;
    sy = Math.max(0, (vh - sh) / 2);
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
}

function drawCaptionsOverlay(
  ctx: CanvasRenderingContext2D,
  clip: GeneratedClip,
  relTime: number,
  width: number,
  height: number
) {
  const { phraseWords, activeIndex } = getActivePhrase(clip.words, relTime);
  if (phraseWords.length === 0) return;

  const yCenter =
    clip.captionPosition === "upper"
      ? height * 0.2
      : clip.captionPosition === "center"
      ? height * 0.5
      : height * 0.8;

  const maxLineWidth = width - 72;
  const isHormozi = clip.captionStyle === "hormozi";
  const isMinimal = clip.captionStyle === "minimal";
  const isKaraoke = clip.captionStyle === "karaoke";

  let fontSize = isHormozi ? 52 : isKaraoke ? 42 : 34;
  const fontFamily =
    '"Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif';

  const displayWords = phraseWords.map((w) =>
    isHormozi ? w.word.toUpperCase() : w.word
  );

  const gap = isKaraoke ? 22 : 18;

  // Shrink font size automatically if a long 3-word phrase exceeds width
  while (fontSize > 22) {
    ctx.font = `800 ${fontSize}px ${fontFamily}`;
    const totalTextWidth =
      displayWords.reduce((acc, word, idx) => {
        const w = ctx.measureText(word).width;
        return acc + (isHormozi && idx === activeIndex ? w * 1.12 : w);
      }, 0) +
      Math.max(0, displayWords.length - 1) * gap;
    if (totalTextWidth <= maxLineWidth) break;
    fontSize -= 3;
  }

  ctx.save();
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const baseWordWidths = displayWords.map((w) => ctx.measureText(w).width);
  const slotWidths = baseWordWidths.map((w, i) =>
    isHormozi && i === activeIndex ? w * 1.12 : w
  );
  const totalWidth =
    slotWidths.reduce((acc, w) => acc + w, 0) +
    Math.max(0, displayWords.length - 1) * gap;

  if (isMinimal || isKaraoke) {
    const padX = 24;
    const pillH = fontSize + 28;
    const pillW = Math.min(width - 36, totalWidth + padX * 2);
    const pillX = (width - pillW) / 2;
    const pillY = yCenter - pillH / 2;

    ctx.fillStyle = isMinimal
      ? "rgba(13, 17, 23, 0.85)"
      : "rgba(13, 17, 23, 0.78)";
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 16);
    ctx.fill();

    if (isMinimal) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  let cursorX = (width - totalWidth) / 2;
  for (let i = 0; i < displayWords.length; i++) {
    const word = displayWords[i];
    const baseWidth = baseWordWidths[i];
    const slotWidth = slotWidths[i];
    const isActive = i === activeIndex;

    if (isKaraoke && isActive) {
      const boxPadX = 10;
      const boxH = fontSize + 14;
      ctx.fillStyle = clip.captionColor;
      drawRoundedRect(
        ctx,
        cursorX - boxPadX,
        yCenter - boxH / 2,
        slotWidth + boxPadX * 2,
        boxH,
        10
      );
      ctx.fill();
    }

    ctx.save();
    const drawX = cursorX + (slotWidth - baseWidth) / 2;
    if (isHormozi && isActive) {
      const cx = cursorX + slotWidth / 2;
      ctx.translate(cx, yCenter);
      ctx.scale(1.12, 1.12);
      ctx.translate(-cx, -yCenter);
    }

    if (isHormozi) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = Math.max(7, Math.round(fontSize * 0.22));
      ctx.strokeStyle = "#000000";
      ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      ctx.strokeText(word, drawX, yCenter);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = isActive ? clip.captionColor : "#F8FAFC";
      ctx.fillText(word, drawX, yCenter);
    } else if (isKaraoke) {
      ctx.fillStyle = isActive ? "#042117" : "#F8FAFC";
      ctx.fillText(word, drawX, yCenter);
    } else {
      ctx.fillStyle = isActive ? clip.captionColor : "#E2E8F0";
      ctx.fillText(word, drawX, yCenter);
    }

    ctx.restore();
    cursorX += slotWidth + gap;
  }

  ctx.restore();
}

function waitForEvent(
  target: EventTarget,
  eventName: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Export canceled.", "AbortError"));
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for video ${eventName}.`));
    }, timeoutMs);

    const onSuccess = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Video stream failed to load for export."));
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Export canceled.", "AbortError"));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(eventName, onSuccess);
      target.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    target.addEventListener(eventName, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function renderAndDownloadClip({
  clip,
  aspectRatio,
  onProgress,
  signal,
}: ExportClipOptions): Promise<ExportClipResult> {
  const sourceUrl = clip.videoUrl
    ? clip.videoUrl
    : clip.youtubeVideoId
    ? `/api/youtube-stream?videoId=${encodeURIComponent(clip.youtubeVideoId)}`
    : null;

  if (!sourceUrl) {
    throw new Error(
      "No video source attached to this clip. Upload an MP4/MOV or paste a YouTube URL."
    );
  }

  // Create Web Audio context synchronously on user gesture before awaiting network I/O
  const AudioCtx =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;

  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  if (AudioCtx) {
    try {
      audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }
      audioDest = audioCtx.createMediaStreamDestination();
    } catch {
      audioCtx = null;
      audioDest = null;
    }
  }

  onProgress?.(4, "Connecting video stream...");

  let adaptiveAudioUrl: string | null = null;

  // Probe YouTube stream first so failures report exact, clear errors quickly
  if (!clip.videoUrl && clip.youtubeVideoId) {
    const probeRes = await fetch(
      `/api/youtube-stream?videoId=${encodeURIComponent(clip.youtubeVideoId)}&probe=1`,
      { signal }
    );
    if (!probeRes.ok) {
      let reason = "YouTube stream could not be fetched for export.";
      try {
        const errJson = (await probeRes.json()) as { error?: string };
        if (errJson.error) reason = errJson.error;
      } catch {
        // Ignore JSON parse errors
      }
      audioCtx?.close().catch(() => undefined);
      throw new Error(reason);
    }
    try {
      const probeData = (await probeRes.json()) as { mode?: string };
      if (probeData.mode === "adaptive") {
        adaptiveAudioUrl = `/api/youtube-stream?videoId=${encodeURIComponent(clip.youtubeVideoId)}&kind=audio`;
      }
    } catch {
      // Ignore optional probe parse error
    }
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.playsInline = true;
  video.muted = Boolean(adaptiveAudioUrl);
  video.volume = 1;

  let separateAudio: HTMLAudioElement | null = null;
  if (adaptiveAudioUrl) {
    separateAudio = new Audio();
    separateAudio.crossOrigin = "anonymous";
    separateAudio.preload = "auto";
    separateAudio.muted = false;
    separateAudio.volume = 1;
  }

  let mediaStream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let rafId = 0;

  try {
    if (audioCtx && audioDest) {
      const mediaSourceTarget = separateAudio ?? video;
      const sourceNode = audioCtx.createMediaElementSource(mediaSourceTarget);
      // Route video/audio track into MediaRecorder destination only (silent export)
      sourceNode.connect(audioDest);
    }

    onProgress?.(10, "Loading video frames...");
    video.src = sourceUrl;
    video.load();
    if (separateAudio && adaptiveAudioUrl) {
      separateAudio.src = adaptiveAudioUrl;
      separateAudio.load();
    }

    await Promise.all([
      video.readyState < 1
        ? waitForEvent(video, "loadedmetadata", 25_000, signal)
        : Promise.resolve(),
      separateAudio && separateAudio.readyState < 1
        ? waitForEvent(separateAudio, "loadedmetadata", 25_000, signal)
        : Promise.resolve(),
    ]);

    const totalMediaDur =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : clip.endTime;
    const safeStart = Math.max(
      0,
      Math.min(clip.startTime, Math.max(0, totalMediaDur - 1))
    );
    const safeEnd = Math.min(
      totalMediaDur,
      Math.max(safeStart + 1, clip.endTime)
    );
    const exportDuration = Math.max(1, safeEnd - safeStart);

    if (safeStart > 0.05) {
      onProgress?.(15, "Seeking to hook timestamp...");
      video.currentTime = safeStart;
      if (separateAudio) {
        separateAudio.currentTime = safeStart;
      }
      await Promise.all([
        waitForEvent(video, "seeked", 25_000, signal),
        separateAudio
          ? waitForEvent(separateAudio, "seeked", 25_000, signal)
          : Promise.resolve(),
      ]);
    }

    await Promise.all([
      video.readyState < 3
        ? waitForEvent(video, "canplay", 25_000, signal)
        : Promise.resolve(),
      separateAudio && separateAudio.readyState < 3
        ? waitForEvent(separateAudio, "canplay", 25_000, signal)
        : Promise.resolve(),
    ]);

    const width = 720;
    const height = aspectRatio === "9:16" ? 1280 : 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx || typeof canvas.captureStream !== "function") {
      throw new Error("Canvas video capture is unavailable in this browser.");
    }

    // Paint the initial real video frame before starting MediaRecorder
    drawCroppedVideoFrame(ctx, video, width, height, clip.cropPanX ?? 0);
    drawCaptionsOverlay(ctx, clip, 0, width, height);

    const canvasStream = canvas.captureStream(30);
    const combinedTracks: MediaStreamTrack[] = [
      ...canvasStream.getVideoTracks(),
      ...(audioDest ? audioDest.stream.getAudioTracks() : []),
    ];
    mediaStream = new MediaStream(combinedTracks);

    const { mimeType, extension } = pickSupportedRecorderFormat();
    recorder = new MediaRecorder(mediaStream, {
      mimeType,
      videoBitsPerSecond: 3_500_000,
      audioBitsPerSecond: 128_000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
      }
    };

    const recordingFinished = new Promise<Blob>((resolve, reject) => {
      if (!recorder) return;
      recorder.onstop = () => {
        if (chunks.length === 0) {
          reject(new Error("Recorded video was empty."));
          return;
        }
        resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
      };
      recorder.onerror = () => {
        reject(new Error("MediaRecorder encountered an encoding error."));
      };
    });

    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    recorder.start(250);
    await Promise.all([
      video.play(),
      separateAudio ? separateAudio.play() : Promise.resolve(),
    ]);
    onProgress?.(20, "Rendering short...");

    await new Promise<void>((resolvePlayback, rejectPlayback) => {
      let settled = false;

      const onTimeUpdate = () => {
        if (!settled && (video.currentTime >= safeEnd - 0.04 || video.ended)) {
          finish();
        }
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        video.removeEventListener("ended", finish);
        video.removeEventListener("timeupdate", onTimeUpdate);
        resolvePlayback();
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        video.removeEventListener("ended", finish);
        video.removeEventListener("timeupdate", onTimeUpdate);
        rejectPlayback(new DOMException("Export canceled.", "AbortError"));
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      video.addEventListener("ended", finish, { once: true });
      video.addEventListener("timeupdate", onTimeUpdate);

      const renderFrame = () => {
        if (settled) return;

        if (
          separateAudio &&
          !separateAudio.paused &&
          Math.abs(separateAudio.currentTime - video.currentTime) > 0.22
        ) {
          separateAudio.currentTime = video.currentTime;
        }

        const nowTime = video.currentTime;
        const relTime = Math.max(0, nowTime - safeStart);

        if (video.readyState >= 2) {
          drawCroppedVideoFrame(ctx, video, width, height, clip.cropPanX ?? 0);
          drawCaptionsOverlay(ctx, clip, relTime, width, height);
        }

        const pct = Math.min(
          98,
          Math.max(20, Math.round(20 + (relTime / exportDuration) * 78))
        );
        onProgress?.(
          pct,
          `Rendering ${Math.min(Math.round(relTime), Math.round(exportDuration))}s / ${Math.round(exportDuration)}s`
        );

        if (nowTime >= safeEnd - 0.04 || video.ended) {
          finish();
          return;
        }

        rafId = window.requestAnimationFrame(renderFrame);
      };

      rafId = window.requestAnimationFrame(renderFrame);
    });

    video.pause();
    separateAudio?.pause();
    if (recorder.state === "recording") {
      recorder.stop();
    }

    onProgress?.(99, "Finalizing video file...");
    const blob = await recordingFinished;

    const safeSlug = clip.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
    const filename = `${safeSlug || clip.id}-clipforge.${extension}`;

    const downloadObjectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadObjectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadObjectUrl), 10_000);

    onProgress?.(100, "Download complete!");
    return {
      filename,
      mimeType,
      durationSeconds: Math.round(exportDuration),
    };
  } finally {
    if (rafId) window.cancelAnimationFrame(rafId);
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (separateAudio) {
      separateAudio.pause();
      separateAudio.removeAttribute("src");
      separateAudio.load();
    }
    if (recorder && recorder.state === "recording") {
      try {
        recorder.stop();
      } catch {
        // Ignore stop errors during cleanup
      }
    }
    mediaStream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close().catch(() => undefined);
  }
}

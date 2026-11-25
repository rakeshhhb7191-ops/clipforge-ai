"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Pause,
  Play,
  ScanFace,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AspectRatio, GeneratedClip } from "@/types/clipforge";
import { formatTimecode } from "@/lib/demo-data";

interface VerticalClipPlayerProps {
  clip: GeneratedClip;
  aspectRatio: AspectRatio;
  autoFaceTracking: boolean;
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void;
            onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
            onError?: (e: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    if (!existingScript) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    } else {
      // Poll briefly if script already injected
      const timer = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    }
  });

  return ytApiPromise;
}

export function VerticalClipPlayer({
  clip,
  aspectRatio,
  autoFaceTracking,
}: VerticalClipPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showFaceHud, setShowFaceHud] = useState(autoFaceTracking);
  const [currentTime, setCurrentTime] = useState(0);
  const [ytReady, setYtReady] = useState(false);
  const [ytEmbedBlocked, setYtEmbedBlocked] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytMountId = useId().replace(/:/g, "-");

  const useYouTubeMode = Boolean(clip.youtubeVideoId && !clip.videoUrl && !ytEmbedBlocked);

  useEffect(() => {
    setShowFaceHud(autoFaceTracking);
  }, [autoFaceTracking]);

  // Initialize YouTube IFrame Player when youtubeVideoId is present
  useEffect(() => {
    if (!clip.youtubeVideoId || clip.videoUrl) return;
    let cancelled = false;
    setYtEmbedBlocked(false);
    setYtReady(false);
    setIsPlaying(false);
    setCurrentTime(0);

    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !ytHostRef.current || !window.YT?.Player) return;

      // Clear any previous inner mount node
      ytHostRef.current.innerHTML = "";
      const mountEl = document.createElement("div");
      mountEl.id = `yt-frame-${ytMountId}`;
      ytHostRef.current.appendChild(mountEl);

      ytPlayerRef.current = new window.YT.Player(mountEl, {
        videoId: clip.youtubeVideoId!,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          start: Math.floor(clip.startTime),
          end: Math.ceil(clip.endTime),
        },
        events: {
          onReady: (ev) => {
            if (cancelled) return;
            ytPlayerRef.current = ev.target;
            setYtReady(true);
            if (isMuted) ev.target.mute();
            else ev.target.unMute();
          },
          onStateChange: (ev) => {
            if (cancelled) return;
            const playingCode = window.YT?.PlayerState?.PLAYING ?? 1;
            const endedCode = window.YT?.PlayerState?.ENDED ?? 0;
            if (ev.data === playingCode) {
              setIsPlaying(true);
            } else if (ev.data === endedCode) {
              // Loop cleanly back to startTime
              ev.target.seekTo(clip.startTime, true);
              ev.target.playVideo();
            } else {
              setIsPlaying(false);
            }
          },
          onError: () => {
            if (!cancelled) {
              setYtEmbedBlocked(true);
              setIsPlaying(false);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        // Ignore cleanup errors
      }
      ytPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.youtubeVideoId, clip.videoUrl, clip.startTime, clip.endTime, ytMountId]);

  // Poll YouTube player current time while playing to drive synced word captions
  useEffect(() => {
    if (!useYouTubeMode || !isPlaying || !ytReady) return;
    const timer = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p) return;
      try {
        const absTime = p.getCurrentTime();
        const rel = absTime - clip.startTime;
        if (rel >= clip.duration || absTime >= clip.endTime) {
          p.seekTo(clip.startTime, true);
          setCurrentTime(0);
        } else {
          setCurrentTime(Math.max(0, rel));
        }
      } catch {
        // Ignore transient read errors
      }
    }, 60);
    return () => clearInterval(timer);
  }, [useYouTubeMode, isPlaying, ytReady, clip.startTime, clip.endTime, clip.duration]);

  // Handle local uploaded/MP4 video segment bounds
  useEffect(() => {
    if (!clip.videoUrl || !videoRef.current) return;
    const vid = videoRef.current;
    if (clip.startTime > 0 && Math.abs(vid.currentTime - clip.startTime) > clip.duration + 1) {
      vid.currentTime = clip.startTime;
    }
  }, [clip.videoUrl, clip.startTime, clip.duration]);

  // Simulated 60fps playback timer for thumbnail/demo fallback mode
  useEffect(() => {
    if (clip.videoUrl || useYouTubeMode || !isPlaying) return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      setCurrentTime((prev) => {
        const next = prev + dt;
        return next >= clip.duration ? 0 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [clip.duration, clip.videoUrl, useYouTubeMode, isPlaying]);

  const togglePlay = () => {
    if (clip.videoUrl && videoRef.current) {
      if (videoRef.current.paused) {
        if (videoRef.current.currentTime < clip.startTime || videoRef.current.currentTime >= clip.endTime) {
          videoRef.current.currentTime = clip.startTime;
        }
        void videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    if (useYouTubeMode && ytPlayerRef.current && ytReady) {
      if (isPlaying) {
        ytPlayerRef.current.pauseVideo();
        setIsPlaying(false);
      } else {
        const absNow = ytPlayerRef.current.getCurrentTime?.() ?? clip.startTime;
        if (absNow < clip.startTime || absNow >= clip.endTime - 0.3) {
          ytPlayerRef.current.seekTo(clip.startTime, true);
          setCurrentTime(0);
        }
        if (isMuted) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
      }
      return;
    }

    setIsPlaying((prev) => !prev);
  };

  const handleSeek = (nextRelTime: number) => {
    setCurrentTime(nextRelTime);
    if (clip.videoUrl && videoRef.current) {
      videoRef.current.currentTime = clip.startTime + nextRelTime;
    } else if (useYouTubeMode && ytPlayerRef.current && ytReady) {
      ytPlayerRef.current.seekTo(clip.startTime + nextRelTime, true);
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
    if (useYouTubeMode && ytPlayerRef.current && ytReady) {
      if (nextMuted) ytPlayerRef.current.mute();
      else ytPlayerRef.current.unMute();
    }
  };

  // Find active word and 3-word phrase window
  const { phraseWords, activeWordIndexInPhrase } = useMemo(() => {
    if (clip.words.length === 0) {
      return { phraseWords: [], activeWordIndexInPhrase: -1 };
    }

    let activeIdx = clip.words.findIndex(
      (w) => currentTime >= w.start && currentTime <= w.end
    );
    if (activeIdx === -1) {
      for (let i = clip.words.length - 1; i >= 0; i--) {
        if (currentTime >= clip.words[i].start) {
          activeIdx = i;
          break;
        }
      }
      if (activeIdx === -1) activeIdx = 0;
    }

    const chunkSize = 3;
    const chunkStart = Math.floor(activeIdx / chunkSize) * chunkSize;
    const slice = clip.words.slice(chunkStart, chunkStart + chunkSize);
    return {
      phraseWords: slice,
      activeWordIndexInPhrase: activeIdx - chunkStart,
    };
  }, [clip.words, currentTime]);

  const positionClass =
    clip.captionPosition === "upper"
      ? "top-14"
      : clip.captionPosition === "center"
      ? "top-1/2 -translate-y-1/2"
      : "bottom-16";

  const cropPanX = clip.cropPanX ?? 0;
  const panOffsetX = Math.sin(currentTime * 0.9) * (showFaceHud ? 4 : 1);

  const hueGlowMap = {
    emerald: "from-[#10B981]/25 via-[#0D1117] to-[#131B2E]",
    violet: "from-[#8B5CF6]/25 via-[#0D1117] to-[#131B2E]",
    blue: "from-[#3B82F6]/25 via-[#0D1117] to-[#131B2E]",
    amber: "from-[#F59E0B]/20 via-[#0D1117] to-[#131B2E]",
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-[#26324D] bg-[#090D14] shadow-2xl ${
          aspectRatio === "9:16"
            ? "aspect-[9/16] max-w-[270px]"
            : "aspect-square max-w-[300px]"
        }`}
      >
        {/* 1. Local MP4 / Uploaded Video */}
        {clip.videoUrl ? (
          <video
            ref={videoRef}
            src={clip.videoUrl}
            muted={isMuted}
            playsInline
            style={{ objectPosition: `${50 + cropPanX * 0.6}% center` }}
            onTimeUpdate={(e) => {
              const abs = e.currentTarget.currentTime;
              if (clip.endTime > 0 && abs >= clip.endTime) {
                e.currentTarget.currentTime = clip.startTime;
                setCurrentTime(0);
              } else {
                setCurrentTime(Math.max(0, abs - clip.startTime));
              }
            }}
            onEnded={() => setIsPlaying(false)}
            className="h-full w-full object-cover"
          />
        ) : useYouTubeMode ? (
          /* 2. Real YouTube Video Cropped 9:16 or 1:1 */
          <div className="relative h-full w-full overflow-hidden bg-black">
            {/* Thumbnail backdrop before playback or while buffering */}
            {clip.thumbnailUrl && !isPlaying && currentTime === 0 && (
              <img
                src={clip.thumbnailUrl}
                alt={clip.title}
                style={{ objectPosition: `${50 + cropPanX * 0.6}% center` }}
                className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover brightness-90"
              />
            )}
            <div
              ref={ytHostRef}
              style={{
                transform: `translateX(calc(-50% + ${cropPanX * 0.35}%))`,
              }}
              className={`pointer-events-none absolute left-1/2 top-0 h-full [&>iframe]:h-full [&>iframe]:w-full ${
                aspectRatio === "9:16" ? "w-[316%]" : "w-[178%]"
              }`}
            />
          </div>
        ) : (
          /* 3. Thumbnail / Studio Fallback if YouTube embed blocked or Demo Mode */
          <div
            className={`relative h-full w-full bg-gradient-to-b ${hueGlowMap[clip.accentHue]} select-none`}
          >
            {clip.thumbnailUrl ? (
              <img
                src={clip.thumbnailUrl}
                alt={clip.title}
                style={{
                  transform: `scale(${isPlaying ? 1.07 : 1.02}) translateX(${panOffsetX + cropPanX * 0.4}px)`,
                }}
                className="h-full w-full object-cover opacity-80 transition-transform duration-300"
              />
            ) : (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center transition-transform duration-150"
                style={{ transform: `translateX(${panOffsetX}px)` }}
                aria-hidden="true"
              >
                <div className="relative flex flex-col items-center">
                  <div className="h-20 w-20 rounded-full border border-white/15 bg-gradient-to-b from-[#334155] to-[#1E293B] shadow-xl" />
                  <div className="-mt-2 h-24 w-36 rounded-t-[2.5rem] border border-white/10 bg-gradient-to-b from-[#1E293B] to-[#0F172A]" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Face-Tracking Bounding Box HUD */}
        {showFaceHud && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[24%] z-[5] flex h-24 w-24 -translate-x-1/2 flex-col justify-between rounded-lg border-2 border-[#10B981]/75 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
          >
            <span className="inline-flex w-fit items-center gap-1 rounded-br bg-[#10B981] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#042117]">
              AI CROP {clip.faceConfidence}%
            </span>
            <div className="flex justify-between px-1 pb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
            </div>
          </div>
        )}

        {/* Top Overlay Badges */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-[#0D1117]/85 to-transparent p-2.5">
          <span className="max-w-[160px] truncate rounded-md border border-white/10 bg-[#0D1117]/75 px-2 py-0.5 text-[10px] font-semibold text-[#CBD5E1] backdrop-blur-sm">
            {clip.speakerLabel}
          </span>
          <span className="rounded-md bg-[#0D1117]/75 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#34D399] backdrop-blur-sm">
            {aspectRatio}
          </span>
        </div>

        {/* Live Animated Word-by-Word Captions Overlay */}
        <div
          className={`pointer-events-none absolute inset-x-3 z-10 flex justify-center text-center ${positionClass}`}
          aria-live="off"
        >
          {clip.captionStyle === "hormozi" && (
            <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
              {phraseWords.map((token, idx) => {
                const isActive = idx === activeWordIndexInPhrase;
                return (
                  <span
                    key={`${token.word}-${idx}`}
                    style={{
                      color: isActive ? clip.captionColor : "#F8FAFC",
                      textShadow:
                        "0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 6px 14px rgba(0,0,0,0.85)",
                    }}
                    className={`font-extrabold uppercase tracking-tight transition-transform duration-75 ${
                      isActive ? "scale-110 text-xl" : "text-lg opacity-95"
                    }`}
                  >
                    {token.word}
                  </span>
                );
              })}
            </div>
          )}

          {clip.captionStyle === "minimal" && (
            <div className="rounded-xl border border-white/10 bg-[#0D1117]/85 px-3 py-1.5 shadow-lg backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm font-semibold">
                {phraseWords.map((token, idx) => {
                  const isActive = idx === activeWordIndexInPhrase;
                  return (
                    <span
                      key={`${token.word}-${idx}`}
                      style={{
                        color: isActive ? clip.captionColor : "#E2E8F0",
                      }}
                      className={isActive ? "font-bold" : "opacity-80"}
                    >
                      {token.word}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {clip.captionStyle === "karaoke" && (
            <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl bg-[#0D1117]/75 px-2.5 py-1.5 backdrop-blur-sm">
              {phraseWords.map((token, idx) => {
                const isActive = idx === activeWordIndexInPhrase;
                return (
                  <span
                    key={`${token.word}-${idx}`}
                    style={
                      isActive
                        ? { backgroundColor: clip.captionColor, color: "#042117" }
                        : undefined
                    }
                    className={`rounded-md px-1.5 py-0.5 text-sm font-extrabold transition-all duration-75 ${
                      isActive ? "scale-105 shadow-md" : "text-[#F8FAFC]/90"
                    }`}
                  >
                    {token.word}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Center Play/Pause Tap Target */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? `Pause ${clip.title}` : `Play ${clip.title}`}
          className="group absolute inset-0 z-10 flex items-center justify-center bg-transparent focus-visible:outline-offset-[-4px]"
        >
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-[#0D1117]/80 text-[#F8FAFC] backdrop-blur-md transition ${
              isPlaying
                ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                : "opacity-100"
            }`}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />
            )}
          </span>
        </button>

        {/* Bottom Player Control Bar */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 bg-gradient-to-t from-[#0D1117] via-[#0D1117]/90 to-transparent px-3 pb-2.5 pt-5">
          <input
            type="range"
            min={0}
            max={clip.duration}
            step={0.1}
            value={Math.min(currentTime, clip.duration)}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            aria-label={`Timeline scrubber for ${clip.title}`}
            className="h-1.5 w-full cursor-pointer accent-[#10B981]"
          />
          <div className="flex items-center justify-between text-[11px] text-[#CBD5E1]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause clip" : "Play clip"}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/10"
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <span className="font-mono">
                {formatTimecode(currentTime)} / {formatTimecode(clip.duration)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowFaceHud((v) => !v)}
                aria-pressed={showFaceHud}
                aria-label="Toggle AI face-tracking bounding box overlay"
                className={`flex h-6 w-6 items-center justify-center rounded-md transition ${
                  showFaceHud
                    ? "bg-[#10B981]/20 text-[#34D399]"
                    : "text-[#94A3B8] hover:bg-white/10"
                }`}
              >
                <ScanFace className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#CBD5E1] hover:bg-white/10"
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {ytEmbedBlocked && clip.youtubeVideoId && (
        <a
          href={`https://youtu.be/${clip.youtubeVideoId}?t=${Math.floor(clip.startTime)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#34D399] hover:underline"
        >
          Embed restricted by owner — Watch moment on YouTube
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

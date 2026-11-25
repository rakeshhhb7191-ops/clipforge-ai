import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface StreamCacheEntry {
  mode: "progressive" | "adaptive";
  videoUrl: string;
  audioUrl: string | null;
  userAgent: string;
  mimeType: string;
  audioMimeType: string | null;
  qualityLabel: string;
  videoContentLength: number | null;
  audioContentLength: number | null;
  expiresAt: number;
}

const STREAM_CACHE = new Map<string, StreamCacheEntry>();
const MAX_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB chunks keep Vercel serverless streaming fast & under limits

interface InnertubeFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  contentLength?: string;
  bitrate?: number;
  width?: number;
  height?: number;
}

interface InnertubeClientConfig {
  clientName: string;
  clientVersion: string;
  androidSdkVersion?: number;
  deviceMake?: string;
  deviceModel?: string;
  userAgent: string;
}

const INNERTUBE_CLIENTS: InnertubeClientConfig[] = [
  {
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    androidSdkVersion: 30,
    userAgent:
      "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
  },
  {
    clientName: "IOS",
    clientVersion: "20.10.4",
    deviceMake: "Apple",
    deviceModel: "iPhone16,2",
    userAgent:
      "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)",
  },
  {
    clientName: "MWEB",
    clientVersion: "2.20250219.01.00",
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  },
];

function extractExpireTimestamp(streamUrl: string): number {
  try {
    const u = new URL(streamUrl);
    const exp = Number(u.searchParams.get("expire"));
    if (Number.isFinite(exp) && exp > 0) {
      return exp * 1000 - 120_000;
    }
  } catch {
    // Ignore parse error
  }
  return Date.now() + 15 * 60_000;
}

function pickBestProgressiveFormat(
  formats: InnertubeFormat[]
): InnertubeFormat | null {
  const withUrl = formats.filter(
    (f) => typeof f.url === "string" && f.url.length > 0
  );
  if (withUrl.length === 0) return null;

  const mp4s = withUrl.filter((f) =>
    (f.mimeType ?? "").toLowerCase().includes("video/mp4")
  );
  const candidates = mp4s.length > 0 ? mp4s : withUrl;
  candidates.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return candidates[0] ?? null;
}

function pickBestAdaptivePair(adaptiveFormats: InnertubeFormat[]): {
  video: InnertubeFormat;
  audio: InnertubeFormat | null;
} | null {
  const withUrl = adaptiveFormats.filter(
    (f) => typeof f.url === "string" && f.url.length > 0
  );
  if (withUrl.length === 0) return null;

  const avcVideos = withUrl.filter((f) => {
    const mime = (f.mimeType ?? "").toLowerCase();
    return mime.includes("video/mp4") && mime.includes("avc1");
  });
  const mp4Videos =
    avcVideos.length > 0
      ? avcVideos
      : withUrl.filter((f) =>
          (f.mimeType ?? "").toLowerCase().includes("video/mp4")
        );
  if (mp4Videos.length === 0) return null;

  // Prefer <= 720p H.264 for crisp quality without excessive decoding overhead
  const upTo720 = mp4Videos.filter((f) => (f.height ?? 0) <= 720);
  const videoPool = upTo720.length > 0 ? upTo720 : mp4Videos;
  videoPool.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const bestVideo = videoPool[0];
  if (!bestVideo) return null;

  const mp4Audios = withUrl.filter((f) =>
    (f.mimeType ?? "").toLowerCase().includes("audio/mp4")
  );
  mp4Audios.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  const bestAudio = mp4Audios[0] ?? null;

  return { video: bestVideo, audio: bestAudio };
}

async function probeRangeUrl(
  url: string,
  userAgent: string,
  fallbackLength?: string
): Promise<{ ok: boolean; status: number; contentLength: number | null }> {
  const probe = await fetch(url, {
    headers: {
      Range: "bytes=0-1023",
      "User-Agent": userAgent,
    },
    cache: "no-store",
  });

  if (!probe.ok && probe.status !== 206) {
    return { ok: false, status: probe.status, contentLength: null };
  }

  let contentLength: number | null = fallbackLength
    ? Number(fallbackLength)
    : null;
  const contentRange = probe.headers.get("content-range");
  if (!contentLength && contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) contentLength = Number(match[1]);
  }

  return {
    ok: true,
    status: probe.status,
    contentLength:
      contentLength && Number.isFinite(contentLength) ? contentLength : null,
  };
}

async function resolveYouTubeStream(
  videoId: string,
  forceRefresh = false
): Promise<StreamCacheEntry> {
  const cached = STREAM_CACHE.get(videoId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  let lastReason = "YouTube did not return a playable MP4 stream.";

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const res = await fetch(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": client.userAgent,
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: client.clientName,
                clientVersion: client.clientVersion,
                ...(client.androidSdkVersion
                  ? { androidSdkVersion: client.androidSdkVersion }
                  : {}),
                ...(client.deviceMake ? { deviceMake: client.deviceMake } : {}),
                ...(client.deviceModel
                  ? { deviceModel: client.deviceModel }
                  : {}),
                hl: "en",
                gl: "US",
              },
            },
            videoId,
          }),
          cache: "no-store",
        }
      );

      if (!res.ok) continue;
      const data = (await res.json()) as {
        playabilityStatus?: { status?: string; reason?: string };
        streamingData?: {
          formats?: InnertubeFormat[];
          adaptiveFormats?: InnertubeFormat[];
        };
      };

      if (data.playabilityStatus?.reason) {
        lastReason = data.playabilityStatus.reason;
      }

      // 1. Prefer progressive video+audio MP4 format
      const progressive = pickBestProgressiveFormat(
        data.streamingData?.formats ?? []
      );
      if (progressive?.url) {
        const probed = await probeRangeUrl(
          progressive.url,
          client.userAgent,
          progressive.contentLength
        );
        if (probed.ok) {
          const entry: StreamCacheEntry = {
            mode: "progressive",
            videoUrl: progressive.url,
            audioUrl: null,
            userAgent: client.userAgent,
            mimeType: (progressive.mimeType ?? "video/mp4")
              .split(";")[0]
              .trim(),
            audioMimeType: null,
            qualityLabel: progressive.qualityLabel ?? "360p",
            videoContentLength: probed.contentLength,
            audioContentLength: null,
            expiresAt: extractExpireTimestamp(progressive.url),
          };
          STREAM_CACHE.set(videoId, entry);
          return entry;
        }
        lastReason = `Upstream stream rejected request (HTTP ${probed.status}).`;
      }

      // 2. Fallback to adaptive video + audio pair (e.g., IOS client)
      const adaptive = pickBestAdaptivePair(
        data.streamingData?.adaptiveFormats ?? []
      );
      if (adaptive?.video.url) {
        const videoProbe = await probeRangeUrl(
          adaptive.video.url,
          client.userAgent,
          adaptive.video.contentLength
        );
        if (videoProbe.ok) {
          let audioUrl: string | null = null;
          let audioMimeType: string | null = null;
          let audioContentLength: number | null = null;

          if (adaptive.audio?.url) {
            const audioProbe = await probeRangeUrl(
              adaptive.audio.url,
              client.userAgent,
              adaptive.audio.contentLength
            );
            if (audioProbe.ok) {
              audioUrl = adaptive.audio.url;
              audioMimeType = (adaptive.audio.mimeType ?? "audio/mp4")
                .split(";")[0]
                .trim();
              audioContentLength = audioProbe.contentLength;
            }
          }

          const entry: StreamCacheEntry = {
            mode: audioUrl ? "adaptive" : "progressive",
            videoUrl: adaptive.video.url,
            audioUrl,
            userAgent: client.userAgent,
            mimeType: (adaptive.video.mimeType ?? "video/mp4")
              .split(";")[0]
              .trim(),
            audioMimeType,
            qualityLabel: adaptive.video.qualityLabel ?? "720p",
            videoContentLength: videoProbe.contentLength,
            audioContentLength,
            expiresAt: extractExpireTimestamp(adaptive.video.url),
          };
          STREAM_CACHE.set(videoId, entry);
          return entry;
        }
        lastReason = `Upstream stream rejected request (HTTP ${videoProbe.status}).`;
      }
    } catch (err) {
      lastReason =
        err instanceof Error ? err.message : "Failed to query YouTube stream.";
    }
  }

  if (/not a bot|sign in|login_required/i.test(lastReason)) {
    throw new Error(
      "YouTube blocked direct stream download from this cloud server IP. Attach a local MP4/MOV file below to export this short with burned-in captions, or run ClipForge locally."
    );
  }

  throw new Error(lastReason);
}

function parseClampedRange(
  rangeHeader: string | null,
  totalLength: number | null
): string {
  if (!rangeHeader) {
    const end =
      totalLength !== null
        ? Math.min(MAX_CHUNK_BYTES - 1, totalLength - 1)
        : MAX_CHUNK_BYTES - 1;
    return `bytes=0-${Math.max(0, end)}`;
  }

  const m = rangeHeader.match(/bytes=(\d+)-(\d*)/i);
  if (!m) {
    return rangeHeader;
  }

  const start = Number(m[1]);
  const requestedEnd = m[2] ? Number(m[2]) : null;
  let end =
    requestedEnd !== null && !Number.isNaN(requestedEnd)
      ? Math.min(requestedEnd, start + MAX_CHUNK_BYTES - 1)
      : start + MAX_CHUNK_BYTES - 1;

  if (totalLength !== null && totalLength > 0) {
    end = Math.min(end, totalLength - 1);
  }

  if (end < start) {
    end = start;
  }

  return `bytes=${start}-${end}`;
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")?.trim() ?? "";
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json(
      { error: "Valid 11-character YouTube videoId is required." },
      { status: 400 }
    );
  }

  const isProbe = req.nextUrl.searchParams.get("probe") === "1";
  const kind = req.nextUrl.searchParams.get("kind") === "audio" ? "audio" : "video";

  try {
    let streamInfo = await resolveYouTubeStream(videoId);

    if (isProbe) {
      return NextResponse.json({
        ok: true,
        videoId,
        mode: streamInfo.mode,
        mimeType: streamInfo.mimeType,
        audioMimeType: streamInfo.audioMimeType,
        qualityLabel: streamInfo.qualityLabel,
        contentLength: streamInfo.videoContentLength,
        audioContentLength: streamInfo.audioContentLength,
      });
    }

    const pickTarget = (info: StreamCacheEntry) => {
      if (kind === "audio") {
        if (!info.audioUrl) return null;
        return {
          targetUrl: info.audioUrl,
          targetMime: info.audioMimeType ?? "audio/mp4",
          targetLength: info.audioContentLength,
        };
      }
      return {
        targetUrl: info.videoUrl,
        targetMime: info.mimeType,
        targetLength: info.videoContentLength,
      };
    };

    let target = pickTarget(streamInfo);
    if (!target) {
      return NextResponse.json(
        { error: "Separate audio stream is not needed for this video." },
        { status: 404 }
      );
    }

    const rangeHeader = req.headers.get("range");
    const effectiveRange = parseClampedRange(rangeHeader, target.targetLength);

    let upstream = await fetch(target.targetUrl, {
      headers: {
        Range: effectiveRange,
        "User-Agent": streamInfo.userAgent,
      },
      cache: "no-store",
    });

    if (upstream.status === 403 || upstream.status === 410) {
      STREAM_CACHE.delete(videoId);
      streamInfo = await resolveYouTubeStream(videoId, true);
      target = pickTarget(streamInfo);
      if (!target) {
        return NextResponse.json(
          { error: "Stream unavailable after refresh." },
          { status: 502 }
        );
      }
      const retryRange = parseClampedRange(rangeHeader, target.targetLength);
      upstream = await fetch(target.targetUrl, {
        headers: {
          Range: retryRange,
          "User-Agent": streamInfo.userAgent,
        },
        cache: "no-store",
      });
    }

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        {
          error: `YouTube media server returned HTTP ${upstream.status}.`,
        },
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") || target.targetMime
    );
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=300");

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) {
      headers.set("Content-Range", contentRange);
    }

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unable to stream this YouTube video.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function HEAD(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")?.trim() ?? "";
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return new NextResponse(null, { status: 400 });
  }
  const kind = req.nextUrl.searchParams.get("kind") === "audio" ? "audio" : "video";

  try {
    const streamInfo = await resolveYouTubeStream(videoId);
    const headers = new Headers();
    const mime =
      kind === "audio"
        ? streamInfo.audioMimeType ?? "audio/mp4"
        : streamInfo.mimeType;
    const len =
      kind === "audio"
        ? streamInfo.audioContentLength
        : streamInfo.videoContentLength;
    headers.set("Content-Type", mime);
    headers.set("Accept-Ranges", "bytes");
    if (len !== null) {
      headers.set("Content-Length", String(len));
    }
    return new NextResponse(null, { status: 200, headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}

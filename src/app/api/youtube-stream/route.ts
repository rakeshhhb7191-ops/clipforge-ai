import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface StreamCacheEntry {
  url: string;
  userAgent: string;
  mimeType: string;
  qualityLabel: string;
  contentLength: number | null;
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
      // Refresh 2 minutes before YouTube expiry
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

  // Prefer highest resolution progressive MP4 (itag 22 = 720p, itag 18 = 360p/240p)
  candidates.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return candidates[0] ?? null;
}

async function resolveYouTubeStream(
  videoId: string,
  forceRefresh = false
): Promise<StreamCacheEntry> {
  const cached = STREAM_CACHE.get(videoId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  let lastReason = "YouTube did not return a playable progressive MP4 stream.";

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
        streamingData?: { formats?: InnertubeFormat[] };
      };

      if (data.playabilityStatus?.reason) {
        lastReason = data.playabilityStatus.reason;
      }

      const formats = data.streamingData?.formats ?? [];
      const best = pickBestProgressiveFormat(formats);
      if (!best?.url) continue;

      // Verify byte-range accessibility once before caching
      const probe = await fetch(best.url, {
        headers: {
          Range: "bytes=0-1023",
          "User-Agent": client.userAgent,
        },
        cache: "no-store",
      });

      if (!probe.ok && probe.status !== 206) {
        lastReason = `Upstream stream rejected request (HTTP ${probe.status}).`;
        continue;
      }

      let contentLength: number | null = best.contentLength
        ? Number(best.contentLength)
        : null;
      const contentRange = probe.headers.get("content-range");
      if (!contentLength && contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) contentLength = Number(match[1]);
      }

      const entry: StreamCacheEntry = {
        url: best.url,
        userAgent: client.userAgent,
        mimeType: (best.mimeType ?? "video/mp4").split(";")[0].trim(),
        qualityLabel: best.qualityLabel ?? "360p",
        contentLength:
          contentLength && Number.isFinite(contentLength)
            ? contentLength
            : null,
        expiresAt: extractExpireTimestamp(best.url),
      };

      STREAM_CACHE.set(videoId, entry);
      return entry;
    } catch (err) {
      lastReason =
        err instanceof Error ? err.message : "Failed to query YouTube stream.";
    }
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

  try {
    let streamInfo = await resolveYouTubeStream(videoId);

    if (isProbe) {
      return NextResponse.json({
        ok: true,
        videoId,
        mimeType: streamInfo.mimeType,
        qualityLabel: streamInfo.qualityLabel,
        contentLength: streamInfo.contentLength,
      });
    }

    const rangeHeader = req.headers.get("range");
    const effectiveRange = parseClampedRange(
      rangeHeader,
      streamInfo.contentLength
    );

    let upstream = await fetch(streamInfo.url, {
      headers: {
        Range: effectiveRange,
        "User-Agent": streamInfo.userAgent,
      },
      cache: "no-store",
    });

    // Retry once with refreshed URL if cached URL expired or returned 403
    if (upstream.status === 403 || upstream.status === 410) {
      STREAM_CACHE.delete(videoId);
      streamInfo = await resolveYouTubeStream(videoId, true);
      const retryRange = parseClampedRange(
        rangeHeader,
        streamInfo.contentLength
      );
      upstream = await fetch(streamInfo.url, {
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
      upstream.headers.get("content-type") || streamInfo.mimeType
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

  try {
    const streamInfo = await resolveYouTubeStream(videoId);
    const headers = new Headers();
    headers.set("Content-Type", streamInfo.mimeType);
    headers.set("Accept-Ranges", "bytes");
    if (streamInfo.contentLength !== null) {
      headers.set("Content-Length", String(streamInfo.contentLength));
    }
    return new NextResponse(null, { status: 200, headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}

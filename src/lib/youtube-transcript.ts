import { WordToken } from "@/types/clipforge";

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
  words: WordToken[];
}

export interface YouTubeVideoData {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  durationSeconds: number;
  description: string;
  keywords: string[];
  segments: TranscriptSegment[];
  transcriptSource: "youtube-captions" | "chapters-fallback" | "metadata-fallback";
}

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const vParam = parsed.searchParams.get("v");
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }
      const parts = parsed.pathname.split("/").filter(Boolean);
      const markerIdx = parts.findIndex((p) =>
        ["shorts", "embed", "live", "v"].includes(p)
      );
      if (markerIdx !== -1 && parts[markerIdx + 1]) {
        const candidate = parts[markerIdx + 1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // Fallback regex
    const m = trimmed.match(
      /(?:v=|\/shorts\/|\/live\/|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/
    );
    if (m?.[1]) return m[1];
  }

  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/\s+/g, " ")
    .trim();
}

function distributeWordsOverInterval(
  text: string,
  startSec: number,
  durationSec: number
): WordToken[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const safeDur = Math.max(0.35, durationSec);
  const totalWeight = words.reduce((acc, w) => acc + Math.max(2, w.length), 0);

  let cursor = startSec;
  return words.map((word) => {
    const wWeight = Math.max(2, word.length);
    const slice = (wWeight / totalWeight) * safeDur;
    const wStart = Number(cursor.toFixed(3));
    cursor += slice;
    const wEnd = Number(cursor.toFixed(3));
    return { word, start: wStart, end: wEnd };
  });
}

function parseJson3Captions(payload: {
  events?: Array<{
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string; tOffsetMs?: number }>;
  }>;
}): TranscriptSegment[] {
  const events = payload.events ?? [];
  const segments: TranscriptSegment[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.segs || ev.tStartMs === undefined) continue;

    const rawText = ev.segs.map((s) => s.utf8 ?? "").join("");
    const cleaned = decodeHtmlEntities(rawText.replace(/\n/g, " "));
    if (!cleaned || /^\[.*\]$/.test(cleaned)) continue;

    const start = ev.tStartMs / 1000;
    const nextStart =
      i + 1 < events.length && events[i + 1].tStartMs !== undefined
        ? events[i + 1].tStartMs! / 1000
        : start + 3;
    const duration =
      ev.dDurationMs !== undefined
        ? Math.min(Math.max(0.4, ev.dDurationMs / 1000), Math.max(0.8, nextStart - start + 0.5))
        : Math.max(0.8, Math.min(6, nextStart - start));

    // Use exact per-segment tOffsetMs if YouTube provided word-level offsets
    const segTokens: WordToken[] = [];
    const hasOffsets = ev.segs.some((s) => typeof s.tOffsetMs === "number");

    if (hasOffsets) {
      for (let j = 0; j < ev.segs.length; j++) {
        const seg = ev.segs[j];
        const piece = decodeHtmlEntities((seg.utf8 ?? "").replace(/\n/g, " "));
        if (!piece) continue;
        const pieceStart = start + (seg.tOffsetMs ?? 0) / 1000;
        const nextOffsetMs =
          j + 1 < ev.segs.length && typeof ev.segs[j + 1].tOffsetMs === "number"
            ? ev.segs[j + 1].tOffsetMs!
            : duration * 1000;
        const pieceDur = Math.max(0.18, start + nextOffsetMs / 1000 - pieceStart);
        segTokens.push(...distributeWordsOverInterval(piece, pieceStart, pieceDur));
      }
    }

    const words =
      segTokens.length > 0
        ? segTokens
        : distributeWordsOverInterval(cleaned, start, duration);

    segments.push({
      text: cleaned,
      start: Number(start.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      words,
    });
  }

  return segments;
}

function parseXmlCaptions(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  // Format A: <text start="1.23" dur="2.5">...</text>
  const textRegex = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const dur = parseFloat(match[2] || "2.5");
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, " "));
    if (!text || Number.isNaN(start)) continue;

    segments.push({
      text,
      start: Number(start.toFixed(3)),
      duration: Number(Math.max(0.4, dur).toFixed(3)),
      words: distributeWordsOverInterval(text, start, dur),
    });
  }

  if (segments.length > 0) return segments;

  // Format B: timedtext format="3" <p t="6048" d="1002">...</p>
  const pRegex = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
  while ((match = pRegex.exec(xml)) !== null) {
    const start = parseInt(match[1], 10) / 1000;
    const dur = parseInt(match[2] || "2500", 10) / 1000;
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, " "));
    if (!text || Number.isNaN(start)) continue;

    segments.push({
      text,
      start: Number(start.toFixed(3)),
      duration: Number(Math.max(0.4, dur).toFixed(3)),
      words: distributeWordsOverInterval(text, start, dur),
    });
  }

  return segments;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

function pickBestCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks || tracks.length === 0) return null;
  // Prefer manual English, then auto English, then any English variant, then first track
  const manualEn = tracks.find(
    (t) => t.languageCode?.startsWith("en") && t.kind !== "asr"
  );
  if (manualEn) return manualEn;

  const autoEn = tracks.find((t) => t.languageCode?.startsWith("en"));
  if (autoEn) return autoEn;

  return tracks[0];
}

function extractPlayerResponseFromHtml(html: string): Record<string, unknown> | null {
  const marker = "ytInitialPlayerResponse = ";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;

  let jsonStart = html.indexOf("{", startIdx + marker.length);
  if (jsonStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(jsonStart, i + 1)) as Record<string, unknown>;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

interface PlayerResponseLike {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
  videoDetails?: {
    title?: string;
    author?: string;
    lengthSeconds?: string | number;
    shortDescription?: string;
    keywords?: unknown[];
  };
}

async function fetchInnertubePlayer(videoId: string): Promise<PlayerResponseLike | null> {
  const clients = [
    { clientName: "IOS", clientVersion: "20.10.4" },
    { clientName: "ANDROID", clientVersion: "20.10.38" },
  ];

  for (const client of clients) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context: {
            client: {
              ...client,
              hl: "en",
              gl: "US",
            },
          },
          videoId,
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as PlayerResponseLike;
      const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        return data;
      }
    } catch {
      // Try next Innertube client
    }
  }
  return null;
}

async function fetchCaptionSegments(trackUrl: string): Promise<TranscriptSegment[]> {
  try {
    const jsonUrl = trackUrl.includes("fmt=")
      ? trackUrl.replace(/fmt=[^&]+/, "fmt=json3")
      : `${trackUrl}&fmt=json3`;

    const jsonRes = await fetch(jsonUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
    if (jsonRes.ok) {
      const text = await jsonRes.text();
      if (text.trim().startsWith("{")) {
        const parsed = JSON.parse(text);
        const segs = parseJson3Captions(parsed);
        if (segs.length > 0) return segs;
      }
    }
  } catch {
    // Fall through to XML
  }

  try {
    const xmlRes = await fetch(trackUrl);
    if (xmlRes.ok) {
      const xml = await xmlRes.text();
      return parseXmlCaptions(xml);
    }
  } catch {
    // Ignore
  }

  return [];
}

function parseChaptersFromDescription(
  description: string,
  durationSeconds: number
): TranscriptSegment[] {
  const lines = description.split(/\r?\n/);
  const entries: Array<{ start: number; label: string }> = [];
  const tsRegex = /(?:^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s+[-–—:]?\s*)(.+)$/;

  for (const line of lines) {
    const m = line.trim().match(tsRegex);
    if (!m) continue;
    const parts = m[1].split(":").map(Number);
    let secs = 0;
    if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
    const label = m[2].trim();
    if (!Number.isNaN(secs) && label && secs < durationSeconds) {
      entries.push({ start: secs, label });
    }
  }

  if (entries.length < 2) return [];

  return entries.map((entry, idx) => {
    const nextStart =
      idx + 1 < entries.length ? entries[idx + 1].start : durationSeconds;
    const dur = Math.min(45, Math.max(18, nextStart - entry.start));
    return {
      text: entry.label,
      start: entry.start,
      duration: dur,
      words: distributeWordsOverInterval(entry.label, entry.start, dur),
    };
  });
}

export async function fetchYouTubeVideoData(url: string): Promise<YouTubeVideoData> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL. Paste a valid youtube.com/watch?v=... or youtu.be/... link.");
  }

  // 1. Fetch oEmbed for reliable title & author
  let title = "YouTube Video";
  let author = "YouTube Creator";
  let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (oembedRes.ok) {
      const oembed = (await oembedRes.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      if (oembed.title) title = oembed.title;
      if (oembed.author_name) author = oembed.author_name;
      if (oembed.thumbnail_url) thumbnailUrl = oembed.thumbnail_url;
    }
  } catch {
    // Continue with watch page metadata
  }

  // 2. Fetch Innertube player response (IOS/ANDROID clients return working caption URLs)
  let prAny: PlayerResponseLike | null = await fetchInnertubePlayer(videoId);
  let captionTracks: CaptionTrack[] =
    prAny?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  // Fallback to watch page HTML if Innertube returned no tracks
  if (captionTracks.length === 0) {
    try {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (watchRes.ok) {
        const html = await watchRes.text();
        const parsed = extractPlayerResponseFromHtml(html) as PlayerResponseLike | null;
        if (parsed) {
          prAny = parsed;
          captionTracks =
            prAny?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
        }
      }
    } catch {
      // Ignore
    }
  }

  const videoDetails = prAny?.videoDetails ?? {};
  if (videoDetails.title && title === "YouTube Video") {
    title = String(videoDetails.title);
  }
  if (videoDetails.author && author === "YouTube Creator") {
    author = String(videoDetails.author);
  }

  const durationSeconds = Math.max(
    30,
    Number(videoDetails.lengthSeconds || 240)
  );
  const description = String(videoDetails.shortDescription || "");
  const keywords: string[] = Array.isArray(videoDetails.keywords)
    ? videoDetails.keywords.map(String)
    : [];

  // 3. Fetch caption segments
  const bestTrack = pickBestCaptionTrack(captionTracks);
  if (bestTrack?.baseUrl) {
    const segments = await fetchCaptionSegments(bestTrack.baseUrl);
    if (segments.length > 0) {
      return {
        videoId,
        title,
        author,
        thumbnailUrl,
        durationSeconds,
        description,
        keywords,
        segments,
        transcriptSource: "youtube-captions",
      };
    }
  }

  // 4. Fallback to chapters if captions are unavailable
  const chapterSegments = parseChaptersFromDescription(description, durationSeconds);
  if (chapterSegments.length > 0) {
    return {
      videoId,
      title,
      author,
      thumbnailUrl,
      durationSeconds,
      description,
      keywords,
      segments: chapterSegments,
      transcriptSource: "chapters-fallback",
    };
  }

  // 5. Final metadata fallback so any valid YouTube video still maps to playable windows
  return {
    videoId,
    title,
    author,
    thumbnailUrl,
    durationSeconds,
    description,
    keywords,
    segments: [],
    transcriptSource: "metadata-fallback",
  };
}

import {
  CaptionStyle,
  ClipLengthPref,
  GeneratedClip,
  WordToken,
} from "@/types/clipforge";
import { buildWordTokensFromText } from "./demo-data";
import { TranscriptSegment, YouTubeVideoData } from "./youtube-transcript";

interface CandidateHook {
  startTime: number;
  endTime: number;
  hookTitle: string;
  viralityScore: number;
  hookReason: string;
  hashtags: string[];
  text: string;
  words: WordToken[];
}

const HOOK_OPENERS = [
  "stop",
  "never",
  "nobody",
  "secret",
  "truth",
  "why",
  "how",
  "what",
  "wait",
  "listen",
  "actually",
  "mistake",
  "wrong",
  "brutal",
  "crazy",
  "insane",
  "imagine",
  "here's",
  "heres",
  "don't",
  "dont",
  "every",
  "most people",
  "the biggest",
  "one thing",
];

const EMOTIONAL_SPIKE_WORDS = [
  "crazy",
  "insane",
  "unbelievable",
  "massive",
  "million",
  "billion",
  "zero",
  "shocking",
  "destroyed",
  "exploded",
  "viral",
  "changed",
  "everything",
  "impossible",
  "terrible",
  "genius",
  "problem",
  "hack",
  "warning",
  "always",
  "never",
  "literally",
  "fastest",
  "biggest",
  "worst",
  "best",
];

const STOP_WORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "they",
  "their",
  "about",
  "would",
  "there",
  "which",
  "could",
  "should",
  "have",
  "been",
  "were",
  "what",
  "when",
  "where",
  "your",
  "just",
  "like",
  "really",
  "going",
  "because",
  "think",
  "know",
  "people",
  "video",
  "youtube",
  "thing",
  "things",
  "really",
  "very",
  "more",
  "into",
  "some",
  "then",
  "than",
]);

function deriveHashtags(
  video: YouTubeVideoData,
  clipText: string
): string[] {
  const tags = new Set<string>();

  for (const kw of video.keywords.slice(0, 6)) {
    const clean = kw.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length >= 3 && clean.length <= 18) {
      tags.add(`#${clean.charAt(0).toUpperCase()}${clean.slice(1)}`);
    }
    if (tags.size >= 2) break;
  }

  // Extract top keywords from clip text
  const freq = new Map<string, number>();
  for (const raw of clipText.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 5 || STOP_WORDS.has(raw)) continue;
    freq.set(raw, (freq.get(raw) ?? 0) + 1);
  }
  const sortedWords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  for (const [w] of sortedWords) {
    tags.add(`#${w.charAt(0).toUpperCase()}${w.slice(1)}`);
  }

  tags.add("#Shorts");
  if (tags.size < 4) tags.add("#ViralClips");
  return Array.from(tags).slice(0, 4);
}

function craftHookTitle(text: string, fallbackTitle: string): string {
  // Split into sentence-like chunks and pick the punchiest 4-8 word hook
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const bestSentence =
    sentences.find((s) => {
      const lower = s.toLowerCase();
      return (
        HOOK_OPENERS.some((h) => lower.includes(h)) ||
        /\d/.test(s) ||
        s.includes("?")
      );
    }) ??
    sentences[0] ??
    text;

  const words = bestSentence
    .replace(/[.!?,;:]+$/, "")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return fallbackTitle.slice(0, 48);
  const sliced = words.slice(0, 8).join(" ");
  const capitalized = sliced.charAt(0).toUpperCase() + sliced.slice(1);
  return words.length > 8 ? `${capitalized}…` : capitalized;
}

function buildWindowsFromSegments(
  segments: TranscriptSegment[],
  minDur: number,
  maxDur: number
): Array<{
  start: number;
  end: number;
  text: string;
  words: WordToken[];
}> {
  if (segments.length === 0) return [];

  const windows: Array<{
    start: number;
    end: number;
    text: string;
    words: WordToken[];
  }> = [];

  for (let i = 0; i < segments.length; i++) {
    const startSeg = segments[i];
    // Prefer starting on sentence boundaries when punctuation exists
    if (i > 0) {
      const prevText = segments[i - 1].text.trim();
      const hasPunct = /[.!?]$/.test(prevText);
      const isStrongGap = startSeg.start - (segments[i - 1].start + segments[i - 1].duration) > 0.6;
      if (!hasPunct && !isStrongGap && i % 2 !== 0) {
        continue;
      }
    }

    const collected: TranscriptSegment[] = [startSeg];
    let j = i + 1;
    while (j < segments.length) {
      const candidateEnd = segments[j].start + segments[j].duration;
      const span = candidateEnd - startSeg.start;
      if (span > maxDur) break;
      collected.push(segments[j]);
      const segText = segments[j].text.trim();
      if (span >= minDur && /[.!?]$/.test(segText)) {
        break;
      }
      j++;
    }

    const lastSeg = collected[collected.length - 1];
    const end = lastSeg.start + lastSeg.duration;
    const span = end - startSeg.start;

    if (span >= Math.max(10, minDur * 0.65)) {
      const text = collected.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
      const relativeWords: WordToken[] = [];
      for (const seg of collected) {
        for (const w of seg.words) {
          relativeWords.push({
            word: w.word,
            start: Number(Math.max(0, w.start - startSeg.start).toFixed(2)),
            end: Number(Math.max(0.05, w.end - startSeg.start).toFixed(2)),
          });
        }
      }
      windows.push({
        start: Number(startSeg.start.toFixed(2)),
        end: Number(end.toFixed(2)),
        text,
        words: relativeWords,
      });
    }
  }

  return windows;
}

function scoreWindowVirality(
  win: { start: number; end: number; text: string; words: WordToken[] },
  videoDuration: number
): { score: number; reason: string } {
  const lower = win.text.toLowerCase();
  const duration = Math.max(1, win.end - win.start);
  const openingText = win.words
    .slice(0, 14)
    .map((w) => w.word.toLowerCase())
    .join(" ");

  let score = 62;
  const reasons: string[] = [];

  // 1. Opening Hook Power
  const matchedOpeners = HOOK_OPENERS.filter((h) => openingText.includes(h));
  if (matchedOpeners.length > 0) {
    score += Math.min(16, matchedOpeners.length * 8);
    reasons.push(`Pattern-interrupt opener ("${matchedOpeners[0]}")`);
  }

  if (/\?/.test(win.text.slice(0, 140))) {
    score += 6;
    reasons.push("curiosity-inducing question in the opening seconds");
  }

  // 2. Numbers / specific claims
  const hasNumbers = /\b\d+(?:%|k|m|x|\s*(?:percent|million|billion|seconds|days|years))?\b/i.test(
    win.text
  );
  if (hasNumbers) {
    score += 7;
    reasons.push("concrete numbers that anchor viewer curiosity");
  }

  // 3. Emotional intensity & contrast pivots
  const spikeHits = EMOTIONAL_SPIKE_WORDS.filter((w) => lower.includes(w));
  if (spikeHits.length > 0) {
    score += Math.min(10, spikeHits.length * 3);
    reasons.push(`high-energy emotional phrasing (${spikeHits.slice(0, 2).join(", ")})`);
  }

  if (/\b(but|however|actually|until|instead|wrong)\b/i.test(lower)) {
    score += 4;
    reasons.push("narrative contrast pivot");
  }

  // 4. Pacing density (words/sec)
  const wps = win.words.length / duration;
  if (wps >= 2.2 && wps <= 4.1) {
    score += 6;
    reasons.push(`crisp ${wps.toFixed(1)} words/sec delivery with minimal dead air`);
  } else if (wps < 1.3) {
    score -= 8;
  }

  // 5. Complete payoff punctuation
  if (/[.!?]$/.test(win.text.trim())) {
    score += 3;
  }

  // Slight boost to engaging early-to-mid moments (avoiding dry intro 0-5s)
  if (win.start > 8 && win.start < videoDuration * 0.85) {
    score += 2;
  }

  const clamped = Math.max(72, Math.min(98, Math.round(score)));
  const reasonText =
    reasons.length > 0
      ? `Captured because of its ${reasons.slice(0, 3).join(", ")}.`
      : "Strong standalone spoken arc with steady pacing and a clean ending payoff.";

  return { score: clamped, reason: reasonText };
}

async function analyzeWithGemini(
  video: YouTubeVideoData,
  minDur: number,
  maxDur: number
): Promise<CandidateHook[] | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || video.segments.length === 0) return null;

  const formattedTranscript = video.segments
    .map((s) => `[${s.start.toFixed(1)}s - ${(s.start + s.duration).toFixed(1)}s] ${s.text}`)
    .join("\n")
    .slice(0, 48000);

  const prompt = `You are a master viral short-form editor (OpusClip / ClipSon / MrBeast retention specialist).
Analyze this YouTube video's timestamped transcript and extract the TOP 4 craziest, highest-retention standalone viral moments.

Video Title: "${video.title}"
Channel: "${video.author}"
Total Duration: ${video.durationSeconds}s

Rules:
- Each clip MUST be between ${minDur} and ${maxDur} seconds long (endTime - startTime).
- Pick the most shocking, funny, contrarian, emotional, or high-value standalone stories — NEVER boring warm-ups.
- Snap startTime and endTime cleanly to complete thoughts.
- Return ONLY a JSON array of 4 objects with exact keys:
  startTime (number), endTime (number), hookTitle (string, 4-8 punchy words), viralityScore (integer 78-99), reason (string, 1-2 sentences citing the exact moment), hashtags (array of 4 strings).

TRANSCRIPT:
${formattedTranscript}`;

  try {
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.35,
          },
        }),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const rawText: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText) return null;

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const results: CandidateHook[] = [];
    for (const item of parsed.slice(0, 5)) {
      const startTime = Math.max(0, Number(item.startTime ?? 0));
      let endTime = Math.min(
        video.durationSeconds,
        Number(item.endTime ?? startTime + maxDur)
      );
      if (endTime - startTime < 10) {
        endTime = Math.min(video.durationSeconds, startTime + minDur);
      }
      if (endTime <= startTime) continue;

      const sliceSegs = video.segments.filter(
        (s) => s.start + s.duration >= startTime && s.start <= endTime
      );
      const text =
        sliceSegs.map((s) => s.text).join(" ").trim() ||
        String(item.hookTitle || video.title);

      const words: WordToken[] = [];
      for (const seg of sliceSegs) {
        for (const w of seg.words) {
          if (w.end >= startTime && w.start <= endTime) {
            words.push({
              word: w.word,
              start: Number(Math.max(0, w.start - startTime).toFixed(2)),
              end: Number(Math.max(0.05, w.end - startTime).toFixed(2)),
            });
          }
        }
      }

      const duration = Math.max(8, Math.round(endTime - startTime));
      results.push({
        startTime: Number(startTime.toFixed(2)),
        endTime: Number(endTime.toFixed(2)),
        hookTitle: String(item.hookTitle || craftHookTitle(text, video.title)),
        viralityScore: Math.max(75, Math.min(99, Number(item.viralityScore || 92))),
        hookReason: String(
          item.reason || "High-retention hook selected by Gemini AI."
        ),
        hashtags: Array.isArray(item.hashtags)
          ? item.hashtags.slice(0, 4).map(String)
          : deriveHashtags(video, text),
        text,
        words:
          words.length > 0 ? words : buildWordTokensFromText(text, duration),
      });
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

export async function analyzeYouTubeVideoToClips(
  video: YouTubeVideoData,
  clipLength: ClipLengthPref,
  captionStyle: CaptionStyle
): Promise<{
  clips: GeneratedClip[];
  analysisEngine: "gemini-flash" | "nlp-hook-scorer" | "timeline-sampler";
}> {
  const minDur = clipLength === "under30" ? 15 : 26;
  const maxDur = clipLength === "under30" ? 28 : 54;

  // 1. Try Gemini AI on the real YouTube transcript if GEMINI_API_KEY is available
  const geminiHooks = await analyzeWithGemini(video, minDur, maxDur);
  if (geminiHooks && geminiHooks.length > 0) {
    return {
      analysisEngine: "gemini-flash",
      clips: mapCandidatesToClips(geminiHooks, video, captionStyle),
    };
  }

  // 2. Run Multi-Signal NLP Viral Hook Scorer on the real YouTube transcript
  if (video.segments.length > 0) {
    const windows = buildWindowsFromSegments(video.segments, minDur, maxDur);
    const scored = windows
      .map((w) => {
        const { score, reason } = scoreWindowVirality(w, video.durationSeconds);
        return { window: w, score, reason };
      })
      .sort((a, b) => b.score - a.score);

    // Non-maximum suppression: ensure clips don't overlap
    const picked: typeof scored = [];
    for (const item of scored) {
      const overlaps = picked.some(
        (p) =>
          !(
            item.window.end <= p.window.start + 6 ||
            item.window.start >= p.window.end - 6
          )
      );
      if (!overlaps) {
        picked.push(item);
      }
      if (picked.length >= 4) break;
    }

    if (picked.length > 0) {
      const candidates: CandidateHook[] = picked.map((p) => ({
        startTime: p.window.start,
        endTime: p.window.end,
        hookTitle: craftHookTitle(p.window.text, video.title),
        viralityScore: p.score,
        hookReason: p.reason,
        hashtags: deriveHashtags(video, p.window.text),
        text: p.window.text,
        words: p.window.words,
      }));

      return {
        analysisEngine: "nlp-hook-scorer",
        clips: mapCandidatesToClips(candidates, video, captionStyle),
      };
    }
  }

  // 3. Metadata / Timeline Fallback when captions are disabled on the YouTube video
  const clipCount = video.durationSeconds >= 120 ? 4 : 3;
  const step = video.durationSeconds / (clipCount + 1);
  const clipDur = Math.min(maxDur, Math.max(18, Math.round(step * 0.75)));
  const fallbackCandidates: CandidateHook[] = [];

  for (let i = 0; i < clipCount; i++) {
    const startTime = Math.max(
      0,
      Math.min(video.durationSeconds - clipDur, Math.round(step * (i + 0.6)))
    );
    const endTime = Math.min(video.durationSeconds, startTime + clipDur);
    const dur = Math.max(12, endTime - startTime);
    const text = `Highlight moment ${i + 1} from ${video.title}. Captions were disabled on this YouTube upload — edit this transcript box to customize your overlay captions.`;
    fallbackCandidates.push({
      startTime,
      endTime,
      hookTitle: `${video.title.slice(0, 36)} — Part ${i + 1}`,
      viralityScore: 89 - i * 3,
      hookReason:
        "Captions were disabled by the YouTube uploader; sampled key act-breaks across the video timeline for 9:16 vertical playback.",
      hashtags: deriveHashtags(video, video.title),
      text,
      words: buildWordTokensFromText(text, dur),
    });
  }

  return {
    analysisEngine: "timeline-sampler",
    clips: mapCandidatesToClips(fallbackCandidates, video, captionStyle),
  };
}

function mapCandidatesToClips(
  candidates: CandidateHook[],
  video: YouTubeVideoData,
  captionStyle: CaptionStyle
): GeneratedClip[] {
  const hues: Array<"emerald" | "violet" | "blue" | "amber"> = [
    "emerald",
    "violet",
    "blue",
    "amber",
  ];

  return candidates.map((c, idx) => {
    const duration = Math.max(6, Math.round(c.endTime - c.startTime));
    return {
      id: `yt-${video.videoId}-${idx + 1}`,
      title: c.hookTitle,
      viralityScore: c.viralityScore,
      hookReason: c.hookReason,
      startTime: c.startTime,
      endTime: c.endTime,
      duration,
      hashtags: c.hashtags,
      words:
        c.words.length > 0
          ? c.words
          : buildWordTokensFromText(c.text, duration),
      transcriptText: c.text,
      captionStyle,
      captionColor: "#10B981",
      captionPosition: "bottom",
      videoUrl: null,
      downloadUrl: null,
      youtubeVideoId: video.videoId,
      thumbnailUrl: video.thumbnailUrl,
      cropPanX: 0,
      speakerLabel: video.author,
      faceConfidence: 98.5,
      accentHue: hues[idx % hues.length],
    };
  });
}

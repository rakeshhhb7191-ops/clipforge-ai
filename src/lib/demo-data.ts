import {
  CaptionStyle,
  GeneratedClip,
  ProcessingStepInfo,
  SampleVideoPreset,
  WordToken,
} from "@/types/clipforge";

export const SAMPLE_VIDEO_PRESETS: SampleVideoPreset[] = [
  {
    id: "stanford-commencement",
    label: "Keynote: Connect the Dots",
    url: "https://www.youtube.com/watch?v=UF8uR6Z6KLc",
    title: "Steve Jobs' 2005 Stanford Commencement Address",
    channel: "Stanford",
    durationLabel: "15:04",
  },
  {
    id: "procrastinator-ted",
    label: "TED: Master Procrastinator",
    url: "https://www.youtube.com/watch?v=arj7oStGLkU",
    title: "Inside the Mind of a Master Procrastinator | Tim Urban",
    channel: "TED",
    durationLabel: "14:03",
  },
  {
    id: "think-fast-talk-smart",
    label: "Talk: Speak With Confidence",
    url: "https://www.youtube.com/watch?v=HAnw168huqA",
    title: "Think Fast, Talk Smart: Communication Techniques",
    channel: "Stanford GSB",
    durationLabel: "58:20",
  },
];

export const PROCESSING_STEPS: ProcessingStepInfo[] = [
  {
    id: 1,
    title: "Fetching video & extracting audio",
    detail: "Streaming 1080p source via yt-dlp & normalizing 16kHz mono PCM audio",
  },
  {
    id: 2,
    title: "Transcribing speech with word-level timestamps",
    detail: "Running Whisper large-v3 alignment for frame-accurate word timing",
  },
  {
    id: 3,
    title: "AI identifying high-retention viral hooks",
    detail: "Scoring curiosity gaps, emotional spikes, and standalone story arcs",
  },
  {
    id: 4,
    title: "Smart 9:16 face-tracking crop & burning dynamic captions",
    detail: "MediaPipe speaker framing + rendering animated .ASS subtitles via FFmpeg",
  },
];

/**
 * Splits edited transcript text cleanly across existing clip duration
 * so user edits immediately stay synchronized in the live video preview.
 */
export function buildWordTokensFromText(
  text: string,
  durationSeconds: number
): WordToken[] {
  const cleaned = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (cleaned.length === 0) {
    return [];
  }

  const safeDuration = Math.max(durationSeconds, 4);
  const usableSpan = safeDuration - 0.3;
  const weightSum = cleaned.reduce(
    (sum, word) => sum + Math.max(2, Math.min(word.length, 10)),
    0
  );

  let cursor = 0.15;
  return cleaned.map((word) => {
    const weight = Math.max(2, Math.min(word.length, 10));
    const slice = (weight / weightSum) * usableSpan;
    const start = Number(cursor.toFixed(2));
    cursor += slice;
    const end = Number(Math.min(safeDuration, cursor).toFixed(2));
    return { word, start, end };
  });
}

export function createDemoClips(
  sourceTitle: string,
  captionStyle: CaptionStyle,
  clipLength: "auto" | "under30"
): GeneratedClip[] {
  const shortFactor = clipLength === "under30" ? 0.68 : 1;

  const rawClips: Array<{
    id: string;
    title: string;
    viralityScore: number;
    hookReason: string;
    startTime: number;
    baseDuration: number;
    hashtags: string[];
    text: string;
    speakerLabel: string;
    faceConfidence: number;
    accentHue: "violet" | "emerald" | "blue" | "amber";
  }> = [
    {
      id: "clip-1",
      title: "Stop Optimizing Your Landing Page Before Doing This",
      viralityScore: 96,
      hookReason:
        "Opens with a contrarian pattern-interrupt in the first 1.8 seconds and resolves with a concrete 3-step retention metric creators can steal immediately.",
      startTime: 248,
      baseDuration: 34,
      hashtags: ["#CreatorEconomy", "#SaaSGrowth", "#ViralHooks", "#Shorts"],
      text: "Stop spending three weeks tweaking your hero gradient. Nobody quits a video or a product because your button moved four pixels. They leave because your first two seconds failed to name their exact pain.",
      speakerLabel: "Host • Primary Speaker",
      faceConfidence: 99.2,
      accentHue: "emerald",
    },
    {
      id: "clip-2",
      title: "The 3-Second Retention Rule Nobody Talks About",
      viralityScore: 92,
      hookReason:
        "Combines a specific curiosity gap ('82% drop-off') with rapid cadence shifts and high-contrast punchline delivery ideal for Hormozi-style captions.",
      startTime: 712,
      baseDuration: 28,
      hashtags: ["#VideoEditing", "#YouTubeShorts", "#Retention", "#AIStudio"],
      text: "Here is the brutal math behind every viral short. Eighty-two percent of viewers decide whether to swipe away before your fourth word finishes. Start inside the tension, never with a warm-up intro.",
      speakerLabel: "Guest • Center Frame",
      faceConfidence: 98.7,
      accentHue: "violet",
    },
    {
      id: "clip-3",
      title: "Why One 45-Minute Podcast Fuels 12 Days of Reach",
      viralityScore: 89,
      hookReason:
        "Actionable workflow breakdown with a crisp payoff number ('12 days from 1 recording'), driving high saves and shares among solo creators.",
      startTime: 1304,
      baseDuration: 36,
      hashtags: ["#ContentRepurposing", "#PodcastClips", "#Reels", "#Growth"],
      text: "People think daily posting requires filming every morning. Wrong. One focused forty-five minute conversation hides five killer standalone stories if you cut out the filler and lock the camera onto the reaction.",
      speakerLabel: "Host • Dynamic Pan",
      faceConfidence: 97.9,
      accentHue: "blue",
    },
    {
      id: "clip-4",
      title: "The Counter-Intuitive Secret Behind 1M Organic Views",
      viralityScore: 86,
      hookReason:
        "Strong emotional contrast ('zero ad spend vs viral loop') and a clean loopable ending sentence that encourages re-watches.",
      startTime: 1945,
      baseDuration: 26,
      hashtags: ["#OrganicReach", "#Storytelling", "#TikTokGrowth", "#ClipForge"],
      text: "When we deleted our paid boost budget, views actually tripled. Why? Because the algorithm rewards watch-through completion and comments, not politeness. Give viewers one bold idea worth arguing about.",
      speakerLabel: "Guest • Speaker B",
      faceConfidence: 98.4,
      accentHue: "amber",
    },
  ];

  const displaySource = sourceTitle ? ` (${sourceTitle.slice(0, 28)}${sourceTitle.length > 28 ? "…" : ""})` : "";
  void displaySource;

  return rawClips.map((clip) => {
    const duration = Math.max(16, Math.round(clip.baseDuration * shortFactor));
    const words = buildWordTokensFromText(clip.text, duration);
    return {
      id: clip.id,
      title: clip.title,
      viralityScore: clip.viralityScore,
      hookReason: clip.hookReason,
      startTime: clip.startTime,
      endTime: clip.startTime + duration,
      duration,
      hashtags: clip.hashtags,
      words,
      transcriptText: clip.text,
      captionStyle,
      captionColor: "#10B981",
      captionPosition: "bottom",
      videoUrl: null,
      downloadUrl: null,
      speakerLabel: clip.speakerLabel,
      faceConfidence: clip.faceConfidence,
      accentHue: clip.accentHue,
    };
  });
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export type AppView = "landing" | "studio" | "processing" | "results";

export type AspectRatio = "9:16" | "1:1";
export type ClipLengthPref = "auto" | "under30";
export type CaptionStyle = "hormozi" | "minimal" | "karaoke";
export type CaptionPosition = "bottom" | "center" | "upper";

export type CaptionColor = "#10B981" | "#FACC15" | "#F8FAFC" | "#A78BFA";

export interface GenerationSettings {
  aspectRatio: AspectRatio;
  clipLength: ClipLengthPref;
  captionStyle: CaptionStyle;
  autoFaceTracking: boolean;
}

export interface WordToken {
  word: string;
  start: number; // relative to clip start (seconds)
  end: number;   // relative to clip start (seconds)
}

export interface GeneratedClip {
  id: string;
  title: string;
  viralityScore: number;
  hookReason: string;
  startTime: number;
  endTime: number;
  duration: number;
  hashtags: string[];
  words: WordToken[];
  transcriptText: string;
  captionStyle: CaptionStyle;
  captionColor: CaptionColor;
  captionPosition: CaptionPosition;
  videoUrl?: string | null;
  downloadUrl?: string | null;
  youtubeVideoId?: string | null;
  thumbnailUrl?: string | null;
  cropPanX?: number; // -50 to +50 horizontal framing adjustment (%)
  speakerLabel: string;
  faceConfidence: number;
  accentHue: "violet" | "emerald" | "blue" | "amber";
}

export interface UserProfile {
  name: string;
  handle: string;
  provider: "google" | "discord" | "demo";
  plan: string;
}

export interface SampleVideoPreset {
  id: string;
  label: string;
  url: string;
  title: string;
  channel: string;
  durationLabel: string;
}

export interface ProcessingStepInfo {
  id: number;
  title: string;
  detail: string;
}

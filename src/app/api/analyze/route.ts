import { NextRequest, NextResponse } from "next/server";
import { fetchYouTubeVideoData } from "@/lib/youtube-transcript";
import { analyzeYouTubeVideoToClips } from "@/lib/hook-analyzer";
import { CaptionStyle, ClipLengthPref } from "@/types/clipforge";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      youtubeUrl?: string;
      clipLength?: ClipLengthPref;
      captionStyle?: CaptionStyle;
    };

    const youtubeUrl = body.youtubeUrl?.trim();
    if (!youtubeUrl) {
      return NextResponse.json(
        { error: "youtubeUrl is required." },
        { status: 400 }
      );
    }

    const clipLength: ClipLengthPref =
      body.clipLength === "under30" ? "under30" : "auto";
    const captionStyle: CaptionStyle =
      body.captionStyle === "minimal" || body.captionStyle === "karaoke"
        ? body.captionStyle
        : "hormozi";

    const video = await fetchYouTubeVideoData(youtubeUrl);
    const { clips, analysisEngine } = await analyzeYouTubeVideoToClips(
      video,
      clipLength,
      captionStyle
    );

    return NextResponse.json({
      videoId: video.videoId,
      title: video.title,
      author: video.author,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: video.durationSeconds,
      transcriptSource: video.transcriptSource,
      segmentCount: video.segments.length,
      analysisEngine,
      clips,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to analyze YouTube video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

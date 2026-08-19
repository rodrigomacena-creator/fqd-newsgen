import { YoutubeTranscript } from "youtube-transcript";

export class YoutubeUrlError extends Error {}

const VIDEO_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
  /(?:youtu\.be\/)([\w-]{11})/,
  /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  /(?:youtube\.com\/embed\/)([\w-]{11})/,
];

export function isYoutubeUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "youtu.be" || /(^|\.)youtube\.com$/.test(hostname);
  } catch {
    return false;
  }
}

export function extractVideoId(url: string): string {
  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  throw new YoutubeUrlError("Link do YouTube inválido ou não reconhecido.");
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

export async function fetchVideoTranscript(videoId: string): Promise<string> {
  const parts = await YoutubeTranscript.fetchTranscript(videoId);
  const text = parts
    .map((p) => p.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    throw new YoutubeUrlError(
      "Não foi possível obter a transcrição deste vídeo (pode não ter legendas disponíveis)."
    );
  }

  return text;
}

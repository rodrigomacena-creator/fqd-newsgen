import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { getYoutubeFetch } from "./proxyFetch";

export class YoutubeUrlError extends Error {}

const VIDEO_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
  /(?:youtu\.be\/)([\w-]{11})/,
  /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  /(?:youtube\.com\/embed\/)([\w-]{11})/,
  /(?:youtube\.com\/live\/)([\w-]{11})/,
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
  let parts;
  try {
    parts = await YoutubeTranscript.fetchTranscript(videoId, { fetch: getYoutubeFetch() });
  } catch (err) {
    if (
      err instanceof YoutubeTranscriptDisabledError ||
      err instanceof YoutubeTranscriptNotAvailableError ||
      err instanceof YoutubeTranscriptNotAvailableLanguageError
    ) {
      throw new YoutubeUrlError(
        "Este vídeo não tem legenda/transcrição disponível no YouTube, então não dá para gerar a notícia a partir dele. Ative as legendas automáticas no YouTube Studio ou use outra fonte."
      );
    }
    if (err instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new YoutubeUrlError("Este vídeo está indisponível (privado, removido ou restrito).");
    }
    if (err instanceof YoutubeTranscriptTooManyRequestError) {
      throw new YoutubeUrlError(
        "O YouTube limitou as requisições (bloqueio de IP/proxy). Tente novamente em alguns minutos."
      );
    }
    throw err;
  }
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

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

/**
 * Data em que o vídeo foi ao ar (publicação no YouTube), em ISO 8601 UTC. Usa a YouTube Data API
 * (`YOUTUBE_API_KEY`) e, sem a chave ou se ela falhar, lê a data da página do vídeo.
 * Devolve null se não conseguir: quem chama segue sem data em vez de falhar.
 */
export async function fetchVideoPublishedAt(videoId: string): Promise<string | null> {
  const toIso = (v: unknown) => {
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  };
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${key}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          items?: { snippet?: { publishedAt?: string }; liveStreamingDetails?: { actualStartTime?: string } }[];
        };
        const item = data.items?.[0];
        // programa transmitido ao vivo: vale o horário em que a transmissão começou
        const iso = toIso(item?.liveStreamingDetails?.actualStartTime) ?? toIso(item?.snippet?.publishedAt);
        if (iso) return iso;
      }
    } catch {
      // cai pra leitura da página
    }
  }
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      headers: { "Accept-Language": "pt-BR,pt;q=0.9", "User-Agent": "Mozilla/5.0 (compatible; FQDNewsGen/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/itemprop="datePublished"\s+content="([^"]+)"/) ?? html.match(/"publishDate":"([^"]+)"/);
    return toIso(m?.[1]);
  } catch {
    return null;
  }
}

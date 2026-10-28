import {
  extractVideoId,
  fetchVideoTranscript,
  isYoutubeUrl,
  thumbnailUrl,
  YoutubeUrlError,
} from "./youtube";
import { fetchWebpageContent, WebpageFetchError } from "./webpage";

export type SourceType = "youtube" | "webpage" | "prompt";

export interface ArticleSource {
  type: SourceType;
  url: string;
  title: string;
  content: string;
  videoId?: string; // apenas para youtube, usado no fallback de thumbnail
  embed?: boolean; // fonte cujo player é incorporado na notícia (só a 1ª fonte YouTube)
}

export class SourceFetchError extends Error {
  constructor(
    public readonly sourceUrl: string,
    message: string
  ) {
    super(message);
  }
}

export const MAX_SOURCES = 5;
const TOTAL_CONTENT_BUDGET = 24000;

async function fetchSource(url: string): Promise<ArticleSource> {
  if (isYoutubeUrl(url)) {
    try {
      const videoId = extractVideoId(url);
      const transcript = await fetchVideoTranscript(videoId);
      return {
        type: "youtube",
        url,
        title: `Vídeo do YouTube (${videoId})`,
        content: transcript,
        videoId,
      };
    } catch (err) {
      if (!(err instanceof YoutubeUrlError)) {
        console.error(`Falha ao buscar transcrição de ${url}:`, err);
      }
      const message =
        err instanceof YoutubeUrlError ? err.message : "Não foi possível processar este vídeo.";
      throw new SourceFetchError(url, message);
    }
  }

  try {
    const { title, content } = await fetchWebpageContent(url);
    return { type: "webpage", url, title, content };
  } catch (err) {
    if (!(err instanceof WebpageFetchError)) {
      console.error(`Falha ao buscar conteúdo de ${url}:`, err);
    }
    const message =
      err instanceof WebpageFetchError ? err.message : "Não foi possível processar essa página.";
    throw new SourceFetchError(url, message);
  }
}

export async function fetchAllSources(urls: string[]): Promise<ArticleSource[]> {
  return Promise.all(urls.map(fetchSource));
}

export function firstYoutubeThumbnail(sources: ArticleSource[]): string | undefined {
  const yt = sources.find((s) => s.type === "youtube" && s.videoId);
  return yt?.videoId ? thumbnailUrl(yt.videoId) : undefined;
}

export const MAX_PROMPT_LENGTH = 4000;

/** O prompt digitado pelo usuário entra como uma fonte a mais (sem URL). */
export function promptSource(prompt: string): ArticleSource {
  return { type: "prompt", url: "", title: "Prompt", content: prompt };
}

export function buildSourcesText(sources: ArticleSource[]): string {
  const perSourceBudget = Math.floor(TOTAL_CONTENT_BUDGET / sources.length);

  return sources
    .map((source, index) => {
      const truncated = source.content.slice(0, perSourceBudget);
      if (source.type === "prompt") {
        return `--- Fonte ${index + 1}: Prompt do usuário (pauta/briefing) ---\n${truncated}`;
      }
      const label = source.type === "youtube" ? "Vídeo do YouTube" : "Página da web";
      return `--- Fonte ${index + 1}: ${label} — ${source.title} (${source.url}) ---\n${truncated}`;
    })
    .join("\n\n");
}

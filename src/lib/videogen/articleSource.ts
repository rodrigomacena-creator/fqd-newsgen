// "Notícia vira vídeo": monta o texto-base do roteiro a partir de uma notícia do NewsGen.
import { prisma } from "@/lib/prisma";
import { fetchWebpageContent, WebpageFetchError } from "@/lib/webpage";

const MAX_SOURCE = 8000;

export interface ArticleSource {
  id: string;
  title: string;
  text: string;
}

/** A referência da notícia pode ser o id de uma notícia do NewsGen ou o link de uma notícia na web. */
export const isNewsUrl = (ref: string | null | undefined): ref is string => /^https?:\/\//i.test(ref ?? "");

/** Lê o texto de uma notícia publicada na web (Readability). Lança WebpageFetchError com motivo claro. */
async function newsUrlSource(url: string): Promise<ArticleSource> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebpageFetchError("O link da notícia é inválido.");
  }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(parsed.hostname)) {
    throw new WebpageFetchError("Cole o link de uma notícia (página de texto). Para vídeos do YouTube, use o NewsGen.");
  }
  const { title, content } = await fetchWebpageContent(url);
  return { id: url, title: title || parsed.hostname, text: `Título: ${title}\n\n${content}`.slice(0, MAX_SOURCE) };
}

/** Título, linha fina, seções e legenda do Instagram da notícia (o que existir), em texto corrido. */
export async function articleSource(id: string | null | undefined): Promise<ArticleSource | null> {
  if (!id) return null;
  if (isNewsUrl(id)) return newsUrlSource(id);
  const a = await prisma.article.findUnique({ where: { id } });
  if (!a) return null;
  let sections: { heading?: string; text?: string }[] = [];
  try {
    sections = JSON.parse(a.sections || "[]");
  } catch {}
  const parts = [`Título: ${a.title}`];
  if (a.subtitle) parts.push(`Linha fina: ${a.subtitle}`);
  for (const s of Array.isArray(sections) ? sections : []) {
    const body = [s.heading, s.text].filter((x) => typeof x === "string" && x.trim()).join("\n");
    if (body) parts.push(body);
  }
  if (!sections.length && a.instagramCaption) parts.push(a.instagramCaption);
  return { id: a.id, title: a.title, text: parts.join("\n\n").slice(0, MAX_SOURCE) };
}

// "Notícia vira vídeo": monta o texto-base do roteiro a partir de uma notícia do NewsGen.
import { prisma } from "@/lib/prisma";

const MAX_SOURCE = 8000;

export interface ArticleSource {
  id: string;
  title: string;
  text: string;
}

/** Título, linha fina, seções e legenda do Instagram da notícia (o que existir), em texto corrido. */
export async function articleSource(id: string | null | undefined): Promise<ArticleSource | null> {
  if (!id) return null;
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

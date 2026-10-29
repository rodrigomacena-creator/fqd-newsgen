import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWordPressPost } from "@/lib/wordpress";
import { videoEmbedHtml } from "@/lib/videoEmbed";
import { blocksToHtml, type RichBlock } from "@/lib/richBlocks";

interface ArticleSection {
  heading: string;
  text: string;
  image?: string;
  blocks?: RichBlock[];
}

interface ArticleSourceRef {
  type: "youtube" | "webpage";
  url: string;
  title: string;
  videoId?: string;
  embed?: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildContentHtml(sections: ArticleSection[], embedVideoId?: string): string {
  const body = sections
    .map(
      (section) =>
        `<h2>${escapeHtml(section.heading)}</h2>\n<p>${escapeHtml(section.text).replace(/\n+/g, "</p>\n<p>")}</p>` +
        (section.blocks?.length ? `\n${blocksToHtml(section.blocks)}` : "")
    )
    .join("\n\n");
  return embedVideoId ? `${body}\n\n${videoEmbedHtml(embedVideoId)}` : body;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/articles/[id]/publish-wordpress">
) {
  const { id } = await ctx.params;

  let body: { categoryId?: number; programCategoryId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const categoryId = Number(body.categoryId);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "Escolha uma categoria." }, { status: 400 });
  }
  const programCategoryId =
    body.programCategoryId && Number.isInteger(Number(body.programCategoryId))
      ? Number(body.programCategoryId)
      : undefined;

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) {
    return NextResponse.json({ error: "Notícia não encontrada." }, { status: 404 });
  }

  const sections: ArticleSection[] = JSON.parse(article.sections);
  if (sections.length === 0) {
    return NextResponse.json(
      { error: "Esta notícia não tem matéria de Portal pra enviar." },
      { status: 400 }
    );
  }

  const sources: ArticleSourceRef[] = JSON.parse(article.sources);
  const youtubeSource = sources.find((s) => s.type === "youtube" && s.videoId);
  const featuredImageUrl = youtubeSource?.videoId
    ? `https://i.ytimg.com/vi/${youtubeSource.videoId}/maxresdefault.jpg`
    : undefined;

  try {
    const categoryIds = [categoryId, ...(programCategoryId ? [programCategoryId] : [])];

    const { id: wordpressPostId, editUrl } = await createWordPressPost({
      title: article.title,
      contentHtml: buildContentHtml(sections, sources.find((s) => s.embed && s.videoId)?.videoId),
      excerpt: article.subtitle,
      categoryIds,
      featuredImageUrl,
    });

    await prisma.article.update({
      where: { id },
      data: { wordpressPostId, wordpressUrl: editUrl },
    });

    return NextResponse.json({ wordpressPostId, editUrl });
  } catch (error) {
    console.error("Erro ao publicar no WordPress:", error);
    const message = error instanceof Error ? error.message : "Erro inesperado ao publicar no WordPress.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobsByPrefix } from "@/lib/blobStorage";
import { pickDisplayImage, type ArticleListItem } from "@/lib/articleListing";

/** Últimas notícias (lista "Suas notícias" da home do NewsGen). */
export async function GET(request: Request) {
  const take = Math.min(Math.max(Number(new URL(request.url).searchParams.get("take")) || 5, 1), 20);
  const [total, articles] = await Promise.all([
    prisma.article.count(),
    prisma.article.findMany({ orderBy: { createdAt: "desc" }, take }),
  ]);
  const items: ArticleListItem[] = articles.map((a) => ({
    id: a.id,
    title: a.title,
    coverImage: pickDisplayImage(a),
    hasPortal: (JSON.parse(a.sections) as unknown[]).length > 0 || Boolean(a.coverImage),
    hasInstagram: Boolean(a.instagramCaption),
    sentToPortal: Boolean(a.wordpressUrl),
    createdAt: a.createdAt.toISOString(),
  }));
  return NextResponse.json({ articles: items, total });
}

export async function DELETE(request: Request) {
  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const ids = Array.from(new Set((body.ids ?? []).filter(Boolean)));
  if (ids.length === 0) {
    return NextResponse.json({ error: "Nenhuma notícia selecionada." }, { status: 400 });
  }

  await prisma.article.deleteMany({ where: { id: { in: ids } } });

  await Promise.all(ids.map((id) => deleteBlobsByPrefix(`generated/${id}/`)));

  return NextResponse.json({ ok: true, count: ids.length });
}

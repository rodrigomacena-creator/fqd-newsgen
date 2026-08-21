import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned, deleteBlobsByPrefix } from "@/lib/blobStorage";

interface ArticleSection {
  heading: string;
  text: string;
  image?: string;
}

interface PatchBody {
  title?: string;
  subtitle?: string;
  instagramCaption?: string;
  section?: { index: number; heading?: string; text?: string };
  removeImage?: "cover" | "instagram" | number | { instagramImage: number };
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/articles/[id]">
) {
  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) {
    return NextResponse.json({ error: "Notícia não encontrada." }, { status: 404 });
  }

  const data: {
    title?: string;
    subtitle?: string;
    instagramCaption?: string;
    sections?: string;
    coverImage?: string | null;
    instagramImage?: string | null;
    instagramImages?: string | null;
  } = {};

  if (typeof body.title === "string") {
    const value = body.title.trim();
    if (!value) return NextResponse.json({ error: "O título não pode ficar vazio." }, { status: 400 });
    data.title = value;
  }

  if (typeof body.subtitle === "string") {
    const value = body.subtitle.trim();
    if (!value) return NextResponse.json({ error: "O subtítulo não pode ficar vazio." }, { status: 400 });
    data.subtitle = value;
  }

  if (typeof body.instagramCaption === "string") {
    const value = body.instagramCaption.trim();
    if (!value) return NextResponse.json({ error: "A legenda não pode ficar vazia." }, { status: 400 });
    data.instagramCaption = value;
  }

  const needsSections = Boolean(body.section) || typeof body.removeImage === "number";
  const sections: ArticleSection[] | null = needsSections ? JSON.parse(article.sections) : null;

  if (body.section && sections) {
    const { index, heading, text } = body.section;
    const section = sections[index];

    if (!section) {
      return NextResponse.json({ error: "Seção não encontrada." }, { status: 400 });
    }

    if (typeof heading === "string") {
      const value = heading.trim();
      if (!value) return NextResponse.json({ error: "O título da seção não pode ficar vazio." }, { status: 400 });
      section.heading = value;
    }

    if (typeof text === "string") {
      const value = text.trim();
      if (!value) return NextResponse.json({ error: "O texto da seção não pode ficar vazio." }, { status: 400 });
      section.text = value;
    }
  }

  if (body.removeImage !== undefined) {
    if (body.removeImage === "cover") {
      await deleteBlobIfOwned(article.coverImage);
      data.coverImage = null;
    } else if (body.removeImage === "instagram") {
      await deleteBlobIfOwned(article.instagramImage);
      data.instagramImage = null;
    } else if (typeof body.removeImage === "number" && sections) {
      const section = sections[body.removeImage];
      if (!section) {
        return NextResponse.json({ error: "Seção não encontrada." }, { status: 400 });
      }
      await deleteBlobIfOwned(section.image);
      section.image = undefined;
    } else if (
      typeof body.removeImage === "object" &&
      body.removeImage !== null &&
      "instagramImage" in body.removeImage
    ) {
      const images: string[] = article.instagramImages
        ? JSON.parse(article.instagramImages)
        : article.instagramImage
          ? [article.instagramImage]
          : [];
      const index = body.removeImage.instagramImage;
      const removedUrl = images[index];
      if (removedUrl === undefined) {
        return NextResponse.json({ error: "Imagem não encontrada." }, { status: 400 });
      }
      await deleteBlobIfOwned(removedUrl);
      images.splice(index, 1);
      data.instagramImages = JSON.stringify(images);
      data.instagramImage = null;
    }
  }

  if (sections) {
    data.sections = JSON.stringify(sections);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const updated = await prisma.article.update({ where: { id }, data });
  return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/articles/[id]">
) {
  const { id } = await ctx.params;

  try {
    await prisma.article.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Notícia não encontrada." }, { status: 404 });
  }

  await deleteBlobsByPrefix(`generated/${id}/`);

  return NextResponse.json({ ok: true });
}

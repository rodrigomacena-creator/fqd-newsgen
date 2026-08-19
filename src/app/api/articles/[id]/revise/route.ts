import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reviseArticle, type CurrentArticleSection } from "@/lib/reviseArticle";
import { generateAndSaveImage } from "@/lib/generateImages";
import { getInstructionProfile } from "@/lib/instructionProfiles";
import { buildStyleguidePromptContext } from "@/lib/styleguide";

interface StoredSection extends CurrentArticleSection {
  image?: string;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/articles/[id]/revise">
) {
  const { id } = await ctx.params;

  let body: { instruction?: string; textModel?: string; imageModel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const instruction = body.instruction?.trim();
  if (!instruction) {
    return NextResponse.json({ error: "Descreva o ajuste que deseja fazer." }, { status: 400 });
  }

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) {
    return NextResponse.json({ error: "Notícia não encontrada." }, { status: 404 });
  }

  const textModel = body.textModel?.trim() || article.textModel;
  const imageModel = body.imageModel?.trim() || article.imageModel;

  const currentSections: StoredSection[] = JSON.parse(article.sections);

  try {
    const profile = article.profileId ? await getInstructionProfile(article.profileId) : null;
    const styleguideContext = buildStyleguidePromptContext(profile);

    const revision = await reviseArticle(
      {
        title: article.title,
        subtitle: article.subtitle,
        sections: currentSections.map(({ heading, text }) => ({ heading, text })),
        instagramCaption: article.instagramCaption ?? "",
      },
      instruction,
      textModel,
      styleguideContext
    );

    let coverImage = article.coverImage;
    let instagramImage = article.instagramImage;
    const sectionImages = currentSections.map((s) => s.image);

    for (const change of revision.imageChanges) {
      if (change.target === "cover") {
        coverImage = await generateAndSaveImage(change.imagePrompt, id, "cover", imageModel);
      } else if (change.target === "instagram") {
        instagramImage = await generateAndSaveImage(
          change.imagePrompt,
          id,
          "instagram",
          imageModel,
          "1:1"
        );
      } else if (
        typeof change.target === "number" &&
        change.target >= 0 &&
        change.target < sectionImages.length
      ) {
        sectionImages[change.target] = await generateAndSaveImage(
          change.imagePrompt,
          id,
          `section-${change.target}`,
          imageModel
        );
      }
    }

    const sections = revision.sections.map((section, index) => ({
      heading: section.heading,
      text: section.text,
      image: sectionImages[index],
    }));

    const updated = await prisma.article.update({
      where: { id },
      data: {
        title: revision.title,
        subtitle: revision.subtitle,
        coverImage,
        sections: JSON.stringify(sections),
        instagramCaption: revision.instagramCaption,
        instagramImage,
        textModel,
        imageModel,
      },
    });

    return NextResponse.json({ id: updated.id, updatedAt: updated.updatedAt });
  } catch (error) {
    console.error("Erro ao revisar notícia:", error);
    const message = error instanceof Error ? error.message : "Erro inesperado ao ajustar a notícia.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

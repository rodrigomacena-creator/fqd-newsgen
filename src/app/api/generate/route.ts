import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateArticleDraft } from "@/lib/generateArticle";
import { DEFAULT_ARTICLE_PROMPT } from "@/lib/prompts";
import { generateAndSaveImage } from "@/lib/generateImages";
import { getSettings } from "@/lib/settings";
import { getInstructionProfile } from "@/lib/instructionProfiles";
import { buildStyleguidePromptContext } from "@/lib/styleguide";
import {
  fetchAllSources,
  firstYoutubeThumbnail,
  buildSourcesText,
  SourceFetchError,
  MAX_SOURCES,
} from "@/lib/sources";

const MIN_PARAGRAPHS = 1;
const MAX_PARAGRAPHS = 15;
const MIN_SUBTITLES = 1;
const MAX_SUBTITLES = 10;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function POST(request: Request) {
  let body: {
    urls?: string[];
    textModel?: string;
    imageModel?: string;
    profileId?: string;
    subtitleCount?: number;
    paragraphCount?: number;
    photoCount?: number;
    extraInstructions?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const urls = (body.urls ?? []).map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) {
    return NextResponse.json({ error: "Informe ao menos um link." }, { status: 400 });
  }
  if (urls.length > MAX_SOURCES) {
    return NextResponse.json(
      { error: `Você pode usar no máximo ${MAX_SOURCES} fontes por notícia.` },
      { status: 400 }
    );
  }

  const subtitleCount = clampInt(body.subtitleCount, 4, MIN_SUBTITLES, MAX_SUBTITLES);
  const paragraphCount = clampInt(
    body.paragraphCount,
    Math.max(8, subtitleCount),
    MIN_PARAGRAPHS,
    MAX_PARAGRAPHS
  );
  const photoCount = clampInt(body.photoCount, Math.min(4, subtitleCount), 0, subtitleCount);
  const extraInstructions = body.extraInstructions?.trim() || undefined;

  try {
    const settings = await getSettings();
    const textModel = body.textModel?.trim() || settings.defaultTextModel;
    const imageModel = body.imageModel?.trim() || settings.defaultImageModel;

    const profile = body.profileId ? await getInstructionProfile(body.profileId) : null;
    const instructionPrompt = profile?.prompt || DEFAULT_ARTICLE_PROMPT;
    const profileName = profile?.name ?? null;
    const styleguideContext = buildStyleguidePromptContext(profile);

    const sources = await fetchAllSources(urls);
    const sourcesText = buildSourcesText(sources);
    const draft = await generateArticleDraft(
      sourcesText,
      { subtitleCount, paragraphCount, photoCount, extraInstructions },
      textModel,
      instructionPrompt,
      styleguideContext
    );

    const articleId = randomUUID();
    const coverFallback = firstYoutubeThumbnail(sources);

    const coverImage = await generateAndSaveImage(
      draft.coverImagePrompt,
      articleId,
      "cover",
      imageModel
    ).catch(() => coverFallback);

    const sections = await Promise.all(
      draft.sections.map(async (section, index) => {
        if (index >= photoCount || !section.imagePrompt?.trim()) {
          return { heading: section.heading, text: section.text };
        }

        const image = await generateAndSaveImage(
          section.imagePrompt,
          articleId,
          `section-${index}`,
          imageModel
        ).catch(() => undefined);

        return {
          heading: section.heading,
          text: section.text,
          image,
        };
      })
    );

    const instagramImage = await generateAndSaveImage(
      draft.instagram.imagePrompt,
      articleId,
      "instagram",
      imageModel,
      "1:1"
    ).catch(() => coverImage);

    const article = await prisma.article.create({
      data: {
        id: articleId,
        sources: JSON.stringify(sources),
        title: draft.title,
        subtitle: draft.subtitle,
        coverImage,
        sections: JSON.stringify(sections),
        textModel,
        imageModel,
        profileId: profile?.id ?? null,
        profileName,
        instagramCaption: draft.instagram.caption,
        instagramImage,
      },
    });

    return NextResponse.json({ id: article.id });
  } catch (error) {
    if (error instanceof SourceFetchError) {
      return NextResponse.json(
        { error: `${error.sourceUrl}: ${error.message}` },
        { status: 422 }
      );
    }

    console.error("Erro ao gerar notícia:", error);
    const message = error instanceof Error ? error.message : "Erro inesperado ao gerar a notícia.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

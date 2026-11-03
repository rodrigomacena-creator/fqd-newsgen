import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recentFreeStyles, resolveStyle } from "@/lib/videogen/templates";
import { generateVideoScript, VIDEOGEN_TEXT_MODEL } from "@/lib/videogen/generateScript";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { appendCosts, costEntry } from "@/lib/videogen/costs";
import { DEFAULT_VOICE_ID, MAX_DURATION_S, parseCharacter, parseSpeaker, parseVideoFormat, parseVoice } from "@/lib/videogen/types";
import { cleanBriefingImages, getProfile, isAllowedImageUrl } from "@/lib/videogen/profiles";
import { applyBaseSpeech } from "@/lib/videogen/baseVideo";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { MAX_STYLE_NOTES } from "@/lib/videogen/freeStyle";
import { articleSource } from "@/lib/videogen/articleSource";
import { WebpageFetchError } from "@/lib/webpage";

export const maxDuration = 300;

const MAX_TOPIC = 2000;

/** Lista os vídeos, mais novos primeiro. `?take=&skip=` paginam (padrão 20, máx. 50); `total` = todos. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const take = Math.min(50, Math.max(1, Math.round(Number(params.get("take")) || 20)));
  const skip = Math.max(0, Math.round(Number(params.get("skip")) || 0));
  const [jobs, total] = await Promise.all([
    prisma.videoJob.findMany({ orderBy: { createdAt: "desc" }, take, skip }),
    prisma.videoJob.count(),
  ]);
  return NextResponse.json({ jobs: jobs.map(serializeVideoJob), total });
}

/** Cria o vídeo e já gera o roteiro (o usuário revisa antes da narração e do render). */
export async function POST(request: Request) {
  let body: {
    topic?: string;
    patternId?: string;
    voiceId?: string;
    voiceName?: string;
    durationS?: number;
    extraInstructions?: string;
    styleNotes?: string;
    textModel?: string;
    personId?: string;
    companyId?: string;
    briefingImages?: unknown;
    /** "Notícia vira vídeo": id da notícia do NewsGen que serve de base. */
    articleId?: string;
    /** "9:16" (padrão, Reels/Shorts) ou "16:9" (YouTube horizontal). */
    format?: string;
    /** Quem fala: "ai_voice" (padrão), "ai_avatar" (voz + avatar do HeyGen) ou "upload" (áudio/vídeo enviado). */
    speaker?: string;
    /** Avatar por IA: foto escolhida para este vídeo (sem ela, a do perfil de quem fala). */
    /** Avatar/foto animada da conta do HeyGen (AvatarCharacter) escolhido para este vídeo. */
    avatarCharacter?: unknown;
    /** Áudio/vídeo enviado (já no Blob, pasta videogen/base/). */
    baseUrl?: string;
    baseKind?: string;
    baseDurationS?: number;
    /** Vídeo enviado: também aparece nas cenas (trilha fixa) ou só o áudio vira a narração. */
    baseUseVideo?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const speaker = parseSpeaker(body.speaker);
  const baseUrl = speaker === "upload" ? (typeof body.baseUrl === "string" ? body.baseUrl.trim() : "") : "";
  if (speaker === "upload" && (!baseUrl || !isAllowedImageUrl(baseUrl) || !baseUrl.includes("/videogen/base/"))) {
    return NextResponse.json({ error: "Envie o áudio ou o vídeo com a fala." }, { status: 400 });
  }
  const baseKind = body.baseKind === "audio" ? "audio" : "video";
  const avatarCharacter = speaker === "ai_avatar" ? parseCharacter(body.avatarCharacter) : null;
  let article;
  try {
    article = await articleSource(body.articleId?.trim());
  } catch (err) {
    if (err instanceof WebpageFetchError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  if (body.articleId?.trim() && !article) return NextResponse.json({ error: "Notícia não encontrada." }, { status: 404 });
  // com fala enviada o tema é só contexto (o conteúdo é a própria fala)
  const topic = (body.topic?.trim() || article?.title || (speaker === "upload" ? "Fala enviada" : "")).slice(0, MAX_TOPIC);
  if (!topic) return NextResponse.json({ error: "Informe o tema do vídeo." }, { status: 400 });
  const style = await resolveStyle(body.patternId?.trim() ?? "");
  if (!style) return NextResponse.json({ error: "Escolha um estilo válido." }, { status: 400 });
  const { pattern, guide } = style;
  const format = parseVideoFormat(body.format);
  // o horizontal usa o motor genérico (estilo livre e templates); os embutidos são desenhados para 9:16
  if (format === "16:9" && pattern.kind === "builtin") {
    return NextResponse.json({ error: "O formato horizontal funciona no estilo livre e nos templates montados." }, { status: 400 });
  }
  if (speaker !== "ai_voice" && pattern.kind === "builtin") {
    return NextResponse.json({ error: "Avatar e vídeo enviado funcionam no estilo livre e nos templates montados." }, { status: 400 });
  }
  if (speaker === "ai_avatar" && !avatarCharacter && !parseCharacter((await getProfile(body.personId?.trim(), "person"))?.heygenAvatar)) {
    return NextResponse.json({ error: "Escolha um avatar do HeyGen (ou cadastre no perfil de quem fala)." }, { status: 400 });
  }
  const durationS = Math.min(MAX_DURATION_S[format], Math.max(5, Math.round(Number(body.durationS) || 15)));
  const textModel = body.textModel?.trim() || VIDEOGEN_TEXT_MODEL;
  const extraInstructions = body.extraInstructions?.trim().slice(0, 2000) || null;
  // direcionamento só faz sentido no estilo livre
  const styleNotes = pattern.kind === "free" ? body.styleNotes?.trim().slice(0, MAX_STYLE_NOTES) || null : null;
  const person = await getProfile(body.personId?.trim(), "person");
  const company = await getProfile(body.companyId?.trim(), "company");
  const briefingImages = cleanBriefingImages(body.briefingImages);
  // Voz: a escolhida no formulário; senão a da pessoa; senão a padrão.
  // Avatar por IA: a voz é do HeyGen (do formulário, senão a do perfil); nos outros caminhos é do ElevenLabs.
  // (opcional: sem voz, o avatar fala com a voz padrão dele no HeyGen)
  const heygenVoice = speaker === "ai_avatar" ? (parseVoice(body.voiceId?.trim() ? { id: body.voiceId, name: body.voiceName } : null) ?? parseVoice(person?.heygenVoice)) : null;
  const voiceId = speaker === "ai_avatar" ? (heygenVoice?.id ?? "") : body.voiceId?.trim() || person?.voiceId || DEFAULT_VOICE_ID;
  const voiceName = speaker === "ai_avatar" ? (heygenVoice?.name ?? "Voz padrão do avatar") : body.voiceId?.trim() ? body.voiceName?.trim() || voiceId : person?.voiceId ? person.voiceName || person.name : "Macena";

  const job = await prisma.videoJob.create({
    data: {
      topic,
      patternId: pattern.id,
      voiceId,
      voiceName,
      personId: person?.id ?? null,
      companyId: company?.id ?? null,
      briefingImages: briefingImages.length ? JSON.stringify(briefingImages) : null,
      durationS,
      textModel,
      extraInstructions,
      styleNotes,
      articleId: article?.id ?? null,
      format,
      speaker,
      avatarCharacter: avatarCharacter ? JSON.stringify(avatarCharacter) : null,
      costs: "[]",
    },
  });

  // fala enviada: transcreve e monta as cenas em cima dela (sem etapa de narração)
  if (speaker === "upload") {
    try {
      const { data, usd } = await applyBaseSpeech(job, baseUrl, {
        useVideo: baseKind === "video" && body.baseUseVideo !== false,
        durationS: Number(body.baseDurationS) || 0,
      });
      await appendCosts(job.id, [costEntry("script", "openrouter", { usd })]);
      const updated = await prisma.videoJob.update({ where: { id: job.id }, data });
      return NextResponse.json({ job: serializeVideoJob(updated) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao transcrever a fala.";
      // sem fala não há vídeo: apaga o rascunho (o arquivo já foi apagado quando não há fala)
      await deleteBlobIfOwned(baseUrl);
      await prisma.videoJob.delete({ where: { id: job.id } }).catch(() => {});
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  try {
    const { script, usd } = await generateVideoScript({
      pattern,
      guide,
      topic,
      durationS,
      extraInstructions,
      styleNotes,
      recentStyles: pattern.kind === "free" ? await recentFreeStyles(job.id) : [],
      model: textModel,
      person,
      company,
      briefingImages,
      sourceText: article?.text,
      format,
    });
    await appendCosts(job.id, [costEntry("script", "openrouter", { usd })]);
    const updated = await prisma.videoJob.update({
      where: { id: job.id },
      data: { script: JSON.stringify(script), status: "script_ready", error: null },
    });
    return NextResponse.json({ job: serializeVideoJob(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar o roteiro.";
    const failed = await prisma.videoJob.update({ where: { id: job.id }, data: { error: message } });
    return NextResponse.json({ error: message, job: serializeVideoJob(failed) }, { status: 502 });
  }
}

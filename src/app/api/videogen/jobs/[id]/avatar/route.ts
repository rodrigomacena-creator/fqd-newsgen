import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { advanceAvatar, discardAvatarFiles, parseAvatar, startHiggsfield } from "@/lib/videogen/avatar";
import { higgsfieldConfigured } from "@/lib/videogen/higgsfield";
import { speechToText } from "@/lib/videogen/elevenlabs";
import { scriptFromTranscript, transcriptWords } from "@/lib/videogen/baseVideo";
import { appendCosts, costEntry } from "@/lib/videogen/costs";
import { getProfile, isAllowedImageUrl } from "@/lib/videogen/profiles";
import type { AvatarTrack, VideoScript } from "@/lib/videogen/types";

export const maxDuration = 300;

type Ctx = RouteContext<"/api/videogen/jobs/[id]/avatar">;

function busy(status: string) {
  return status === "queued" || status === "rendering";
}

/** Andamento do avatar: consulta o Higgsfield pelos trechos em geração e devolve o job atualizado. */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  const avatar = parseAvatar(job.avatar);
  if (!avatar || avatar.status !== "generating") return NextResponse.json({ job: serializeVideoJob(job) });
  const next = await advanceAvatar(id, avatar);
  // grava só se a trilha no banco ainda é a mesma (outra aba pode ter trocado no meio)
  await prisma.videoJob.updateMany({ where: { id, avatar: job.avatar }, data: { avatar: JSON.stringify(next) } });
  const updated = await prisma.videoJob.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ job: serializeVideoJob(updated) });
}

/**
 * Cria o vídeo base.
 * { source: "higgsfield", imageUrl?, scope?: "all" | "marked" }: avatar falando a narração atual
 *   (foto do perfil da pessoa, ou a enviada). "all" = a fala inteira; "marked" = só as cenas marcadas.
 * { source: "upload", videoUrl, durationS? }: vídeo do usuário (já no Blob). A fala dele é
 *   transcrita, vira a narração, e o roteiro é refeito em cima dela.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { source?: string; imageUrl?: string; scope?: string; videoUrl?: string; durationS?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (busy(job.status)) return NextResponse.json({ error: "O vídeo está na fila de render." }, { status: 409 });
  if (!job.script) return NextResponse.json({ error: "Gere o roteiro primeiro." }, { status: 400 });
  const script = JSON.parse(job.script) as VideoScript;

  try {
    if (body.source === "higgsfield") {
      const cfg = higgsfieldConfigured();
      if (!cfg.ok) return NextResponse.json({ error: cfg.problem }, { status: 503 });
      if (!job.narrationUrl) return NextResponse.json({ error: "Gere a narração antes do avatar." }, { status: 400 });
      const current = parseAvatar(job.avatar);
      if (current?.source === "upload" && current.narrationUrl === job.narrationUrl) {
        return NextResponse.json({ error: "Este vídeo usa um vídeo seu como base. Remova o vídeo base antes de gerar o avatar." }, { status: 409 });
      }
      let imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
      if (imageUrl && !isAllowedImageUrl(imageUrl)) return NextResponse.json({ error: "Foto do avatar inválida." }, { status: 400 });
      if (!imageUrl) imageUrl = (await getProfile(job.personId, "person"))?.avatarUrl ?? "";
      if (!imageUrl) {
        return NextResponse.json({ error: "Envie uma foto do avatar (ou cadastre uma no perfil de quem fala)." }, { status: 400 });
      }
      const scope = body.scope === "marked" ? "marked" : "all";
      if (scope === "marked" && !script.scenes.some((s) => s.avatar)) {
        return NextResponse.json({ error: "Marque ao menos uma cena como avatar." }, { status: 400 });
      }
      const avatar = await startHiggsfield(job, script, imageUrl, scope);
      // sem nenhuma cena marcada ainda: abre com o avatar (o pedido do Rodrigo)
      const marked = script.scenes.some((s) => s.avatar);
      if (!marked && script.scenes[0]) script.scenes[0].avatar = true;
      const updated = await prisma.videoJob.update({
        where: { id },
        data: { avatar: JSON.stringify(avatar), ...(marked ? {} : { script: JSON.stringify(script) }), error: null },
      });
      return NextResponse.json({ job: serializeVideoJob(updated) });
    }

    if (body.source === "upload") {
      const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
      if (!videoUrl || !isAllowedImageUrl(videoUrl) || !videoUrl.includes(`/videogen/${id}/base/`)) {
        return NextResponse.json({ error: "Vídeo inválido." }, { status: 400 });
      }
      const { words: raw } = await speechToText(videoUrl);
      const words = transcriptWords(raw);
      if (words.length < 2) {
        await deleteBlobIfOwned(videoUrl);
        return NextResponse.json({ error: "Não encontrei fala no vídeo. Envie um vídeo com alguém falando." }, { status: 400 });
      }
      const durationS = Math.max(Number(body.durationS) || 0, words.at(-1)![2] + 0.3);
      const { script: next, usd } = await scriptFromTranscript(job, words, durationS);
      await appendCosts(id, [costEntry("script", "openrouter", { usd })]);
      const avatar: AvatarTrack = {
        source: "upload",
        status: "ready",
        narrationUrl: videoUrl,
        segments: [{ start: 0, end: durationS, status: "completed", videoUrl }],
        durationS,
        createdAt: new Date().toISOString(),
      };
      const prev = parseAvatar(job.avatar);
      if (prev) await discardAvatarFiles(prev, videoUrl);
      if (job.narrationUrl !== videoUrl) await deleteBlobIfOwned(job.narrationUrl);
      const updated = await prisma.videoJob.update({
        where: { id },
        data: {
          avatar: JSON.stringify(avatar),
          script: JSON.stringify(next),
          narrationUrl: videoUrl,
          narrationWords: JSON.stringify(words),
          narrationDurationS: Math.round(durationS * 100) / 100,
          status: "script_ready",
          error: null,
        },
      });
      return NextResponse.json({ job: serializeVideoJob(updated) });
    }
    return NextResponse.json({ error: "Escolha avatar (Higgsfield) ou vídeo seu." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao criar o vídeo base." }, { status: 502 });
  }
}

/** Tira o vídeo base: as cenas voltam a ser só imagens. Vídeo enviado leva junto a narração (era a fala dele). */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (busy(job.status)) return NextResponse.json({ error: "O vídeo está na fila de render." }, { status: 409 });
  const avatar = parseAvatar(job.avatar);
  if (!avatar) return NextResponse.json({ job: serializeVideoJob(job) });
  const wasNarration = avatar.source === "upload" && avatar.narrationUrl === job.narrationUrl;
  await discardAvatarFiles(avatar);
  const updated = await prisma.videoJob.update({
    where: { id },
    data: {
      avatar: null,
      ...(wasNarration ? { narrationUrl: null, narrationWords: null, narrationDurationS: null } : {}),
    },
  });
  return NextResponse.json({ job: serializeVideoJob(updated) });
}

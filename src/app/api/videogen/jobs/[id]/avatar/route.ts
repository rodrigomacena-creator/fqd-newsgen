import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { advanceAvatar, discardAvatarFiles, parseAvatar, startHeygen } from "@/lib/videogen/avatar";
import { heygenConfigured } from "@/lib/videogen/heygen";
import { applyBaseSpeech } from "@/lib/videogen/baseVideo";
import { appendCosts, costEntry } from "@/lib/videogen/costs";
import { getProfile, isAllowedImageUrl } from "@/lib/videogen/profiles";
import { fixedSpeech, parseCharacter, type VideoScript } from "@/lib/videogen/types";

export const maxDuration = 300;

type Ctx = RouteContext<"/api/videogen/jobs/[id]/avatar">;

function busy(status: string) {
  return status === "queued" || status === "rendering";
}

/** Andamento do avatar: consulta o HeyGen pelos trechos em geração e devolve o job atualizado. */
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
 * { source: "heygen", character?, imageUrl?, scope?: "all" | "marked" }: avatar falando a narração atual.
 *   `character` = avatar/foto animada da conta do HeyGen; sem ele, a foto (enviada, do vídeo ou do perfil)
 *   vira foto animada lá. "all" = a fala inteira; "marked" = só as cenas marcadas.
 * { source: "upload", videoUrl, durationS?, useVideo? }: áudio/vídeo do usuário (já no Blob). A fala
 *   é transcrita, vira a narração, e o roteiro é refeito em cima dela. `useVideo: false` = só o áudio.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { source?: string; imageUrl?: string; character?: unknown; scope?: string; videoUrl?: string; durationS?: number; useVideo?: boolean };
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
    if (body.source === "heygen" || body.source === "higgsfield") {
      const cfg = heygenConfigured();
      if (!cfg.ok) return NextResponse.json({ error: cfg.problem }, { status: 503 });
      if (!job.narrationUrl) return NextResponse.json({ error: "Gere a narração antes do avatar." }, { status: 400 });
      const current = parseAvatar(job.avatar);
      if (current?.source === "upload" && current.narrationUrl === job.narrationUrl) {
        return NextResponse.json({ error: "Este vídeo usa um vídeo seu como base. Remova o vídeo base antes de gerar o avatar." }, { status: 409 });
      }
      let imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
      if (imageUrl && !isAllowedImageUrl(imageUrl)) return NextResponse.json({ error: "Foto do avatar inválida." }, { status: 400 });
      // quem fala: personagem escolhido agora > o do vídeo > o do perfil; senão a foto (agora > do vídeo > do perfil)
      const person = await getProfile(job.personId, "person");
      const character = parseCharacter(body.character) ?? (imageUrl ? null : (parseCharacter(job.avatarCharacter) ?? parseCharacter(person?.heygenAvatar)));
      if (!character && !imageUrl) imageUrl = job.avatarImageUrl || person?.avatarUrl || "";
      if (!character && !imageUrl) {
        return NextResponse.json({ error: "Escolha um avatar do HeyGen ou envie uma foto (ou cadastre no perfil de quem fala)." }, { status: 400 });
      }
      const scope = body.scope === "marked" ? "marked" : "all";
      if (scope === "marked" && !script.scenes.some((s) => s.avatar)) {
        return NextResponse.json({ error: "Marque ao menos uma cena como avatar." }, { status: 400 });
      }
      const avatar = await startHeygen(job, script, { character, imageUrl: character ? null : imageUrl }, scope);
      // sem nenhuma cena marcada ainda: abre com o avatar (o pedido do Rodrigo)
      const marked = script.scenes.some((s) => s.avatar);
      if (!marked && script.scenes[0]) script.scenes[0].avatar = true;
      const updated = await prisma.videoJob.update({
        where: { id },
        data: {
          avatar: JSON.stringify(avatar),
          speaker: "ai_avatar",
          avatarCharacter: character ? JSON.stringify(character) : null,
          ...(character ? {} : { avatarImageUrl: imageUrl || null }),
          ...(marked ? {} : { script: JSON.stringify(script) }),
          error: null,
        },
      });
      return NextResponse.json({ job: serializeVideoJob(updated) });
    }

    if (body.source === "upload") {
      const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
      if (!videoUrl || !isAllowedImageUrl(videoUrl) || !(videoUrl.includes(`/videogen/${id}/base/`) || videoUrl.includes("/videogen/base/"))) {
        return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
      }
      const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(videoUrl.split("?")[0]);
      const { data, usd } = await applyBaseSpeech(job, videoUrl, { useVideo: isVideo && body.useVideo !== false, durationS: Number(body.durationS) || 0 });
      await appendCosts(id, [costEntry("script", "openrouter", { usd })]);
      const updated = await prisma.videoJob.update({ where: { id }, data });
      return NextResponse.json({ job: serializeVideoJob(updated) });
    }
    return NextResponse.json({ error: "Escolha avatar (HeyGen) ou vídeo seu." }, { status: 400 });
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
  if (!avatar && !fixedSpeech(job)) return NextResponse.json({ job: serializeVideoJob(job) });
  const wasNarration = fixedSpeech(job);
  if (avatar) await discardAvatarFiles(avatar);
  if (wasNarration) await deleteBlobIfOwned(job.narrationUrl);
  const updated = await prisma.videoJob.update({
    where: { id },
    data: {
      avatar: null,
      // sem a fala enviada, o vídeo volta a ser narrado por IA
      ...(wasNarration ? { narrationUrl: null, narrationWords: null, narrationDurationS: null, speaker: "ai_voice" } : {}),
    },
  });
  return NextResponse.json({ job: serializeVideoJob(updated) });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStyle } from "@/lib/videogen/templates";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { parseAvatar } from "@/lib/videogen/avatar";
import { uncoveredScenes } from "@/lib/videogen/avatarPlan";
import type { NarrationWord, VideoScript } from "@/lib/videogen/types";

/**
 * Coloca o vídeo na fila de render (status "queued"). Quem renderiza é o worker na VPS,
 * que pega o job mais antigo com esse status. DELETE tira da fila enquanto não começou.
 * Corpo opcional { mode: "preview" }: prévia rápida (render leve, sem trilha); o mp4 final atual fica.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/queue">) {
  const { id } = await ctx.params;
  let mode: "preview" | null = null;
  try {
    const body = (await request.json()) as { mode?: string };
    if (body?.mode === "preview") mode = "preview";
  } catch {}
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (!job.script) return NextResponse.json({ error: "Gere o roteiro primeiro." }, { status: 400 });
  const style = await resolveStyle(job.patternId);
  if (!style) {
    return NextResponse.json({ error: "O estilo deste vídeo foi removido e não pode mais ser renderizado." }, { status: 400 });
  }
  if (!style.pattern.semNarracao && !job.narrationUrl) {
    return NextResponse.json({ error: "Gere a narração antes de mandar para o render." }, { status: 400 });
  }
  if (job.status === "queued" || job.status === "rendering") {
    return NextResponse.json({ job: serializeVideoJob(job) });
  }
  // vídeo base (avatar/vídeo seu): só o motor genérico sabe intercalar, e as cenas marcadas precisam estar cobertas
  const avatar = parseAvatar(job.avatar);
  const script = JSON.parse(job.script) as VideoScript;
  if (avatar && avatar.narrationUrl === job.narrationUrl && script.scenes.some((s) => s.avatar)) {
    if (style.pattern.kind === "builtin") {
      return NextResponse.json({ error: "O vídeo base só funciona no estilo livre e nos templates. Troque o estilo deste vídeo." }, { status: 400 });
    }
    if (avatar.status === "generating") {
      return NextResponse.json({ error: "O avatar ainda está sendo gerado. Aguarde terminar para mandar para o render." }, { status: 409 });
    }
    const words = job.narrationWords ? (JSON.parse(job.narrationWords) as NarrationWord[]) : null;
    const missing = uncoveredScenes(script, words, avatar, job.narrationDurationS ?? avatar.durationS);
    if (missing.length) {
      return NextResponse.json(
        { error: `A(s) cena(s) ${missing.map((i) => i + 1).join(", ")} estão marcadas como avatar, mas ainda não têm avatar gerado. Gere os trechos que faltam ou troque essas cenas para imagem.` },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.videoJob.update({
    where: { id },
    data:
      mode === "preview"
        ? { status: "queued", renderMode: "preview", progress: 0, error: null, startedAt: null, finishedAt: null }
        : { status: "queued", renderMode: null, progress: 0, error: null, videoUrl: null, startedAt: null, finishedAt: null },
  });
  return NextResponse.json({ job: serializeVideoJob(updated) });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/queue">) {
  const { id } = await ctx.params;
  const result = await prisma.videoJob.updateMany({
    where: { id, status: "queued" },
    data: { status: "script_ready", progress: null, renderMode: null },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "O vídeo não está aguardando na fila." }, { status: 409 });
  }
  const job = await prisma.videoJob.findUnique({ where: { id } });
  return NextResponse.json({ job: job ? serializeVideoJob(job) : null });
}

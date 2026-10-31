import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVideoPattern } from "@/lib/videogen/patterns";
import { serializeVideoJob } from "@/lib/videogen/jobs";

/**
 * Coloca o vídeo na fila de render (status "queued"). Quem renderiza é o worker na VPS,
 * que pega o job mais antigo com esse status. DELETE tira da fila enquanto não começou.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/queue">) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (!job.script) return NextResponse.json({ error: "Gere o roteiro primeiro." }, { status: 400 });
  const pattern = getVideoPattern(job.patternId);
  if (!pattern?.semNarracao && !job.narrationUrl) {
    return NextResponse.json({ error: "Gere a narração antes de mandar para o render." }, { status: 400 });
  }
  if (job.status === "queued" || job.status === "rendering") {
    return NextResponse.json({ job: serializeVideoJob(job) });
  }

  const updated = await prisma.videoJob.update({
    where: { id },
    data: { status: "queued", progress: 0, error: null, videoUrl: null, startedAt: null, finishedAt: null },
  });
  return NextResponse.json({ job: serializeVideoJob(updated) });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/queue">) {
  const { id } = await ctx.params;
  const result = await prisma.videoJob.updateMany({
    where: { id, status: "queued" },
    data: { status: "script_ready", progress: null },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "O vídeo não está aguardando na fila." }, { status: 409 });
  }
  const job = await prisma.videoJob.findUnique({ where: { id } });
  return NextResponse.json({ job: job ? serializeVideoJob(job) : null });
}

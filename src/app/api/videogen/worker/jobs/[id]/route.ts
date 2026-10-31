import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";

/**
 * Atualização do worker sobre um job que ele está renderizando:
 * { progress } durante o render, { status: "done", videoUrl } no fim ou { status: "failed", error }.
 * Só vale enquanto o job está "rendering" (se o usuário excluiu o vídeo, responde 404/409 e o
 * worker descarta o trabalho).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/worker/jobs/[id]">) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;

  let body: { progress?: number; status?: string; videoUrl?: string; error?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status !== "rendering") {
    return NextResponse.json({ error: `O vídeo não está renderizando (status ${job.status}).` }, { status: 409 });
  }

  if (body.status === "done") {
    if (!body.videoUrl) return NextResponse.json({ error: "Informe videoUrl." }, { status: 400 });
    if (job.videoUrl && job.videoUrl !== body.videoUrl) await deleteBlobIfOwned(job.videoUrl);
    await prisma.videoJob.update({
      where: { id },
      data: { status: "done", videoUrl: body.videoUrl, progress: 100, finishedAt: new Date(), error: null },
    });
  } else if (body.status === "failed") {
    await prisma.videoJob.update({
      where: { id },
      data: {
        status: "failed",
        error: (body.error || "O render falhou.").slice(0, 2000),
        finishedAt: new Date(),
      },
    });
  } else {
    const progress = Math.min(99, Math.max(1, Math.round(Number(body.progress) || 1)));
    await prisma.videoJob.update({ where: { id }, data: { progress } });
  }
  return NextResponse.json({ ok: true });
}

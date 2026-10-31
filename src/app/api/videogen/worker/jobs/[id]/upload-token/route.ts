import { NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";

/**
 * Token de upload do Vercel Blob limitado a UM arquivo (o mp4 deste job), válido por 1h.
 * Assim a VPS nunca precisa do BLOB_READ_WRITE_TOKEN completo. O mp4 passa do limite de
 * corpo das funções da Vercel, por isso o worker sobe direto pro Blob com esse token.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/worker/jobs/[id]/upload-token">) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;

  const job = await prisma.videoJob.findUnique({ where: { id }, select: { status: true } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status !== "rendering") {
    return NextResponse.json({ error: "O vídeo não está renderizando." }, { status: 409 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN não configurado no app." }, { status: 503 });
  }
  const pathname = `videogen/${id}/video.mp4`;
  const clientToken = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: ["video/mp4"],
    maximumSizeInBytes: 500 * 1024 * 1024,
    addRandomSuffix: true, // re-render não pode servir o mp4 antigo do cache da CDN
    validUntil: Date.now() + 60 * 60 * 1000,
  });
  return NextResponse.json({ clientToken, pathname });
}

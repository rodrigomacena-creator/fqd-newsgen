import { NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";

/**
 * Token de upload do Vercel Blob limitado a UM arquivo deste job, válido por 1h.
 * Corpo opcional { file }: "video" (padrão, o mp4 final), "preview" (prévia rápida),
 * "scene" + { index } (imagem gerada de uma cena, reaproveitada no próximo render), "music" (trilha),
 * "cover" (capa 9:16) ou "thumb" (thumbnail 16:9).
 * Assim a VPS nunca precisa do BLOB_READ_WRITE_TOKEN completo. O mp4 passa do limite de
 * corpo das funções da Vercel, por isso o worker sobe direto pro Blob com esse token.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/worker/jobs/[id]/upload-token">) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  let body: { file?: string; index?: number } = {};
  try {
    body = await request.json();
  } catch {}

  const job = await prisma.videoJob.findUnique({ where: { id }, select: { status: true } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status !== "rendering") {
    return NextResponse.json({ error: "O vídeo não está renderizando." }, { status: 409 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN não configurado no app." }, { status: 503 });
  }
  const index = Math.max(0, Math.min(99, Math.floor(Number(body.index) || 0)));
  const files: Record<string, { pathname: string; type: string; max: number }> = {
    video: { pathname: `videogen/${id}/video.mp4`, type: "video/mp4", max: 500 },
    preview: { pathname: `videogen/${id}/previa.mp4`, type: "video/mp4", max: 300 },
    scene: { pathname: `videogen/${id}/cenas/cena-${String(index + 1).padStart(2, "0")}.jpg`, type: "image/jpeg", max: 20 },
    music: { pathname: `videogen/${id}/trilha.mp3`, type: "audio/mpeg", max: 30 },
    cover: { pathname: `videogen/${id}/capa-9x16.jpg`, type: "image/jpeg", max: 10 },
    thumb: { pathname: `videogen/${id}/capa-16x9.jpg`, type: "image/jpeg", max: 10 },
  };
  const file = files[body.file ?? "video"] ?? files.video;
  const pathname = file.pathname;
  const clientToken = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: [file.type],
    maximumSizeInBytes: file.max * 1024 * 1024,
    addRandomSuffix: true, // re-render não pode servir o mp4 antigo do cache da CDN
    validUntil: Date.now() + 60 * 60 * 1000,
  });
  return NextResponse.json({ clientToken, pathname });
}

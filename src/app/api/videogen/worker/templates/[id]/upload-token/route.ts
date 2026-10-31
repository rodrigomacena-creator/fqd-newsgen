import { NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";

const FILES = {
  sample: { name: "exemplo.mp4", type: "video/mp4", max: 100 * 1024 * 1024 },
  texture: { name: "textura.jpg", type: "image/jpeg", max: 20 * 1024 * 1024 },
} as const;

/** Token de upload do Blob limitado a um arquivo do template (exemplo de 5s ou textura de fundo). */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/worker/templates/[id]/upload-token">) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  let body: { file?: string } = {};
  try {
    body = await request.json();
  } catch {
    // corpo vazio = exemplo
  }
  const kind = body.file === "texture" ? "texture" : !body.file || body.file === "sample" ? "sample" : null;
  if (!kind) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  const file = FILES[kind];

  const t = await prisma.videoTemplate.findUnique({ where: { id }, select: { status: true } });
  if (!t) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  if (t.status !== "analyzing") return NextResponse.json({ error: "O template não está sendo montado." }, { status: 409 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN não configurado no app." }, { status: 503 });
  }
  const pathname = `videogen/templates/${id}/${file.name}`;
  const clientToken = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: [file.type],
    maximumSizeInBytes: file.max,
    addRandomSuffix: true,
    validUntil: Date.now() + 60 * 60 * 1000,
  });
  return NextResponse.json({ clientToken, pathname });
}

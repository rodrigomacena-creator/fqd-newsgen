import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned, deleteBlobsByPrefix } from "@/lib/blobStorage";
import { serializeTemplate } from "@/lib/videogen/templates";

export async function GET(_request: Request, ctx: RouteContext<"/api/videogen/templates/[id]">) {
  const { id } = await ctx.params;
  const template = await prisma.videoTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  return NextResponse.json({ template: serializeTemplate(template) });
}

/** Renomeia o template (o nome aparece no seletor de estilo). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/videogen/templates/[id]">) {
  const { id } = await ctx.params;
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const name = body.name?.trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Informe um nome." }, { status: 400 });
  const result = await prisma.videoTemplate.updateMany({ where: { id }, data: { name } });
  if (result.count === 0) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  const template = await prisma.videoTemplate.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ template: serializeTemplate(template) });
}

/**
 * Exclui o template, o vídeo de referência e os arquivos gerados (exemplo, textura).
 * Vídeos já renderizados continuam; os que usam o template não podem mais ir pro render.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/videogen/templates/[id]">) {
  const { id } = await ctx.params;
  const template = await prisma.videoTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  if (template.status === "analyzing") {
    return NextResponse.json({ error: "O template está sendo montado. Espere terminar para excluir." }, { status: 409 });
  }
  await deleteBlobIfOwned(template.referenceUrl);
  await deleteBlobsByPrefix(`videogen/templates/${id}/`);
  await prisma.videoTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeTemplate } from "@/lib/videogen/templates";

/**
 * Pede uma alteração no template: volta pra fila com o pedido; o worker aplica na ficha atual,
 * renderiza outro exemplo e o template fica "Para aprovar". Vídeos que já usam o template
 * continuam com a ficha atual até o novo exemplo ficar pronto.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/templates/[id]/revise">) {
  const { id } = await ctx.params;
  let body: { request?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const text = body.request?.trim().slice(0, 2000);
  if (!text) return NextResponse.json({ error: "Escreva o que você quer mudar." }, { status: 400 });
  const result = await prisma.videoTemplate.updateMany({
    where: { id, spec: { not: null }, status: { in: ["review", "ready", "failed"] } },
    data: { status: "queued", revisionRequest: text, progress: 0, error: null, startedAt: null, finishedAt: null },
  });
  if (result.count === 0) {
    const t = await prisma.videoTemplate.findUnique({ where: { id }, select: { status: true, spec: true } });
    if (!t) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
    if (!t.spec) return NextResponse.json({ error: "O template ainda não tem exemplo. Espere a primeira versão." }, { status: 409 });
    return NextResponse.json({ error: "O template já está sendo montado. Espere terminar." }, { status: 409 });
  }
  const template = await prisma.videoTemplate.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ template: serializeTemplate(template) });
}

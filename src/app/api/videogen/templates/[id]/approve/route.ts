import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeTemplate } from "@/lib/videogen/templates";

/** Aprova a versão atual do exemplo: o template fica pronto e aparece no seletor de estilo. */
export async function POST(_request: Request, ctx: RouteContext<"/api/videogen/templates/[id]/approve">) {
  const { id } = await ctx.params;
  const result = await prisma.videoTemplate.updateMany({ where: { id, status: "review" }, data: { status: "ready" } });
  if (result.count === 0) {
    const t = await prisma.videoTemplate.findUnique({ where: { id }, select: { status: true } });
    if (!t) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
    return NextResponse.json({ error: "Este template não está esperando aprovação." }, { status: 409 });
  }
  const template = await prisma.videoTemplate.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ template: serializeTemplate(template) });
}

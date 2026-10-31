import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeTemplate } from "@/lib/videogen/templates";

/** Monta de novo um template que falhou (ou refaz um pronto): volta pra fila do worker. */
export async function POST(_request: Request, ctx: RouteContext<"/api/videogen/templates/[id]/retry">) {
  const { id } = await ctx.params;
  const result = await prisma.videoTemplate.updateMany({
    where: { id, status: { in: ["failed", "ready"] } },
    data: { status: "queued", progress: 0, error: null, startedAt: null, finishedAt: null },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "O template já está na fila ou sendo montado." }, { status: 409 });
  }
  const template = await prisma.videoTemplate.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ template: serializeTemplate(template) });
}

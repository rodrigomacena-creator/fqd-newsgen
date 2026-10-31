import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";

// Template "analyzing" sem notícia do worker há esse tempo volta pra fila (worker caiu).
const STALE_MS = 20 * 60 * 1000;

/**
 * O worker chama quando não há vídeo na fila. Pega o template "queued" mais antigo e marca
 * como "analyzing" de forma atômica. Responde { template: null } quando não há nada.
 */
export async function POST(request: Request) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;

  await prisma.videoTemplate.updateMany({
    where: { status: "analyzing", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "queued", progress: 0 },
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const next = await prisma.videoTemplate.findFirst({
      where: { status: "queued" },
      orderBy: { updatedAt: "asc" },
      select: { id: true },
    });
    if (!next) return NextResponse.json({ template: null });
    const claimed = await prisma.videoTemplate.updateMany({
      where: { id: next.id, status: "queued" },
      data: { status: "analyzing", progress: 1, startedAt: new Date(), error: null },
    });
    if (claimed.count === 1) {
      const t = await prisma.videoTemplate.findUniqueOrThrow({ where: { id: next.id } });
      return NextResponse.json({ template: { id: t.id, name: t.name, referenceUrl: t.referenceUrl, notes: t.notes } });
    }
  }
  return NextResponse.json({ template: null });
}

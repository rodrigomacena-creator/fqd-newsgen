import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
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
  try {
    const t = await withDbRetry(takeNext);
    if (!t) return NextResponse.json({ template: null });
    return NextResponse.json({ template: { id: t.id, name: t.name, referenceUrl: t.referenceUrl, sourceUrl: t.sourceUrl, notes: t.notes } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[videogen template claim]", e);
    return NextResponse.json({ error: `Falha ao pegar template: ${message.slice(0, 300)}` }, { status: 503 });
  }
}

async function takeNext() {
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
    if (!next) return null;
    const claimed = await prisma.videoTemplate.updateMany({
      where: { id: next.id, status: "queued" },
      data: { status: "analyzing", progress: 1, startedAt: new Date(), error: null },
    });
    if (claimed.count === 1) return prisma.videoTemplate.findUniqueOrThrow({ where: { id: next.id } });
  }
  return null;
}

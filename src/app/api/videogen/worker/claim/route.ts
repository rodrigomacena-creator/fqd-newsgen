import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { getVideoPattern } from "@/lib/videogen/patterns";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";

// Um job "rendering" sem notícia do worker há esse tempo é considerado abandonado
// (worker caiu ou reiniciou) e volta pra fila.
const STALE_MS = 20 * 60 * 1000;

/**
 * O worker chama em loop. Pega o job "queued" mais antigo e o marca como "rendering"
 * de forma atômica (updateMany com a condição de status), então dois workers nunca
 * pegam o mesmo job. Responde { job: null } quando a fila está vazia.
 */
export async function POST(request: Request) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;

  await prisma.videoJob.updateMany({
    where: { status: "rendering", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "queued", progress: 0 },
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const next = await prisma.videoJob.findFirst({
      where: { status: "queued" },
      orderBy: { updatedAt: "asc" },
      select: { id: true },
    });
    if (!next) return NextResponse.json({ job: null });

    const claimed = await prisma.videoJob.updateMany({
      where: { id: next.id, status: "queued" },
      data: { status: "rendering", progress: 1, startedAt: new Date(), error: null },
    });
    if (claimed.count === 1) {
      const job = await prisma.videoJob.findUniqueOrThrow({ where: { id: next.id } });
      return NextResponse.json({ job: serializeVideoJob(job), pattern: getVideoPattern(job.patternId) ?? null });
    }
  }
  return NextResponse.json({ job: null });
}

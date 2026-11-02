import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { resolveStyle } from "@/lib/videogen/templates";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";
import { getProfile } from "@/lib/videogen/profiles";
import { FREE_STYLE_FALLBACK_SPEC } from "@/lib/videogen/freeStyle";
import type { VideoScript } from "@/lib/videogen/types";
import { attachStockVideos } from "@/lib/videogen/stockVideo";

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
  try {
    return await claim();
  } catch (e) {
    // Resposta sempre em JSON e com o motivo, para aparecer no log do worker (antes era um 500 vazio).
    const message = e instanceof Error ? e.message : String(e);
    console.error("[videogen claim]", e);
    return NextResponse.json({ error: `Falha ao pegar job: ${message.slice(0, 300)}` }, { status: 503 });
  }
}

/** Marca o job "queued" mais antigo como "rendering" (atômico). Devolve o id ou null. */
async function takeNext(): Promise<string | null> {
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
    if (!next) return null;
    const claimed = await prisma.videoJob.updateMany({
      where: { id: next.id, status: "queued" },
      data: { status: "rendering", progress: 1, startedAt: new Date(), error: null },
    });
    if (claimed.count === 1) return next.id;
  }
  return null;
}

async function claim() {
  const id = await withDbRetry(takeNext);
  if (!id) return NextResponse.json({ job: null });
  const job = await withDbRetry(() => prisma.videoJob.findUniqueOrThrow({ where: { id } }));
  const style = await resolveStyle(job.patternId);
  const company = await getProfile(job.companyId, "company");
  // estilo livre: a ficha foi montada pela IA junto com o roteiro
  let templateSpec = style?.spec ?? null;
  if (style?.pattern.kind === "free") {
    let script: VideoScript | null = null;
    try {
      script = job.script ? (JSON.parse(job.script) as VideoScript) : null;
    } catch {}
    templateSpec = script?.styleSpec ?? FREE_STYLE_FALLBACK_SPEC;
    // vídeos de banco das cenas que pediram e ainda não têm (quem não abriu o storyboard).
    // Falhou (Pixabay fora, timeout)? Segue sem: a cena usa imagem.
    if (script) {
      try {
        const { scenes, changed } = await attachStockVideos(script.scenes, job.format === "16:9");
        if (changed) {
          script.scenes = scenes;
          job.script = JSON.stringify(script);
          await prisma.videoJob.update({ where: { id: job.id }, data: { script: job.script } });
        }
      } catch (e) {
        console.warn("[videogen claim] vídeos de banco:", e);
      }
    }
  }
  // templateSpec: ficha do motor genérico quando o estilo é um template ou o estilo livre
  // brand: logo da empresa, que o worker põe no fim do vídeo (junto do CTA)
  return NextResponse.json({
    job: {
      ...serializeVideoJob(job),
      templateSpec,
      brand: company ? { name: company.name, logoUrl: company.logoUrl } : null,
    },
    pattern: style?.pattern ?? null,
  });
}

import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";
import { appendCosts, sanitizeCosts } from "@/lib/videogen/costs";
import { isAllowedImageUrl } from "@/lib/videogen/profiles";
import type { VideoScript } from "@/lib/videogen/types";

/**
 * Atualização do worker sobre um job que ele está renderizando:
 * { progress } durante o render, { status: "done", videoUrl } no fim ou { status: "failed", error }.
 * Qualquer uma pode trazer { costs: CostEntry[] } com os gastos do worker (imagens e trilha).
 * "done"/"failed" podem trazer { assets: { scenes: [{ index, prompt, url }], music: { url, prompt, seconds } } }:
 * imagens geradas e trilha que o worker subiu pro Blob. Viram scene.preview / script.musicTrack e o
 * próximo render (ou a prévia) reaproveita, gerando de novo só o que mudou.
 * Se o job estava em modo prévia, "done" grava previewUrl e volta para "script_ready" (o mp4 final fica).
 * Só vale enquanto o job está "rendering" (se o usuário excluiu o vídeo, responde 404/409 e o
 * worker descarta o trabalho).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/worker/jobs/[id]">) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;

  let body: { progress?: number; status?: string; videoUrl?: string; error?: string; costs?: unknown; assets?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status !== "rendering") {
    return NextResponse.json({ error: `O vídeo não está renderizando (status ${job.status}).` }, { status: 409 });
  }

  await appendCosts(id, sanitizeCosts(body.costs));
  const script = body.status === "done" || body.status === "failed" ? mergeAssets(job.script, body.assets) : null;
  const scriptData = script ? { script } : {};
  const preview = job.renderMode === "preview";

  if (body.status === "done") {
    if (!body.videoUrl) return NextResponse.json({ error: "Informe videoUrl." }, { status: 400 });
    if (preview) {
      if (job.previewUrl && job.previewUrl !== body.videoUrl) await deleteBlobIfOwned(job.previewUrl);
      await withDbRetry(() =>
        prisma.videoJob.update({
          where: { id },
          data: { status: "script_ready", renderMode: null, previewUrl: body.videoUrl, progress: null, finishedAt: new Date(), error: null, ...scriptData },
        }),
      );
    } else {
      if (job.videoUrl && job.videoUrl !== body.videoUrl) await deleteBlobIfOwned(job.videoUrl);
      const covers = pickCovers(body.assets);
      if (covers.coverUrl && job.coverUrl && job.coverUrl !== covers.coverUrl) await deleteBlobIfOwned(job.coverUrl);
      if (covers.thumbUrl && job.thumbUrl && job.thumbUrl !== covers.thumbUrl) await deleteBlobIfOwned(job.thumbUrl);
      await withDbRetry(() =>
        prisma.videoJob.update({
          where: { id },
          data: { status: "done", renderMode: null, videoUrl: body.videoUrl, progress: 100, finishedAt: new Date(), error: null, ...scriptData, ...covers },
        }),
      );
    }
  } else if (body.status === "failed") {
    await withDbRetry(() =>
      prisma.videoJob.update({
        where: { id },
        data: {
          status: "failed",
          renderMode: null,
          error: `${preview ? "Prévia: " : ""}${body.error || "O render falhou."}`.slice(0, 2000),
          finishedAt: new Date(),
          ...scriptData,
        },
      }),
    );
  } else {
    const progress = Math.min(99, Math.max(1, Math.round(Number(body.progress) || 1)));
    await withDbRetry(() => prisma.videoJob.update({ where: { id }, data: { progress } }));
  }
  return NextResponse.json({ ok: true });
}

/** Capa 9:16 e thumbnail 16:9 que o worker gerou no render final (assets.cover / assets.thumb). */
function pickCovers(assets: unknown): { coverUrl?: string; thumbUrl?: string } {
  const a = (assets ?? {}) as { cover?: unknown; thumb?: unknown };
  const out: { coverUrl?: string; thumbUrl?: string } = {};
  if (typeof a.cover === "string" && isAllowedImageUrl(a.cover)) out.coverUrl = a.cover;
  if (typeof a.thumb === "string" && isAllowedImageUrl(a.thumb)) out.thumbUrl = a.thumb;
  return out;
}

/**
 * Grava no roteiro as imagens e a trilha que o worker gerou: cada imagem vira scene.preview da cena
 * (só se o imagePrompt da cena ainda é o que gerou a imagem) e a trilha vira script.musicTrack.
 * Devolve o roteiro em JSON ou null se nada mudou.
 */
function mergeAssets(scriptJson: string | null, assets: unknown): string | null {
  if (!scriptJson || !assets || typeof assets !== "object") return null;
  let script: VideoScript;
  try {
    script = JSON.parse(scriptJson) as VideoScript;
  } catch {
    return null;
  }
  const a = assets as { scenes?: unknown; music?: unknown };
  let changed = false;
  for (const raw of Array.isArray(a.scenes) ? a.scenes : []) {
    const it = (raw ?? {}) as { index?: unknown; prompt?: unknown; url?: unknown };
    const scene = typeof it.index === "number" ? script.scenes[it.index] : undefined;
    if (!scene || typeof it.url !== "string" || !isAllowedImageUrl(it.url) || typeof it.prompt !== "string") continue;
    if (scene.imageUrl || it.prompt !== scene.imagePrompt) continue; // cena mudou durante o render
    scene.preview = { url: it.url, prompt: it.prompt };
    changed = true;
  }
  const m = (a.music ?? null) as { url?: unknown; prompt?: unknown; seconds?: unknown } | null;
  if (m && typeof m.url === "string" && isAllowedImageUrl(m.url) && typeof m.prompt === "string" && Number(m.seconds) > 0) {
    script.musicTrack = { url: m.url, prompt: m.prompt, seconds: Number(m.seconds) };
    changed = true;
  }
  return changed ? JSON.stringify(script) : null;
}

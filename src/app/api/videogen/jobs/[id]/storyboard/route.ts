import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { appendCosts, costEntry } from "@/lib/videogen/costs";
import { generateSceneImage, needsGeneratedImage, previewIsFresh } from "@/lib/videogen/storyboard";
import { attachStockVideos, findStockVideo } from "@/lib/videogen/stockVideo";
import type { VideoScript } from "@/lib/videogen/types";

export const maxDuration = 300;

const PARALLEL = 4;

/**
 * Gera as imagens do storyboard. Sem corpo: todas as cenas que ainda não têm prévia válida (e busca
 * os vídeos de banco das cenas com stockQuery). { scene: n } (índice a partir de 0): gera de novo só
 * aquela cena. { scene: n, action: "next_video" }: troca o vídeo de banco; "use_image": volta para imagem.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/storyboard">) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { scene?: number; action?: "next_video" | "use_image" };
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (!job.script) return NextResponse.json({ error: "Gere o roteiro antes do storyboard." }, { status: 400 });
  if (job.status === "queued" || job.status === "rendering") {
    return NextResponse.json({ error: "O vídeo está na fila de render." }, { status: 409 });
  }
  const script = JSON.parse(job.script) as VideoScript;
  const one = Number.isInteger(body.scene) ? Number(body.scene) : null;
  if (one !== null && body.action && script.scenes[one]) {
    const sc = script.scenes[one];
    if (body.action === "use_image") {
      delete sc.stock;
      delete sc.stockQuery;
    } else if (sc.stockQuery) {
      try {
        const next = await findStockVideo(sc.stockQuery, sc.durationS || 3, (sc.stock?.pick ?? -1) + 1);
        if (!next) return NextResponse.json({ error: "Não achei outro vídeo para esta cena." }, { status: 404 });
        sc.stock = next;
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao buscar vídeo de banco." }, { status: 502 });
      }
    }
    const saved = await prisma.videoJob.update({ where: { id }, data: { script: JSON.stringify(script) } });
    return NextResponse.json({ job: serializeVideoJob(saved) });
  }
  if (one === null) script.scenes = (await attachStockVideos(script.scenes)).scenes;
  const targets = script.scenes
    .map((sc, i) => ({ sc, i }))
    .filter(({ sc, i }) => needsGeneratedImage(sc) && (one === null ? !previewIsFresh(sc) : i === one));
  if (one !== null && targets.length === 0) {
    return NextResponse.json({ error: "Esta cena não usa imagem gerada (tem foto sua, é só texto ou está sem prompt)." }, { status: 400 });
  }

  let usd = 0;
  const failures: string[] = [];
  const queue = [...targets];
  async function worker() {
    for (let t = queue.shift(); t; t = queue.shift()) {
      try {
        const old = t.sc.preview?.url;
        const res = await generateSceneImage(id, t.i, t.sc.imagePrompt);
        usd += res.usd;
        script.scenes[t.i] = { ...script.scenes[t.i], preview: { url: res.url, prompt: t.sc.imagePrompt } };
        if (old) await deleteBlobIfOwned(old).catch(() => {});
      } catch (err) {
        failures.push(err instanceof Error ? err.message : `Falha na cena ${t.i + 1}.`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  if (usd > 0) await appendCosts(id, [costEntry("images", "openrouter", { usd })]);

  // relê o roteiro: só grava as prévias, sem perder algo salvo enquanto as imagens eram geradas
  const fresh = await prisma.videoJob.findUniqueOrThrow({ where: { id } });
  const current = fresh.script ? (JSON.parse(fresh.script) as VideoScript) : script;
  current.scenes = current.scenes.map((sc, i) => {
    const src = script.scenes[i];
    if (!src || src.imagePrompt !== sc.imagePrompt) return sc;
    return {
      ...sc,
      ...(src.preview ? { preview: src.preview } : {}),
      ...(src.stock && src.stockQuery === sc.stockQuery ? { stock: src.stock } : {}),
    };
  });
  const updated = await prisma.videoJob.update({ where: { id }, data: { script: JSON.stringify(current) } });
  return NextResponse.json(
    { job: serializeVideoJob(updated), error: failures.length ? failures.join(" ") : undefined },
    { status: failures.length && failures.length === targets.length ? 502 : 200 }
  );
}

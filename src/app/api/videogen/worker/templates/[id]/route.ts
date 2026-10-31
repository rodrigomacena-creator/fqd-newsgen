import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";
import { parseCosts, sanitizeCosts } from "@/lib/videogen/costs";
import { sanitizeSummary } from "@/lib/videogen/templates";

/**
 * Atualização do worker sobre um template que ele está montando:
 * { progress }, { status: "ready", name, spec, summary, guide, sampleUrl } ou { status: "failed", error }.
 * O fim pode trazer { costs } (análise, textura, imagens e trilha do exemplo).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/worker/templates/[id]">) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;

  let body: {
    progress?: number;
    status?: string;
    name?: string;
    spec?: unknown;
    summary?: unknown;
    guide?: string;
    sampleUrl?: string;
    error?: string;
    costs?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const t = await prisma.videoTemplate.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  if (t.status !== "analyzing") {
    return NextResponse.json({ error: `O template não está sendo montado (status ${t.status}).` }, { status: 409 });
  }
  const costs = sanitizeCosts(body.costs);
  const costsJson = costs.length ? JSON.stringify([...parseCosts(t.costs), ...costs]) : undefined;

  if (body.status === "ready") {
    if (!body.sampleUrl || !body.spec || typeof body.spec !== "object") {
      return NextResponse.json({ error: "Informe spec e sampleUrl." }, { status: 400 });
    }
    if (t.sampleUrl && t.sampleUrl !== body.sampleUrl) await deleteBlobIfOwned(t.sampleUrl);
    // o nome sugerido pela IA só substitui o padrão; um nome dado pelo usuário fica
    const name = t.name === "Novo template" && body.name?.trim() ? body.name.trim().slice(0, 80) : t.name;
    await prisma.videoTemplate.update({
      where: { id },
      data: {
        status: "ready",
        name,
        spec: JSON.stringify(body.spec),
        summary: JSON.stringify(sanitizeSummary(body.summary)),
        guide: (body.guide ?? "").slice(0, 20000),
        sampleUrl: body.sampleUrl,
        progress: 100,
        error: null,
        finishedAt: new Date(),
        costs: costsJson,
      },
    });
  } else if (body.status === "failed") {
    await prisma.videoTemplate.update({
      where: { id },
      data: { status: "failed", error: (body.error || "A montagem falhou.").slice(0, 2000), finishedAt: new Date(), costs: costsJson },
    });
  } else {
    const progress = Math.min(99, Math.max(1, Math.round(Number(body.progress) || 1)));
    await prisma.videoTemplate.update({ where: { id }, data: { progress } });
  }
  return NextResponse.json({ ok: true });
}

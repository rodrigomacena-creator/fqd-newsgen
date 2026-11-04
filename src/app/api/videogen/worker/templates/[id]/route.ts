import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";
import { parseCosts, sanitizeCosts } from "@/lib/videogen/costs";
import { parseRevisions, sanitizeSummary } from "@/lib/videogen/templates";

/**
 * Atualização do worker sobre um template que ele está montando:
 * { progress }, { status: "ready", name, spec, summary, guide, sampleUrl, buildState } ou { status: "failed", error }.
 * Template de marca e ajuste pedido terminam "Para aprovar" (review); os outros ficam prontos direto.
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
    buildState?: unknown;
    note?: string;
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
    // versões do exemplo: cada uma guarda o pedido que a gerou (a primeira, null)
    const revisions = parseRevisions(t.revisions);
    if (!revisions.length && t.sampleUrl && t.revisionRequest) {
      // template anterior a isto: a versão que já existia vira a primeira
      revisions.push({ request: null, sampleUrl: t.sampleUrl, at: (t.finishedAt ?? t.updatedAt).toISOString() });
    }
    if (t.sampleUrl && t.sampleUrl !== body.sampleUrl && !revisions.some((r) => r.sampleUrl === t.sampleUrl)) {
      await deleteBlobIfOwned(t.sampleUrl);
    }
    const keepHistory = t.origin === "brand" || Boolean(t.revisionRequest) || revisions.length > 0;
    if (keepHistory) {
      const note = t.revisionRequest && body.note?.trim() ? body.note.trim().slice(0, 600) : undefined;
      revisions.push({ request: t.revisionRequest, sampleUrl: body.sampleUrl, at: new Date().toISOString(), ...(note ? { note } : {}) });
    }
    // o nome sugerido pela IA só substitui o padrão; um nome dado pelo usuário fica
    const name = t.name === "Novo template" && body.name?.trim() ? body.name.trim().slice(0, 80) : t.name;
    await prisma.videoTemplate.update({
      where: { id },
      data: {
        status: t.origin === "brand" || t.revisionRequest ? "review" : "ready",
        revisionRequest: null,
        revisions: keepHistory ? JSON.stringify(revisions.slice(-30)) : t.revisions,
        buildState: body.buildState && typeof body.buildState === "object" ? JSON.stringify(body.buildState).slice(0, 50000) : t.buildState,
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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSourceLink, serializeTemplate } from "@/lib/videogen/templates";

export async function GET() {
  const templates = await prisma.videoTemplate.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ templates: templates.map(serializeTemplate) });
}

/** O worker só baixa vídeos do nosso Blob (nunca uma URL qualquer informada no corpo). */
function isReferenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (process.env.NODE_ENV !== "production" && url.hostname === "localhost") return true; // testes locais
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      url.pathname.startsWith("/videogen/templates/ref-")
    );
  } catch {
    return false;
  }
}

/** Cria o template e coloca na fila: o worker analisa o vídeo e gera o exemplo de 5s. */
export async function POST(request: Request) {
  let body: { name?: string; referenceUrl?: string; sourceUrl?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  // Ou o arquivo já subiu pro Blob (referenceUrl), ou é um link do YouTube/Pinterest que o worker baixa.
  const sourceUrl = body.sourceUrl?.trim() ? normalizeSourceLink(body.sourceUrl) : null;
  if (body.sourceUrl?.trim() && !sourceUrl) {
    return NextResponse.json({ error: "Cole um link do YouTube ou do Pinterest." }, { status: 400 });
  }
  const referenceUrl = sourceUrl ?? body.referenceUrl?.trim() ?? "";
  if (!sourceUrl && !isReferenceUrl(referenceUrl)) {
    return NextResponse.json({ error: "Envie o vídeo de referência ou cole um link antes de montar o template." }, { status: 400 });
  }
  const template = await prisma.videoTemplate.create({
    data: {
      name: body.name?.trim().slice(0, 80) || "Novo template",
      referenceUrl,
      sourceUrl,
      notes: body.notes?.trim().slice(0, 1000) || null,
      costs: "[]",
    },
  });
  return NextResponse.json({ template: serializeTemplate(template) }, { status: 201 });
}

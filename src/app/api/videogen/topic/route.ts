import { NextResponse } from "next/server";
import { MAX_TOPIC_REQUEST, createTopic } from "@/lib/videogen/topicAssist";

export const maxDuration = 120;

/** "Criar com IA": pedido livre -> tema formatado (quase um resumo do roteiro), com fontes se pesquisou na web. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { request?: unknown; web?: unknown; durationS?: unknown } | null;
  const text = typeof body?.request === "string" ? body.request.trim() : "";
  if (!text) return NextResponse.json({ error: "Escreva o que você quer no vídeo." }, { status: 400 });
  if (text.length > MAX_TOPIC_REQUEST) {
    return NextResponse.json({ error: `O pedido pode ter até ${MAX_TOPIC_REQUEST} caracteres.` }, { status: 400 });
  }
  const durationS = Math.min(Math.max(Number(body?.durationS) || 30, 10), 180);
  try {
    const result = await createTopic(text, { web: body?.web !== false, durationS });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Criar tema com IA falhou:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao criar o tema." }, { status: 502 });
  }
}

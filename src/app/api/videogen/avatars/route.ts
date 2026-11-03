import { NextResponse } from "next/server";
import { heygenConfigured, listCharacters } from "@/lib/videogen/heygen";

/** Avatares e fotos animadas cadastrados na conta do HeyGen (pra escolher quem aparece no vídeo). */
export async function GET() {
  const cfg = heygenConfigured();
  if (!cfg.ok) return NextResponse.json({ error: cfg.problem, characters: [] }, { status: 503 });
  try {
    return NextResponse.json({ characters: await listCharacters() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao listar os avatares.", characters: [] }, { status: 502 });
  }
}

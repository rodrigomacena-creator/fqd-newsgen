import { NextResponse } from "next/server";
import { heygenConfigured, listCharacters, listVoices } from "@/lib/videogen/heygen";

export const maxDuration = 60;

/** Avatares/fotos animadas e vozes da conta do HeyGen (pra escolher quem aparece e com que voz). */
export async function GET() {
  const cfg = heygenConfigured();
  if (!cfg.ok) return NextResponse.json({ error: cfg.problem, characters: [], voices: [] }, { status: 503 });
  const [chars, voices] = await Promise.allSettled([listCharacters(), listVoices()]);
  const characters = chars.status === "fulfilled" ? chars.value : [];
  const voiceList = voices.status === "fulfilled" ? voices.value : [];
  const problems = [chars, voices].filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
  if (problems.length === 2) return NextResponse.json({ error: problems[0], characters: [], voices: [] }, { status: 502 });
  return NextResponse.json({ characters, voices: voiceList, ...(problems.length ? { error: problems[0] } : {}) });
}

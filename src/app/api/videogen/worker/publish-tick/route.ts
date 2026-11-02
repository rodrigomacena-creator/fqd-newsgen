import { NextResponse } from "next/server";
import { checkWorkerAuth } from "@/lib/videogen/workerAuth";
import { advancePending } from "@/lib/videogen/social";

export const maxDuration = 300;

/**
 * O worker chama a cada minuto: publica os Reels agendados cuja hora chegou e avança os que o
 * Instagram está processando (assim funciona mesmo com a tela fechada).
 */
export async function POST(request: Request) {
  const denied = checkWorkerAuth(request);
  if (denied) return denied;
  try {
    const done = await advancePending();
    return NextResponse.json({ advanced: done.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

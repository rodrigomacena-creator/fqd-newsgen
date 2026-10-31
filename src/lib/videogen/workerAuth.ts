import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * As rotas /api/videogen/worker/* são chamadas só pelo worker de render (VPS), com
 * `Authorization: Bearer $VIDEOGEN_WORKER_TOKEN`. Devolve uma resposta de erro, ou null se ok.
 */
export function checkWorkerAuth(request: Request): NextResponse | null {
  const expected = process.env.VIDEOGEN_WORKER_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "VIDEOGEN_WORKER_TOKEN não configurado no app." }, { status: 503 });
  }
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return null;
}

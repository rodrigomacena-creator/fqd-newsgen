import { NextResponse } from "next/server";
import { connectAccount, PLATFORMS, type Platform } from "@/lib/videogen/social";

/** Volta do OAuth: confere o state, troca o código pelos tokens e volta para a tela de onde saiu. */
export async function GET(request: Request, ctx: RouteContext<"/api/videogen/social/[platform]/callback">) {
  const { platform } = await ctx.params;
  const url = new URL(request.url);
  if (!PLATFORMS.includes(platform as Platform)) return NextResponse.json({ error: "Rede desconhecida." }, { status: 404 });
  const cookieName = `vg_oauth_${platform}`;
  let saved: { state?: string; back?: string } = {};
  const raw = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  try {
    if (raw) saved = JSON.parse(decodeURIComponent(raw));
  } catch {}
  const back = saved.back && saved.back.startsWith("/") && !saved.back.startsWith("//") ? saved.back : "/videogen";
  const go = (param: string) => {
    const res = NextResponse.redirect(new URL(`${back}${back.includes("?") ? "&" : "?"}${param}`, url.origin));
    res.cookies.delete(cookieName);
    return res;
  };
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) return go(`erro=${encodeURIComponent(`Conexão cancelada: ${error}`)}`);
  const code = url.searchParams.get("code");
  if (!code || !saved.state || url.searchParams.get("state") !== saved.state) {
    return go(`erro=${encodeURIComponent("Não consegui confirmar a conexão (sessão expirada). Tente de novo.")}`);
  }
  try {
    // o Instagram às vezes acrescenta "#_" no fim do código
    await connectAccount(platform as Platform, url.origin, code.replace(/#_$/, ""));
    return go(`conectado=${platform}`);
  } catch (e) {
    return go(`erro=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
}

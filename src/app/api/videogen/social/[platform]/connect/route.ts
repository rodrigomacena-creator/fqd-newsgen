import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl, PLATFORMS, platformConfigured, type Platform } from "@/lib/videogen/social";

/** Começa o OAuth: guarda um "state" aleatório num cookie e manda para a tela de login da rede. */
export async function GET(request: Request, ctx: RouteContext<"/api/videogen/social/[platform]/connect">) {
  const { platform } = await ctx.params;
  const url = new URL(request.url);
  const back = safeBack(url.searchParams.get("back"));
  if (!PLATFORMS.includes(platform as Platform)) return NextResponse.json({ error: "Rede desconhecida." }, { status: 404 });
  if (!platformConfigured(platform as Platform)) {
    const msg = platform === "youtube" ? "Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na Vercel." : "Configure INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET na Vercel.";
    return NextResponse.redirect(new URL(`${back}${back.includes("?") ? "&" : "?"}erro=${encodeURIComponent(msg)}`, url.origin));
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(platform as Platform, url.origin, state));
  res.cookies.set(`vg_oauth_${platform}`, JSON.stringify({ state, back }), {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

function safeBack(v: string | null) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/videogen";
}

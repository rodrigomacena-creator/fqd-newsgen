import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLATFORMS, type Platform } from "@/lib/videogen/social";

/** Desconecta a conta (apaga os tokens guardados). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/videogen/social/[platform]">) {
  const { platform } = await ctx.params;
  if (!PLATFORMS.includes(platform as Platform)) return NextResponse.json({ error: "Rede desconhecida." }, { status: 404 });
  await prisma.socialAccount.deleteMany({ where: { platform } });
  return NextResponse.json({ ok: true });
}

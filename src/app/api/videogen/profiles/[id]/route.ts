import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { makeDefault, profileInput, serializeProfile } from "@/lib/videogen/profiles";

export async function GET(_request: Request, ctx: RouteContext<"/api/videogen/profiles/[id]">) {
  const { id } = await ctx.params;
  const profile = await prisma.videoProfile.findUnique({ where: { id } });
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  return NextResponse.json({ profile: serializeProfile(profile) });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/videogen/profiles/[id]">) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const current = await prisma.videoProfile.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  delete body.kind; // o tipo não muda depois de criado
  const parsed = profileInput(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { isDefault, ...data } = parsed.data;
  await prisma.videoProfile.update({ where: { id }, data });
  if (isDefault === true) await makeDefault(id, current.kind);
  if (data.logoUrl !== undefined && current.logoUrl && current.logoUrl !== data.logoUrl) await deleteBlobIfOwned(current.logoUrl);
  const profile = await prisma.videoProfile.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ profile: serializeProfile(profile) });
}

/** Apaga o perfil. Vídeos que usavam ele continuam existindo e passam a ser gerados sem esse perfil. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/videogen/profiles/[id]">) {
  const { id } = await ctx.params;
  const profile = await prisma.videoProfile.findUnique({ where: { id } });
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  await prisma.videoProfile.delete({ where: { id } });
  await deleteBlobIfOwned(profile.logoUrl);
  if (profile.isDefault) {
    // outro perfil do mesmo tipo assume como padrão
    const next = await prisma.videoProfile.findFirst({ where: { kind: profile.kind }, orderBy: { createdAt: "asc" } });
    if (next) await makeDefault(next.id, profile.kind);
  }
  return NextResponse.json({ ok: true });
}

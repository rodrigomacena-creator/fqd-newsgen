import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeDefault, profileInput, serializeProfile } from "@/lib/videogen/profiles";

/** Lista os perfis (pessoas e empresas), padrão primeiro. */
export async function GET() {
  const profiles = await prisma.videoProfile.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  return NextResponse.json({ profiles: profiles.map(serializeProfile) });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const parsed = profileInput(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { isDefault, ...data } = parsed.data;
  const kind = data.kind as string;
  // O primeiro perfil de cada tipo vira o padrão automaticamente.
  const hasDefault = await prisma.videoProfile.count({ where: { kind, isDefault: true } });
  const created = await prisma.videoProfile.create({ data: { ...(data as { kind: string; name: string }) } });
  if (isDefault === true || hasDefault === 0) await makeDefault(created.id, kind);
  const profile = await prisma.videoProfile.findUniqueOrThrow({ where: { id: created.id } });
  return NextResponse.json({ profile: serializeProfile(profile) });
}

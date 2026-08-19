import { NextResponse } from "next/server";
import { updateInstructionProfile, deleteInstructionProfile } from "@/lib/instructionProfiles";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/profiles/[id]">
) {
  const { id } = await ctx.params;

  let body: { name?: string; prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const name = body.name?.trim();
  const prompt = body.prompt?.trim();

  if (!name || !prompt) {
    return NextResponse.json(
      { error: "Nome e instrução não podem ficar vazios." },
      { status: 400 }
    );
  }

  try {
    const profile = await updateInstructionProfile(id, { name, prompt });
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/profiles/[id]">
) {
  const { id } = await ctx.params;

  try {
    await deleteInstructionProfile(id);
  } catch {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

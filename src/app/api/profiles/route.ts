import { NextResponse } from "next/server";
import { listInstructionProfiles, createInstructionProfile } from "@/lib/instructionProfiles";

export async function GET() {
  const profiles = await listInstructionProfiles();
  return NextResponse.json({ profiles });
}

export async function POST(request: Request) {
  let body: { name?: string; prompt?: string; maxSectionImages?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Dê um nome para o perfil." }, { status: 400 });
  }

  if (
    body.maxSectionImages != null &&
    (!Number.isInteger(body.maxSectionImages) || body.maxSectionImages < 0)
  ) {
    return NextResponse.json(
      { error: "Máximo de imagens de seção precisa ser um número inteiro ≥ 0." },
      { status: 400 }
    );
  }

  const profile = await createInstructionProfile({
    name,
    prompt: body.prompt,
    maxSectionImages: body.maxSectionImages,
  });
  return NextResponse.json(profile);
}

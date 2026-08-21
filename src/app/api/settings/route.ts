import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  let body: {
    defaultTextModel?: string;
    defaultImageModel?: string;
    defaultInstagramImageModel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const defaultTextModel = body.defaultTextModel?.trim();
  const defaultImageModel = body.defaultImageModel?.trim();
  const defaultInstagramImageModel = body.defaultInstagramImageModel?.trim();

  if (!defaultTextModel || !defaultImageModel || !defaultInstagramImageModel) {
    return NextResponse.json(
      { error: "Informe o modelo de texto, o de imagem e o de imagem do Instagram." },
      { status: 400 }
    );
  }

  const settings = await updateSettings({
    defaultTextModel,
    defaultImageModel,
    defaultInstagramImageModel,
  });
  return NextResponse.json(settings);
}

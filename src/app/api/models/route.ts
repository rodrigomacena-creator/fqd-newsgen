import { NextResponse } from "next/server";
import { fetchTextModels, fetchImageModels } from "@/lib/openrouterModels";

export async function GET() {
  try {
    const [textModels, imageModels] = await Promise.all([
      fetchTextModels(),
      fetchImageModels(),
    ]);

    return NextResponse.json({ textModels, imageModels });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar modelos.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

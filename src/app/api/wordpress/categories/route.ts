import { NextResponse } from "next/server";
import { listWordPressCategories } from "@/lib/wordpress";

export async function GET() {
  try {
    const categories = await listWordPressCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Erro ao listar categorias do WordPress:", error);
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

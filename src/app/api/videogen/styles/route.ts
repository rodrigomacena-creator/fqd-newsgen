import { NextResponse } from "next/server";
import { listStyles } from "@/lib/videogen/templates";

/** Estilos que geram mp4: os embutidos e os templates prontos, com o vídeo de exemplo de cada um. */
export async function GET() {
  return NextResponse.json({ styles: await listStyles() });
}

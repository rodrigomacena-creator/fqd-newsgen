import { NextResponse } from "next/server";
import { listVoices } from "@/lib/videogen/elevenlabs";

export async function GET() {
  try {
    return NextResponse.json({ voices: await listVoices() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Não foi possível listar as vozes." },
      { status: 502 }
    );
  }
}

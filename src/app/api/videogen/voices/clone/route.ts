import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cloneVoice } from "@/lib/videogen/elevenlabs";
import { serializeProfile } from "@/lib/videogen/profiles";
import { deleteBlobIfOwned } from "@/lib/blobStorage";

export const maxDuration = 120;

const MAX_FILES = 10;
const SAMPLE_PATH = /^\/videogen\/vozes\/[a-z0-9]{8,32}\/[A-Za-z0-9-]+\.(mp3|wav|m4a|ogg|webm)$/;

function isSampleUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && SAMPLE_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Treina uma voz nova no ElevenLabs (clonagem instantânea) com as amostras que o navegador subiu pro Blob,
 * cria um perfil de pessoa com essa voz e apaga as amostras.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; description?: unknown; samples?: unknown; removeNoise?: unknown; consent?: unknown }
    | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  const samples = Array.isArray(body?.samples) ? body.samples.filter((u): u is string => typeof u === "string") : [];
  if (!name) return NextResponse.json({ error: "Dê um nome para a voz." }, { status: 400 });
  if (body?.consent !== true) {
    return NextResponse.json({ error: "Confirme que a voz é sua ou que você tem autorização da pessoa." }, { status: 400 });
  }
  if (samples.length === 0) return NextResponse.json({ error: "Envie pelo menos uma amostra de áudio." }, { status: 400 });
  if (samples.length > MAX_FILES || !samples.every(isSampleUrl)) {
    return NextResponse.json({ error: "Amostras de áudio inválidas." }, { status: 400 });
  }

  try {
    const files = await Promise.all(
      samples.map(async (url, i) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Não consegui ler a amostra ${i + 1}.`);
        const ext = new URL(url).pathname.split(".").pop() ?? "mp3";
        return { name: `amostra-${i + 1}.${ext}`, type: res.headers.get("content-type") || "audio/mpeg", data: await res.arrayBuffer() };
      })
    );
    const voiceId = await cloneVoice({ name, description, files, removeBackgroundNoise: body?.removeNoise === true });
    const created = await prisma.videoProfile.create({
      data: { kind: "person", name, voiceId, voiceName: name },
    });
    return NextResponse.json({ profile: serializeProfile(created), voice: { id: voiceId, name } });
  } catch (err) {
    console.error("Treinar voz falhou:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao treinar a voz." }, { status: 502 });
  } finally {
    // as amostras só servem para o envio; não ficam guardadas
    await Promise.all(samples.map((u) => deleteBlobIfOwned(u)));
  }
}

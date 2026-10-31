import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { textToSpeechWithTimestamps } from "@/lib/videogen/elevenlabs";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { alignDisplayWords, mergePronunciations, spokenText } from "@/lib/videogen/pronunciation";
import { fullNarration, type VideoScript } from "@/lib/videogen/types";

export const maxDuration = 120;

/** Gera a narração no ElevenLabs a partir do roteiro atual e guarda mp3 + tempos das palavras. */
export async function POST(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/narration">) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (!job.script) return NextResponse.json({ error: "Gere o roteiro antes da narração." }, { status: 400 });
  if (job.status === "queued" || job.status === "rendering") {
    return NextResponse.json({ error: "O vídeo está na fila de render." }, { status: 409 });
  }

  const script = JSON.parse(job.script) as VideoScript;
  const display = fullNarration(script);
  if (!display) return NextResponse.json({ error: "Este roteiro não tem narração." }, { status: 400 });

  try {
    const pronunciations = mergePronunciations(script.pronunciations);
    const { audio, alignment } = await textToSpeechWithTimestamps(job.voiceId, spokenText(display, pronunciations));
    const words = alignDisplayWords(display, pronunciations, alignment);
    const duration = alignment.character_end_times_seconds.at(-1) ?? 0;

    // Sufixo aleatório: regenerar a narração não pode servir o mp3 antigo do cache da CDN.
    const blob = await put(`videogen/${id}/narracao.mp3`, audio, {
      access: "public",
      addRandomSuffix: true,
      contentType: "audio/mpeg",
    });
    await deleteBlobIfOwned(job.narrationUrl);

    const updated = await prisma.videoJob.update({
      where: { id },
      data: {
        narrationUrl: blob.url,
        narrationWords: JSON.stringify(words),
        narrationDurationS: Math.round(duration * 100) / 100,
        error: null,
      },
    });
    return NextResponse.json({ job: serializeVideoJob(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao gerar a narração." },
      { status: 502 }
    );
  }
}

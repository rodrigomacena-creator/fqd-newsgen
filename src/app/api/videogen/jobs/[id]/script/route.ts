import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVideoPattern } from "@/lib/videogen/patterns";
import { generateVideoScript } from "@/lib/videogen/generateScript";
import { serializeVideoJob } from "@/lib/videogen/jobs";

export const maxDuration = 300;

/** Gera o roteiro de novo (mesmo tema/padrão/duração), descartando a narração anterior. */
export async function POST(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/script">) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status === "queued" || job.status === "rendering") {
    return NextResponse.json({ error: "O vídeo está na fila de render." }, { status: 409 });
  }
  const pattern = getVideoPattern(job.patternId);
  if (!pattern) return NextResponse.json({ error: "Padrão do vídeo não existe mais." }, { status: 400 });

  try {
    const script = await generateVideoScript({
      pattern,
      topic: job.topic,
      durationS: job.durationS,
      extraInstructions: job.extraInstructions,
      model: job.textModel,
    });
    const updated = await prisma.videoJob.update({
      where: { id },
      data: {
        script: JSON.stringify(script),
        status: "script_ready",
        error: null,
        narrationUrl: null,
        narrationWords: null,
        narrationDurationS: null,
      },
    });
    return NextResponse.json({ job: serializeVideoJob(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao gerar o roteiro." },
      { status: 502 }
    );
  }
}

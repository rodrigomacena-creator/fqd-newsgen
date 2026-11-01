import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStyle } from "@/lib/videogen/templates";
import { generateVideoScript } from "@/lib/videogen/generateScript";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { appendCosts, costEntry } from "@/lib/videogen/costs";
import { jobProfiles, parseBriefingImages } from "@/lib/videogen/profiles";

export const maxDuration = 300;

/** Gera o roteiro de novo (mesmo tema/padrão/duração), descartando a narração anterior. */
export async function POST(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/script">) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status === "queued" || job.status === "rendering") {
    return NextResponse.json({ error: "O vídeo está na fila de render." }, { status: 409 });
  }
  const style = await resolveStyle(job.patternId);
  if (!style) return NextResponse.json({ error: "O estilo deste vídeo não existe mais." }, { status: 400 });

  try {
    const { person, company } = await jobProfiles(job);
    const { script, usd } = await generateVideoScript({
      person,
      company,
      briefingImages: parseBriefingImages(job.briefingImages),
      pattern: style.pattern,
      guide: style.guide,
      topic: job.topic,
      durationS: job.durationS,
      extraInstructions: job.extraInstructions,
      model: job.textModel,
    });
    await appendCosts(id, [costEntry("script", "openrouter", { usd })]);
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

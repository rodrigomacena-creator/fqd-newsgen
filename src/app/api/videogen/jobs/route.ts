import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStyle } from "@/lib/videogen/templates";
import { generateVideoScript, VIDEOGEN_TEXT_MODEL } from "@/lib/videogen/generateScript";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { appendCosts, costEntry } from "@/lib/videogen/costs";
import { DEFAULT_VOICE_ID } from "@/lib/videogen/types";

export const maxDuration = 300;

const MAX_TOPIC = 2000;

export async function GET() {
  const jobs = await prisma.videoJob.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return NextResponse.json({ jobs: jobs.map(serializeVideoJob) });
}

/** Cria o vídeo e já gera o roteiro (o usuário revisa antes da narração e do render). */
export async function POST(request: Request) {
  let body: {
    topic?: string;
    patternId?: string;
    voiceId?: string;
    voiceName?: string;
    durationS?: number;
    extraInstructions?: string;
    textModel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const topic = body.topic?.trim().slice(0, MAX_TOPIC);
  if (!topic) return NextResponse.json({ error: "Informe o tema do vídeo." }, { status: 400 });
  const style = await resolveStyle(body.patternId?.trim() ?? "");
  if (!style) return NextResponse.json({ error: "Escolha um estilo válido." }, { status: 400 });
  const { pattern, guide } = style;
  const durationS = Math.min(90, Math.max(5, Math.round(Number(body.durationS) || 15)));
  const textModel = body.textModel?.trim() || VIDEOGEN_TEXT_MODEL;
  const extraInstructions = body.extraInstructions?.trim().slice(0, 2000) || null;

  const job = await prisma.videoJob.create({
    data: {
      topic,
      patternId: pattern.id,
      voiceId: body.voiceId?.trim() || DEFAULT_VOICE_ID,
      voiceName: body.voiceName?.trim() || "Macena",
      durationS,
      textModel,
      extraInstructions,
      costs: "[]",
    },
  });

  try {
    const { script, usd } = await generateVideoScript({ pattern, guide, topic, durationS, extraInstructions, model: textModel });
    await appendCosts(job.id, [costEntry("script", "openrouter", { usd })]);
    const updated = await prisma.videoJob.update({
      where: { id: job.id },
      data: { script: JSON.stringify(script), status: "script_ready", error: null },
    });
    return NextResponse.json({ job: serializeVideoJob(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar o roteiro.";
    const failed = await prisma.videoJob.update({ where: { id: job.id }, data: { error: message } });
    return NextResponse.json({ error: message, job: serializeVideoJob(failed) }, { status: 502 });
  }
}

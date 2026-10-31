import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobsByPrefix } from "@/lib/blobStorage";
import { normalizeScript } from "@/lib/videogen/generateScript";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { fullNarration } from "@/lib/videogen/types";

export async function GET(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  return NextResponse.json({ job: serializeVideoJob(job) });
}

/** Salva a edição do roteiro. Se a narração mudou, a narração gerada antes deixa de valer. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]">) {
  const { id } = await ctx.params;
  let body: { script?: unknown; voiceId?: string; voiceName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status === "queued" || job.status === "rendering") {
    return NextResponse.json({ error: "O vídeo está na fila de render; aguarde terminar para editar." }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  let narrationChanged = false;
  if (body.script !== undefined) {
    const script = normalizeScript(body.script);
    if (script.scenes.length === 0) return NextResponse.json({ error: "O roteiro precisa de ao menos uma cena." }, { status: 400 });
    const before = job.script ? normalizeScript(JSON.parse(job.script)) : null;
    narrationChanged =
      !before ||
      fullNarration(before) !== fullNarration(script) ||
      JSON.stringify(before.pronunciations) !== JSON.stringify(script.pronunciations);
    data.script = JSON.stringify(script);
    data.status = "script_ready";
  }
  if (body.voiceId?.trim() && body.voiceId.trim() !== job.voiceId) {
    data.voiceId = body.voiceId.trim();
    data.voiceName = body.voiceName?.trim() || body.voiceId.trim();
    narrationChanged = true;
  }
  if (narrationChanged) {
    data.narrationUrl = null;
    data.narrationWords = null;
    data.narrationDurationS = null;
  }

  const updated = await prisma.videoJob.update({ where: { id }, data });
  return NextResponse.json({ job: serializeVideoJob(updated) });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  await deleteBlobsByPrefix(`videogen/${id}/`);
  await prisma.videoJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobIfOwned, deleteBlobsByPrefix } from "@/lib/blobStorage";
import { cleanBriefingImages, parseBriefingImages } from "@/lib/videogen/profiles";
import { normalizeScript } from "@/lib/videogen/generateScript";
import { serializeVideoJob } from "@/lib/videogen/jobs";
import { fullNarration } from "@/lib/videogen/types";

export async function GET(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  return NextResponse.json({ job: serializeVideoJob(job) });
}

/**
 * Salva a edição do roteiro (e das imagens do briefing). Se a narração mudou, a narração
 * gerada antes deixa de valer. Imagem tirada do briefing e que nenhuma cena usa é apagada do Blob.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]">) {
  const { id } = await ctx.params;
  let body: { script?: unknown; voiceId?: string; voiceName?: string; briefingImages?: unknown };
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
  let removedImages: string[] = [];
  if (body.briefingImages !== undefined) {
    const next = cleanBriefingImages(body.briefingImages);
    const finalScript = data.script ? (JSON.parse(data.script as string) as { scenes: { imageUrl?: string }[] }) : job.script ? JSON.parse(job.script) : { scenes: [] };
    const inUse = new Set<string>([...next.map((i) => i.url), ...(finalScript.scenes ?? []).map((s: { imageUrl?: string }) => s.imageUrl).filter(Boolean)]);
    removedImages = parseBriefingImages(job.briefingImages).map((i) => i.url).filter((u) => !inUse.has(u));
    data.briefingImages = next.length ? JSON.stringify(next) : null;
  }
  if (narrationChanged) {
    data.narrationUrl = null;
    data.narrationWords = null;
    data.narrationDurationS = null;
  }

  const updated = await prisma.videoJob.update({ where: { id }, data });
  await Promise.all(removedImages.map((u) => deleteBlobIfOwned(u)));
  return NextResponse.json({ job: serializeVideoJob(updated) });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status === "rendering") {
    return NextResponse.json(
      { error: "Este vídeo está sendo renderizado agora. Aguarde terminar para excluir." },
      { status: 409 }
    );
  }
  await deleteBlobsByPrefix(`videogen/${id}/`);
  // imagens do briefing sobem antes do job existir (outra pasta); a cena usa as mesmas URLs
  await Promise.all(parseBriefingImages(job.briefingImages).map((i) => deleteBlobIfOwned(i.url)));
  await prisma.videoJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

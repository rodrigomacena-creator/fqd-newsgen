import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { advancePending, advancePublication, PLATFORMS, serializePublication, type Platform } from "@/lib/videogen/social";

// o envio para o YouTube (baixar o mp4 do Blob e mandar) pode levar alguns minutos
export const maxDuration = 300;

/** Publicações do vídeo. Também avança as que estão em andamento (o Instagram processa o Reel aos poucos). */
export async function GET(_request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/publications">) {
  const { id } = await ctx.params;
  await advancePending(id);
  const list = await prisma.videoPublication.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ publications: list.map(serializePublication) });
}

/**
 * Publica (ou agenda) o vídeo: { platforms: ["youtube","instagram"], title, caption, privacy, scheduledAt? }.
 * Sem scheduledAt, já começa a enviar.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/publications">) {
  const { id } = await ctx.params;
  let body: { platforms?: unknown; title?: unknown; caption?: unknown; privacy?: unknown; scheduledAt?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const job = await prisma.videoJob.findUnique({ where: { id }, select: { videoUrl: true, status: true, format: true } });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (!job.videoUrl || job.status !== "done") return NextResponse.json({ error: "Renderize o vídeo antes de publicar." }, { status: 400 });

  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter((p): p is Platform => PLATFORMS.includes(p as Platform));
  if (platforms.length === 0) return NextResponse.json({ error: "Escolha pelo menos uma rede." }, { status: 400 });
  if (job.format === "16:9" && platforms.includes("instagram")) {
    return NextResponse.json({ error: "Vídeo horizontal vai só para o YouTube; o Instagram (Reels) é vertical." }, { status: 400 });
  }
  const accounts = await prisma.socialAccount.findMany({ where: { platform: { in: platforms } } });
  const missing = platforms.filter((p) => !accounts.some((a) => a.platform === p));
  if (missing.length) {
    return NextResponse.json({ error: `Conecte ${missing.map((p) => (p === "youtube" ? "o YouTube" : "o Instagram")).join(" e ")} primeiro.` }, { status: 400 });
  }

  let scheduledAt: Date | null = null;
  if (typeof body.scheduledAt === "string" && body.scheduledAt) {
    scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Data de agendamento inválida." }, { status: 400 });
    if (scheduledAt.getTime() < Date.now() + 5 * 60_000) {
      return NextResponse.json({ error: "Agende para pelo menos 5 minutos a partir de agora (ou publique agora)." }, { status: 400 });
    }
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : "";
  const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 4900) : "";
  const privacy = ["public", "unlisted", "private"].includes(String(body.privacy)) ? String(body.privacy) : "public";
  if (platforms.includes("youtube") && !title) return NextResponse.json({ error: "Escreva o título do YouTube." }, { status: 400 });

  const created = [];
  for (const platform of platforms) {
    created.push(
      await prisma.videoPublication.create({
        data: { jobId: id, platform, status: "pending", title, caption, privacy, scheduledAt },
      }),
    );
  }
  // já começa: YouTube envia agora (e agenda pelo publishAt); Instagram sem agendamento cria o Reel agora
  for (const p of created) {
    if (p.platform === "youtube" || !scheduledAt) await advancePublication(p);
  }
  const list = await prisma.videoPublication.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ publications: list.map(serializePublication) });
}

/** Cancela uma publicação do Instagram agendada que ainda não começou (?pub=<id>). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/videogen/jobs/[id]/publications">) {
  const { id } = await ctx.params;
  const pub = new URL(request.url).searchParams.get("pub") ?? "";
  const r = await prisma.videoPublication.deleteMany({ where: { id: pub, jobId: id, status: "pending", scheduledAt: { gt: new Date() } } });
  if (r.count === 0) return NextResponse.json({ error: "Só dá para cancelar agendamento que ainda não começou." }, { status: 409 });
  const list = await prisma.videoPublication.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ publications: list.map(serializePublication) });
}

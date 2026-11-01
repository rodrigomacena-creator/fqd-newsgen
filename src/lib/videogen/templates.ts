// Templates montados pela aplicação a partir de um vídeo de referência (tabela VideoTemplate).
// Só servidor: junta os estilos embutidos (videogen/padroes) com os templates prontos.
import type { VideoTemplate } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import patternGuides from "./patternGuides.json";
import { VIDEO_PATTERNS, getVideoPattern, type VideoPattern } from "./patterns";
import { FREE_STYLE, FREE_STYLE_ID, describeStyleSpec, freeStyleGuide } from "./freeStyle";
import { ELEVENLABS_USD_PER_CREDIT, parseCosts } from "./costs";
import { summarizeCosts, type CostSummary, type TemplateSummary, type VideoTemplateStatus } from "./types";

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export interface VideoTemplateDTO {
  id: string;
  name: string;
  referenceUrl: string;
  /** Link do YouTube/Pinterest quando o template foi montado a partir de um link. */
  sourceUrl: string | null;
  notes: string | null;
  status: VideoTemplateStatus;
  progress: number | null;
  summary: TemplateSummary | null;
  guide: string | null;
  sampleUrl: string | null;
  error: string | null;
  costSummary: CostSummary | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeTemplate(t: VideoTemplate): VideoTemplateDTO {
  return {
    id: t.id,
    name: t.name,
    referenceUrl: t.referenceUrl,
    sourceUrl: t.sourceUrl,
    notes: t.notes,
    status: t.status as VideoTemplateStatus,
    progress: t.progress,
    summary: parseJson<TemplateSummary>(t.summary),
    guide: t.guide,
    sampleUrl: t.sampleUrl,
    error: t.error,
    costSummary: t.costs ? summarizeCosts(parseCosts(t.costs), ELEVENLABS_USD_PER_CREDIT) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function sanitizeSummary(raw: unknown): TemplateSummary {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cena = Array.isArray(s.cenaS) ? s.cenaS.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const lo = Math.min(Math.max(cena[0] ?? 1.5, 0.5), 10);
  const hi = Math.min(Math.max(cena[cena.length - 1] ?? 3, lo), 12);
  const text = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return { tom: text(s.tom), ritmo: text(s.ritmo), cenaS: [lo, hi], semNarracao: s.semNarracao === true, cta: text(s.cta) };
}

/** Template pronto no formato de VideoPattern (o que o seletor, o roteiro e o editor usam). */
export function templateToPattern(t: VideoTemplate): VideoPattern {
  const summary = parseJson<TemplateSummary>(t.summary) ?? sanitizeSummary(null);
  return {
    id: t.id,
    numero: 0,
    nome: t.name,
    tom: summary.tom,
    ritmo: summary.ritmo,
    duracaoReferenciaS: [],
    cenaS: summary.cenaS,
    semNarracao: summary.semNarracao,
    cta: summary.cta,
    sampleUrl: t.sampleUrl,
    kind: "template",
  };
}

/** Todos os estilos que geram mp4: estilo livre, embutidos e templates prontos (mais novos primeiro). */
export async function listStyles(): Promise<VideoPattern[]> {
  const templates = await prisma.videoTemplate.findMany({ where: { status: "ready" }, orderBy: { createdAt: "desc" } });
  return [FREE_STYLE, ...VIDEO_PATTERNS, ...templates.map(templateToPattern)];
}

export interface ResolvedStyle {
  pattern: VideoPattern;
  /** Guia do estilo que entra no prompt do roteiro. */
  guide: string;
  /** Ficha do motor genérico (só templates; no estilo livre ela vem no roteiro, script.styleSpec). */
  spec: unknown | null;
}

/** Acha um estilo pelo id: estilo livre, embutido, depois template pronto. */
export async function resolveStyle(id: string): Promise<ResolvedStyle | null> {
  if (id === FREE_STYLE_ID) return { pattern: FREE_STYLE, guide: freeStyleGuide(null), spec: null };
  const builtin = getVideoPattern(id);
  if (builtin) return { pattern: builtin, guide: (patternGuides as Record<string, string>)[id] ?? "", spec: null };
  if (!id) return null;
  const t = await prisma.videoTemplate.findUnique({ where: { id } });
  if (!t || t.status !== "ready") return null;
  return { pattern: templateToPattern(t), guide: t.guide ?? "", spec: parseJson<unknown>(t.spec) };
}

/** Resumo do visual dos últimos vídeos em estilo livre (a IA evita repetir). */
export async function recentFreeStyles(excludeId?: string, take = 4): Promise<string[]> {
  const jobs = await prisma.videoJob.findMany({
    where: { patternId: FREE_STYLE_ID, script: { not: null }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: { script: true },
  });
  return jobs
    .map((j) => describeStyleSpec(parseJson<{ styleSpec?: Record<string, unknown> }>(j.script)?.styleSpec))
    .filter((d): d is string => Boolean(d));
}

/** Link aceito para montar template: YouTube ou Pinterest (o worker baixa com yt-dlp). */
export function normalizeSourceLink(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const ok =
    /(^|\.)(youtube\.com|youtu\.be|pin\.it)$/.test(host) || /(^|\.)pinterest\.(com(\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2})$/.test(host);
  if (!ok) return null;
  url.protocol = "https:";
  return url.toString();
}

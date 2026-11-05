// Templates montados pela aplicação a partir de um vídeo de referência (tabela VideoTemplate).
// Só servidor: junta os estilos embutidos (videogen/padroes) com os templates prontos.
import type { VideoTemplate } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import patternGuides from "./patternGuides.json";
import { VIDEO_PATTERNS, getVideoPattern, type VideoPattern } from "./patterns";
import { FREE_STYLE, FREE_STYLE_ID, describeStyleSpec, freeStyleGuide } from "./freeStyle";
import { ELEVENLABS_USD_PER_CREDIT, parseCosts } from "./costs";
import {
  BRAND_ASSET_KINDS,
  summarizeCosts,
  type BrandAssets,
  type BrandFile,
  type BrandSfxRole,
  type CostSummary,
  type TemplateRevision,
  type TemplateSummary,
  type VideoTemplateOrigin,
  type VideoTemplateStatus,
} from "./types";

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
  origin: VideoTemplateOrigin;
  /** Ideia do template escrita pelo usuário (template de marca). */
  brief: string | null;
  brandAssets: BrandAssets | null;
  /** Versões do exemplo, da primeira à atual. */
  revisions: TemplateRevision[];
  /** Alteração pedida que o worker está aplicando (ou vai aplicar). */
  revisionRequest: string | null;
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
    origin: t.origin === "brand" ? "brand" : "reference",
    brief: t.brief,
    brandAssets: parseJson<BrandAssets>(t.brandAssets),
    revisions: parseJson<TemplateRevision[]>(t.revisions) ?? [],
    revisionRequest: t.revisionRequest,
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

/**
 * Template que já tem ficha continua valendo para os vídeos que o usam enquanto está sendo ajustado
 * (na fila, montando ou esperando aprovação) — só não aparece para vídeos novos até ser aprovado.
 */
const USABLE_STATUSES = new Set(["ready", "review", "queued", "analyzing"]);

/** Acha um estilo pelo id: estilo livre, embutido, depois template pronto (ou em ajuste, se já tem ficha). */
export async function resolveStyle(id: string): Promise<ResolvedStyle | null> {
  if (id === FREE_STYLE_ID) return { pattern: FREE_STYLE, guide: freeStyleGuide(null), spec: null };
  const builtin = getVideoPattern(id);
  if (builtin) return { pattern: builtin, guide: (patternGuides as Record<string, string>)[id] ?? "", spec: null };
  if (!id) return null;
  const t = await prisma.videoTemplate.findUnique({ where: { id } });
  if (!t || !t.spec || !USABLE_STATUSES.has(t.status)) return null;
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

// ---------- material da marca (templates "do zero") ----------

const BRAND_LIMITS: Record<keyof BrandAssets, number> = { logos: 4, guides: 6, fonts: 6, sfx: 8, music: 1, images: 6 };
// tudo que o navegador sobe para um template de marca fica em videogen/marcas/<pasta>/ (rota de uploads)
const BRAND_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/videogen\/marcas\/[a-z0-9]{8,32}\/[^?#]+$/;
const SFX_ROLES: BrandSfxRole[] = ["transicao", "impacto", "subida"];

function isBrandUrl(url: string): boolean {
  if (BRAND_URL.test(url)) return true;
  // testes locais (next dev): arquivos servidos pelo próprio app
  return process.env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?\//.test(url);
}

/** Valida o material enviado: só URLs do nosso Blob, limites por tipo. Devolve null se não sobrar nada. */
export function sanitizeBrandAssets(raw: unknown): BrandAssets | null {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as BrandAssets;
  let total = 0;
  for (const kind of BRAND_ASSET_KINDS) {
    const list = Array.isArray(src[kind]) ? (src[kind] as unknown[]) : [];
    out[kind] = list
      .map((item): BrandFile | null => {
        const f = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const url = typeof f.url === "string" ? f.url.trim() : "";
        if (!isBrandUrl(url)) return null;
        const name = (typeof f.name === "string" ? f.name.trim() : "").slice(0, 120) || "arquivo";
        const file: BrandFile = { url, name };
        if (kind === "sfx") file.role = SFX_ROLES.includes(f.role as BrandSfxRole) ? (f.role as BrandSfxRole) : "impacto";
        return file;
      })
      .filter((f): f is BrandFile => f !== null)
      .slice(0, BRAND_LIMITS[kind]);
    total += out[kind].length;
  }
  return total ? out : null;
}

/** Todas as URLs do material (para apagar junto com o template). */
export function brandAssetUrls(json: string | null): string[] {
  const assets = parseJson<BrandAssets>(json);
  if (!assets) return [];
  return BRAND_ASSET_KINDS.flatMap((k) => (assets[k] ?? []).map((f) => f.url));
}

/** Versões guardadas do exemplo. */
export function parseRevisions(json: string | null): TemplateRevision[] {
  return parseJson<TemplateRevision[]>(json) ?? [];
}

/** O que o worker recebe no claim de um template (o ajuste parte da ficha e do exemplo atuais). */
export function templateClaimPayload(t: VideoTemplate) {
  return {
    id: t.id,
    name: t.name,
    referenceUrl: t.referenceUrl,
    sourceUrl: t.sourceUrl,
    notes: t.notes,
    origin: t.origin,
    brief: t.brief,
    brandAssets: parseJson<BrandAssets>(t.brandAssets),
    revisionRequest: t.revisionRequest,
    spec: t.revisionRequest ? parseJson<unknown>(t.spec) : null,
    guide: t.revisionRequest ? t.guide : null,
    buildState: t.revisionRequest ? parseJson<unknown>(t.buildState) : null,
    // pedidos anteriores (a IA não desfaz o que já foi pedido)
    history: parseRevisions(t.revisions)
      .map((r) => r.request)
      .filter((r): r is string => Boolean(r)),
  };
}

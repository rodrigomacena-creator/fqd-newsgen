// Perfis de comunicação do VideoGen (tabela VideoProfile). Só servidor.
// Pessoa = quem fala no vídeo (tom, jeito de falar, voz). Empresa = para quem é o conteúdo
// (tom da marca, site, @, CTA, logo, cores). Os dois entram no prompt do roteiro.
import type { VideoProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { BriefingImage, Pronunciation, VideoProfileDTO, VideoProfileKind } from "./types";
import { MAX_BRIEFING_IMAGES } from "./types";

function parsePronunciations(value: string | null): Pronunciation[] {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? cleanPronunciations(arr) : [];
  } catch {
    return [];
  }
}

export function cleanPronunciations(raw: unknown): Pronunciation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        display: typeof o.display === "string" ? o.display.trim().slice(0, 80) : "",
        spoken: typeof o.spoken === "string" ? o.spoken.trim().slice(0, 160) : "",
      };
    })
    .filter((p) => p.display && p.spoken)
    .slice(0, 40);
}

export function serializeProfile(p: VideoProfile): VideoProfileDTO {
  return {
    ...p,
    kind: p.kind as VideoProfileKind,
    pronunciations: parsePronunciations(p.pronunciations),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** URL aceita pra imagem do usuário: blob nosso (produção) ou caminho local / localhost em dev. */
export function isAllowedImageUrl(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.hostname.endsWith(".public.blob.vercel-storage.com")) return true;
    return process.env.NODE_ENV !== "production" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function cleanBriefingImages(raw: unknown): BriefingImage[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BriefingImage[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url || seen.has(url) || !isAllowedImageUrl(url)) continue;
    seen.add(url);
    const note = typeof o.note === "string" ? o.note.trim().slice(0, 300) : "";
    out.push(note ? { url, note } : { url });
    if (out.length >= MAX_BRIEFING_IMAGES) break;
  }
  return out;
}

export function parseBriefingImages(value: string | null): BriefingImage[] {
  if (!value) return [];
  try {
    return cleanBriefingImages(JSON.parse(value));
  } catch {
    return [];
  }
}

const TEXT_LIMITS = {
  name: 80,
  description: 1500,
  tone: 1500,
  speech: 1500,
  voiceId: 64,
  voiceName: 80,
  site: 120,
  instagram: 60,
  cta: 300,
  colors: 200,
} as const;

/** Valida o corpo de POST/PATCH. `partial` = PATCH (só os campos enviados). */
export function profileInput(body: Record<string, unknown>, partial: boolean): { data: Record<string, unknown> } | { error: string } {
  const data: Record<string, unknown> = {};
  if (!partial || body.kind !== undefined) {
    if (body.kind !== "person" && body.kind !== "company") return { error: "Tipo de perfil inválido." };
    data.kind = body.kind;
  }
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (body[key] === undefined) continue;
    const v = typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
    data[key] = v || null;
  }
  if (typeof data.instagram === "string") data.instagram = "@" + (data.instagram as string).replace(/^@+/, "");
  if (typeof data.site === "string") data.site = (data.site as string).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!partial || body.name !== undefined) {
    if (!data.name) return { error: "Dê um nome ao perfil." };
  }
  if (body.logoUrl !== undefined) {
    const url = typeof body.logoUrl === "string" ? body.logoUrl.trim() : "";
    if (url && !isAllowedImageUrl(url)) return { error: "Logo inválido." };
    data.logoUrl = url || null;
  }
  if (body.pronunciations !== undefined) data.pronunciations = JSON.stringify(cleanPronunciations(body.pronunciations));
  if (body.isDefault !== undefined) data.isDefault = body.isDefault === true;
  if (body.neutral !== undefined) data.neutral = body.neutral === true;
  return { data };
}

/** Marca um perfil como padrão do seu tipo (só um por tipo). */
export async function makeDefault(id: string, kind: string) {
  await prisma.$transaction([
    prisma.videoProfile.updateMany({ where: { kind, isDefault: true, NOT: { id } }, data: { isDefault: false } }),
    prisma.videoProfile.update({ where: { id }, data: { isDefault: true } }),
  ]);
}

export async function getProfile(id: string | null | undefined, kind: VideoProfileKind): Promise<VideoProfileDTO | null> {
  if (!id) return null;
  const p = await prisma.videoProfile.findUnique({ where: { id } });
  return p && p.kind === kind ? serializeProfile(p) : null;
}

/** Pessoa e empresa de um job (perfil apagado = null, o roteiro fica genérico). */
export async function jobProfiles(job: { personId: string | null; companyId: string | null }) {
  const [person, company] = await Promise.all([getProfile(job.personId, "person"), getProfile(job.companyId, "company")]);
  return { person, company };
}

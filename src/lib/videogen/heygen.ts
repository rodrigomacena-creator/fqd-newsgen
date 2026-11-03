// Cliente da API do HeyGen (só servidor). Autenticação com UMA chave: header "X-Api-Key".
//
// Fluxo do avatar falando: POST /v2/video/generate com o personagem (avatar da conta ou "talking
// photo" = foto animada) e o áudio (voice.type "audio" + audio_url) → { data: { video_id } };
// GET /v1/video_status.get?video_id= até "completed" (video_url) ou "failed".
// O avatar é sempre um já criado na conta do HeyGen (ele já tem imagem e voz padrão lá).
//
// Variáveis: HEYGEN_API_KEY (obrigatória pro avatar), HEYGEN_MAX_SECONDS (trecho máximo por pedido,
// padrão 180: a narração inteira costuma ir num pedido só), HEYGEN_VIDEO_PARAMS (JSON extra mesclado
// no corpo do pedido, ex.: {"caption": false}).
import type { AvatarCharacter, HeygenVoice } from "./types";

const API = "https://api.heygen.com";
export const HEYGEN_MAX_SECONDS = Math.max(3, Number(process.env.HEYGEN_MAX_SECONDS) || 180);

function apiKey(): string {
  const key = process.env.HEYGEN_API_KEY?.trim();
  if (!key) throw new Error("HeyGen não configurado: adicione HEYGEN_API_KEY nas variáveis de ambiente.");
  return key;
}

export function heygenConfigured(): { ok: boolean; problem?: string } {
  try {
    apiKey();
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: (e as Error).message };
  }
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const d = JSON.parse(text);
    const err = d?.error ?? d?.message ?? d?.data?.error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object") return String(err.message ?? err.detail ?? JSON.stringify(err)).slice(0, 300);
    return JSON.stringify(d).slice(0, 300);
  } catch {
    return text.slice(0, 300) || `HTTP ${res.status}`;
  }
}

async function call<T>(path: string, init: RequestInit = {}, base = API): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "X-Api-Key": apiKey(), Accept: "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HeyGen (HTTP ${res.status}): ${await readError(res)}`);
  const data = (await res.json()) as { error?: unknown; data?: T };
  if (data.error) {
    const e = data.error as { message?: string } | string;
    throw new Error(`HeyGen: ${typeof e === "string" ? e : (e.message ?? JSON.stringify(e))}`);
  }
  return (data.data ?? data) as T;
}

/** Listas do HeyGen em cache por 10 min (a lista pública deles é grande e lenta). */
let cache: { at: number; list: AvatarCharacter[] } | null = null;
const LIST_TTL_MS = 10 * 60 * 1000;
const LIST_TIMEOUT_MS = 50_000;

interface GroupRow {
  id: string;
  name?: string;
  group_type?: string;
  preview_image?: string;
  default_voice_id?: string;
  num_looks?: number;
}
interface LookRow {
  id: string;
  name?: string;
  image_url?: string;
  default_voice_id?: string;
  status?: string;
}

/** Grupos de avatar são "photo avatar" (looks usados como talking_photo) ou avatar de vídeo (instant/studio). */
const photoGroup = (g: GroupRow) => /photo/i.test(g.group_type ?? "");

/**
 * Avatares da CONTA do HeyGen (pra escolher aqui, como as vozes do ElevenLabs): os grupos de avatar
 * do usuário (`/v2/avatar_group.list?include_public=false`) e os looks de cada um. Se essa listagem
 * falhar, cai para `/v2/avatars` (lista geral, grande) só com as talking photos (que são do usuário).
 */
export async function listCharacters(): Promise<AvatarCharacter[]> {
  if (cache && Date.now() - cache.at < LIST_TTL_MS) return cache.list;
  const out: AvatarCharacter[] = [];
  try {
    const g = await call<{ avatar_group_list?: GroupRow[]; total_count?: number }>("/v2/avatar_group.list?include_public=false", {
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    });
    const groups = (g.avatar_group_list ?? []).filter((x) => x.id);
    const looksPerGroup = await Promise.all(
      groups.map(async (grp) => {
        try {
          const d = await call<{ avatar_list?: LookRow[] }>(`/v2/avatar_group/${encodeURIComponent(grp.id)}/avatars`, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
          return (d.avatar_list ?? []).filter((l) => l.id && !/fail|pending|processing/i.test(l.status ?? ""));
        } catch (e) {
          console.warn("[heygen] looks do grupo falharam:", grp.id, e);
          return [];
        }
      })
    );
    groups.forEach((grp, i) => {
      const looks = looksPerGroup[i];
      const kind: AvatarCharacter["kind"] = photoGroup(grp) ? "talking_photo" : "avatar";
      if (looks.length === 0) {
        out.push({ kind, id: grp.id, name: grp.name || grp.id, previewUrl: grp.preview_image || undefined, defaultVoiceId: grp.default_voice_id || undefined });
        return;
      }
      for (const look of looks) {
        const name = looks.length > 1 ? `${grp.name || "Avatar"} · ${look.name || look.id}` : grp.name || look.name || look.id;
        out.push({ kind, id: look.id, name, previewUrl: look.image_url || grp.preview_image || undefined, defaultVoiceId: look.default_voice_id || grp.default_voice_id || undefined });
      }
    });
  } catch (e) {
    console.warn("[heygen] avatar_group.list falhou, usando /v2/avatars:", e);
  }
  if (out.length === 0) {
    const d = await call<{
      avatars?: { avatar_id: string; avatar_name?: string; preview_image_url?: string; premium?: boolean; default_voice_id?: string }[];
      talking_photos?: { talking_photo_id: string; talking_photo_name?: string; preview_image_url?: string }[];
    }>("/v2/avatars", { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    for (const t of d.talking_photos ?? []) {
      if (t.talking_photo_id) {
        out.push({ kind: "talking_photo", id: t.talking_photo_id, name: t.talking_photo_name || "Foto animada", previewUrl: t.preview_image_url || undefined });
      }
    }
    for (const a of d.avatars ?? []) {
      if (a.avatar_id) {
        out.push({ kind: "avatar", id: a.avatar_id, name: a.avatar_name || a.avatar_id, previewUrl: a.preview_image_url || undefined, defaultVoiceId: a.default_voice_id || undefined });
      }
    }
  }
  cache = { at: Date.now(), list: out };
  return out;
}

let voiceCache: { at: number; list: HeygenVoice[] } | null = null;

/** Vozes do HeyGen (GET /v2/voices), em cache por 10 min. Português primeiro. */
export async function listVoices(): Promise<HeygenVoice[]> {
  if (voiceCache && Date.now() - voiceCache.at < LIST_TTL_MS) return voiceCache.list;
  const d = await call<{ voices?: { voice_id: string; name?: string; language?: string; gender?: string; preview_audio?: string }[] }>(
    "/v2/voices",
    { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) }
  );
  const list: HeygenVoice[] = (d.voices ?? [])
    .filter((v) => v.voice_id)
    .map((v) => ({
      id: v.voice_id,
      name: [v.name || v.voice_id, v.gender ? `(${v.gender})` : ""].filter(Boolean).join(" "),
      language: v.language || undefined,
      previewUrl: v.preview_audio || undefined,
    }));
  const pt = (v: HeygenVoice) => /portug|pt\b|brazil|brasil/i.test(v.language ?? "");
  list.sort((a, b) => Number(pt(b)) - Number(pt(a)) || (a.language ?? "").localeCompare(b.language ?? "") || a.name.localeCompare(b.name));
  voiceCache = { at: Date.now(), list };
  return list;
}

function extraParams(): Record<string, unknown> {
  try {
    const v = JSON.parse(process.env.HEYGEN_VIDEO_PARAMS || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** O que o personagem fala: um áudio pronto (URL pública) ou um texto numa voz do HeyGen. */
export type AvatarSpeech = { type: "audio"; audioUrl: string } | { type: "text"; voiceId: string; text: string };

/** Pede o vídeo do personagem falando. Volta na hora com o id (a geração leva minutos). */
export async function submitAvatar(character: AvatarCharacter, speech: AvatarSpeech, format: "9:16" | "16:9"): Promise<string> {
  const characterInput =
    character.kind === "avatar"
      ? { type: "avatar", avatar_id: character.id, avatar_style: "normal" }
      : { type: "talking_photo", talking_photo_id: character.id, talking_photo_style: "square", talking_style: "stable", expression: "default" };
  const body = {
    video_inputs: [
      {
        character: characterInput,
        voice: speech.type === "audio" ? { type: "audio", audio_url: speech.audioUrl } : { type: "text", voice_id: speech.voiceId, input_text: speech.text },
        background: { type: "color", value: "#000000" },
      },
    ],
    dimension: format === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 },
    caption: false,
    ...extraParams(),
  };
  const d = await call<{ video_id?: string }>("/v2/video/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!d.video_id) throw new Error("HeyGen não devolveu o id do vídeo.");
  return d.video_id;
}

export interface HeygenStatus {
  status: "queued" | "in_progress" | "completed" | "failed";
  videoUrl?: string;
  durationS?: number;
  error?: string;
}

export async function avatarStatus(videoId: string): Promise<HeygenStatus> {
  const d = await call<{ status?: string; video_url?: string; duration?: number; error?: { message?: string; detail?: string } | string | null }>(
    `/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`
  );
  const s = String(d.status ?? "").toLowerCase();
  if (s === "completed") {
    return d.video_url
      ? { status: "completed", videoUrl: d.video_url, durationS: Number(d.duration) > 0 ? Number(d.duration) : undefined }
      : { status: "failed", error: "HeyGen terminou sem devolver o vídeo." };
  }
  if (s === "failed") {
    const e = d.error;
    const msg = typeof e === "string" ? e : (e?.detail ?? e?.message ?? "falha na geração");
    return { status: "failed", error: `HeyGen: ${msg}` };
  }
  return { status: s === "processing" ? "in_progress" : "queued" };
}

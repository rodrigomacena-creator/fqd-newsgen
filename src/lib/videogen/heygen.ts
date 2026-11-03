// Cliente da API do HeyGen (só servidor). Autenticação com UMA chave: header "X-Api-Key".
//
// Fluxo do avatar falando: POST /v2/video/generate com o personagem (avatar da conta ou "talking
// photo" = foto animada) e o áudio (voice.type "audio" + audio_url) → { data: { video_id } };
// GET /v1/video_status.get?video_id= até "completed" (video_url) ou "failed".
// A foto enviada pelo usuário vira uma talking photo na conta dele (POST upload.heygen.com/v1/talking_photo).
//
// Variáveis: HEYGEN_API_KEY (obrigatória pro avatar), HEYGEN_MAX_SECONDS (trecho máximo por pedido,
// padrão 180: a narração inteira costuma ir num pedido só), HEYGEN_VIDEO_PARAMS (JSON extra mesclado
// no corpo do pedido, ex.: {"caption": false}).
import type { AvatarCharacter } from "./types";

const API = "https://api.heygen.com";
const UPLOAD = "https://upload.heygen.com";
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

/** Avatares e fotos falantes cadastrados na conta do HeyGen (pra escolher aqui, como as vozes do ElevenLabs). */
export async function listCharacters(): Promise<AvatarCharacter[]> {
  const d = await call<{
    avatars?: { avatar_id: string; avatar_name?: string; preview_image_url?: string }[];
    talking_photos?: { talking_photo_id: string; talking_photo_name?: string; preview_image_url?: string }[];
  }>("/v2/avatars");
  const out: AvatarCharacter[] = [];
  for (const a of d.avatars ?? []) {
    if (a.avatar_id) out.push({ kind: "avatar", id: a.avatar_id, name: a.avatar_name || a.avatar_id, previewUrl: a.preview_image_url || undefined });
  }
  for (const t of d.talking_photos ?? []) {
    if (t.talking_photo_id) {
      out.push({ kind: "talking_photo", id: t.talking_photo_id, name: t.talking_photo_name || "Foto animada", previewUrl: t.preview_image_url || undefined });
    }
  }
  return out;
}

/** Sobe uma foto (URL pública, ex.: Blob) como talking photo na conta do HeyGen. */
export async function uploadTalkingPhoto(imageUrl: string): Promise<AvatarCharacter> {
  const src = await fetch(imageUrl);
  if (!src.ok) throw new Error(`Não consegui baixar a foto do avatar (HTTP ${src.status}).`);
  const type = (src.headers.get("content-type") || "").split(";")[0].trim();
  const contentType = type === "image/png" || type === "image/jpeg" ? type : /\.png(\?|$)/i.test(imageUrl) ? "image/png" : "image/jpeg";
  const bytes = Buffer.from(await src.arrayBuffer());
  const d = await call<{ talking_photo_id?: string; talking_photo_url?: string }>(
    "/v1/talking_photo",
    { method: "POST", headers: { "Content-Type": contentType }, body: bytes },
    UPLOAD
  );
  if (!d.talking_photo_id) throw new Error("HeyGen não devolveu o id da foto animada.");
  return { kind: "talking_photo", id: d.talking_photo_id, name: "Foto enviada", previewUrl: d.talking_photo_url || imageUrl };
}

function extraParams(): Record<string, unknown> {
  try {
    const v = JSON.parse(process.env.HEYGEN_VIDEO_PARAMS || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Pede o vídeo do personagem falando o áudio. Volta na hora com o id (a geração leva minutos). */
export async function submitAvatar(character: AvatarCharacter, audioUrl: string, format: "9:16" | "16:9"): Promise<string> {
  const characterInput =
    character.kind === "avatar"
      ? { type: "avatar", avatar_id: character.id, avatar_style: "normal" }
      : { type: "talking_photo", talking_photo_id: character.id, talking_photo_style: "square", talking_style: "stable", expression: "default" };
  const body = {
    video_inputs: [
      {
        character: characterInput,
        voice: { type: "audio", audio_url: audioUrl },
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
  error?: string;
}

export async function avatarStatus(videoId: string): Promise<HeygenStatus> {
  const d = await call<{ status?: string; video_url?: string; error?: { message?: string; detail?: string } | string | null }>(
    `/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`
  );
  const s = String(d.status ?? "").toLowerCase();
  if (s === "completed") {
    return d.video_url ? { status: "completed", videoUrl: d.video_url } : { status: "failed", error: "HeyGen terminou sem devolver o vídeo." };
  }
  if (s === "failed") {
    const e = d.error;
    const msg = typeof e === "string" ? e : (e?.detail ?? e?.message ?? "falha na geração");
    return { status: "failed", error: `HeyGen: ${msg}` };
  }
  return { status: s === "processing" ? "in_progress" : "queued" };
}

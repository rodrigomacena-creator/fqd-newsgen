// Cliente da API do Higgsfield (só servidor). Fluxo assíncrono da plataforma deles:
// POST {base}/{modelo} com os parâmetros → { request_id, status_url, cancel_url };
// GET status_url até "completed" (vídeo em video.url) ou "failed"/"nsfw"/"canceled".
// Autenticação: "Authorization: Key KEY_ID:KEY_SECRET".
//
// O modelo do avatar falando (foto + áudio → vídeo com lipsync) e os nomes dos campos ficam
// configuráveis por variável de ambiente, porque o catálogo de modelos deles muda com frequência:
//   HIGGSFIELD_AVATAR_MODEL   caminho do modelo (ex.: "higgsfield/speak-v2/image-to-video")
//   HIGGSFIELD_AVATAR_PARAMS  JSON extra mesclado no corpo (ex.: {"quality":"high"})
//   HIGGSFIELD_IMAGE_FIELD / HIGGSFIELD_AUDIO_FIELD  nomes dos campos (padrão image_url / audio_url)
//   HIGGSFIELD_MAX_SECONDS    trecho máximo de áudio por pedido (padrão 15)

export const HIGGSFIELD_BASE = (process.env.HIGGSFIELD_BASE_URL || "https://api.higgsfield.ai").replace(/\/+$/, "");
export const HIGGSFIELD_AVATAR_MODEL = (process.env.HIGGSFIELD_AVATAR_MODEL || "").replace(/^\/+|\/+$/g, "");
export const HIGGSFIELD_MAX_SECONDS = Math.max(3, Number(process.env.HIGGSFIELD_MAX_SECONDS) || 15);

function authHeader(): string {
  const id = process.env.HIGGSFIELD_KEY_ID?.trim();
  const secret = process.env.HIGGSFIELD_KEY_SECRET?.trim();
  if (id && secret) return `Key ${id}:${secret}`;
  const combined = process.env.HIGGSFIELD_API_KEY?.trim();
  if (combined) return combined.startsWith("Key ") ? combined : `Key ${combined}`;
  throw new Error("Higgsfield não configurado: adicione HIGGSFIELD_KEY_ID e HIGGSFIELD_KEY_SECRET nas variáveis de ambiente.");
}

export function higgsfieldConfigured(): { ok: boolean; problem?: string } {
  try {
    authHeader();
  } catch (e) {
    return { ok: false, problem: (e as Error).message };
  }
  if (!HIGGSFIELD_AVATAR_MODEL) return { ok: false, problem: "Higgsfield sem modelo de avatar: defina HIGGSFIELD_AVATAR_MODEL." };
  return { ok: true };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const d = JSON.parse(text);
    const msg = d?.detail ?? d?.error ?? d?.message;
    return typeof msg === "string" ? msg : JSON.stringify(msg ?? d).slice(0, 300);
  } catch {
    return text.slice(0, 300) || `HTTP ${res.status}`;
  }
}

function extraParams(): Record<string, unknown> {
  try {
    const v = JSON.parse(process.env.HIGGSFIELD_AVATAR_PARAMS || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export interface HiggsfieldRequest {
  requestId: string;
  statusUrl: string;
}

/** Pede um vídeo do avatar falando o áudio. Volta na hora com o id do pedido (a geração leva minutos). */
export async function submitAvatar(imageUrl: string, audioUrl: string, prompt?: string): Promise<HiggsfieldRequest> {
  const body: Record<string, unknown> = {
    [process.env.HIGGSFIELD_IMAGE_FIELD || "image_url"]: imageUrl,
    [process.env.HIGGSFIELD_AUDIO_FIELD || "audio_url"]: audioUrl,
    ...(prompt ? { prompt } : {}),
    ...extraParams(),
  };
  const res = await fetch(`${HIGGSFIELD_BASE}/${HIGGSFIELD_AVATAR_MODEL}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Higgsfield recusou o pedido (HTTP ${res.status}): ${await readError(res)}`);
  const data = (await res.json()) as { request_id?: string; id?: string; status_url?: string };
  const requestId = data.request_id || data.id;
  if (!requestId) throw new Error("Higgsfield não devolveu o id do pedido.");
  return { requestId, statusUrl: data.status_url || `${HIGGSFIELD_BASE}/requests/${requestId}/status` };
}

export interface HiggsfieldStatus {
  status: "queued" | "in_progress" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

function findVideoUrl(d: Record<string, unknown>): string | undefined {
  const v = d.video as { url?: string } | undefined;
  if (v?.url) return v.url;
  const vs = d.videos as { url?: string }[] | undefined;
  if (Array.isArray(vs) && vs[0]?.url) return vs[0].url;
  for (const key of ["output", "result", "data"]) {
    const inner = d[key];
    if (inner && typeof inner === "object") {
      const found = findVideoUrl(inner as Record<string, unknown>);
      if (found) return found;
    }
  }
  return typeof d.url === "string" ? d.url : undefined;
}

export async function avatarStatus(statusUrl: string): Promise<HiggsfieldStatus> {
  const res = await fetch(statusUrl, { headers: { Authorization: authHeader(), Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Higgsfield: falha ao consultar o pedido (HTTP ${res.status}): ${await readError(res)}`);
  const d = (await res.json()) as Record<string, unknown>;
  const s = String(d.status ?? "").toLowerCase();
  if (s === "completed" || s === "succeeded" || s === "success") {
    const videoUrl = findVideoUrl(d);
    return videoUrl ? { status: "completed", videoUrl } : { status: "failed", error: "Higgsfield terminou sem devolver o vídeo." };
  }
  if (s === "failed" || s === "error" || s === "nsfw" || s === "canceled" || s === "cancelled") {
    const reason = s === "nsfw" ? "o filtro de conteúdo do Higgsfield bloqueou a geração" : String(d.error ?? d.message ?? s);
    return { status: "failed", error: reason };
  }
  return { status: s === "queued" || s === "pending" ? "queued" : "in_progress" };
}

const API = "https://api.elevenlabs.io/v1";

// Configuração aprovada pelo Rodrigo ("a voz está perfeita"): eleven_v4 com ajustes leves.
export const TTS_MODEL = "eleven_v4";
export const TTS_VOICE_SETTINGS = {
  stability: 0.6,
  similarity_boost: 0.8,
  style: 0.1,
  use_speaker_boost: true,
  speed: 1.2,
};

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY não configurada. Adicione a chave nas variáveis de ambiente.");
  return key;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    const detail = data?.detail;
    return typeof detail === "string" ? detail : detail?.message || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

export interface VoiceOption {
  id: string;
  name: string;
  category: string;
  language: string | null;
  previewUrl: string | null;
}

/** Nome de exibição no app, por id de voz (sobrepõe o nome cadastrado no ElevenLabs). */
export const VOICE_DISPLAY_NAMES: Record<string, string> = {
  UY3oRETjQaraEM058uNo: "Macena", // no ElevenLabs se chama "Marco  Narração"
};

export async function listVoices(): Promise<VoiceOption[]> {
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": apiKey() }, cache: "no-store" });
  if (!res.ok) throw new Error(`ElevenLabs recusou a listagem de vozes: ${await readError(res)}`);
  const data = (await res.json()) as {
    voices: {
      voice_id: string;
      name: string;
      category: string;
      labels?: { language?: string };
      fine_tuning?: { language?: string | null };
      preview_url?: string | null;
    }[];
  };
  const order = (v: VoiceOption) => (v.category === "cloned" ? 0 : v.language === "pt" ? 1 : 2);
  return data.voices
    .map((v) => ({
      id: v.voice_id,
      name: VOICE_DISPLAY_NAMES[v.voice_id] ?? v.name.replace(/[\p{C}\s]+/gu, " ").trim(),
      category: v.category,
      language: v.labels?.language ?? v.fine_tuning?.language ?? null,
      previewUrl: v.preview_url ?? null,
    }))
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

export interface TtsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export async function textToSpeechWithTimestamps(
  voiceId: string,
  text: string
): Promise<{ audio: Buffer; alignment: TtsAlignment; credits: number | null }> {
  const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      language_code: "pt",
      voice_settings: TTS_VOICE_SETTINGS,
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs recusou a narração: ${await readError(res)}`);
  const data = (await res.json()) as { audio_base64: string; alignment: TtsAlignment | null };
  if (!data.alignment) throw new Error("ElevenLabs não retornou o alinhamento das palavras.");
  // créditos cobrados por esta narração (header do ElevenLabs; o eleven_v4 cobra menos de 1 por caractere)
  const cost = Number(res.headers.get("character-cost"));
  return {
    audio: Buffer.from(data.audio_base64, "base64"),
    alignment: data.alignment,
    credits: Number.isFinite(cost) && res.headers.has("character-cost") ? cost : null,
  };
}

/**
 * Clonagem instantânea (Instant Voice Clone): cria uma voz nova na conta a partir de amostras de áudio.
 * Devolve o voice_id. A conta precisa de plano com clonagem (Starter ou maior).
 */
export async function cloneVoice(params: {
  name: string;
  description?: string;
  files: { name: string; type: string; data: ArrayBuffer }[];
  removeBackgroundNoise: boolean;
}): Promise<string> {
  const form = new FormData();
  form.append("name", params.name);
  if (params.description) form.append("description", params.description);
  form.append("remove_background_noise", String(params.removeBackgroundNoise));
  form.append("labels", JSON.stringify({ language: "pt", origem: "videogen" }));
  for (const f of params.files) form.append("files", new Blob([f.data], { type: f.type }), f.name);
  const res = await fetch(`${API}/voices/add`, { method: "POST", headers: { "xi-api-key": apiKey() }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs recusou a criação da voz: ${await readError(res)}`);
  const data = (await res.json()) as { voice_id?: string };
  if (!data.voice_id) throw new Error("ElevenLabs não devolveu o id da voz.");
  return data.voice_id;
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

/**
 * Transcreve um áudio/vídeo (ElevenLabs Speech to Text) e devolve as palavras com tempo.
 * `source` = URL pública (o ElevenLabs baixa sozinho, sem passar o arquivo pela função) ou o arquivo.
 */
export async function speechToText(source: string | Blob, languageCode = "pt"): Promise<{ words: TranscriptWord[]; text: string }> {
  const form = new FormData();
  form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
  form.append("language_code", languageCode);
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  if (typeof source === "string") form.append("cloud_storage_url", source);
  else form.append("file", source, "audio");
  const res = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": apiKey() }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs não transcreveu o vídeo: ${await readError(res)}`);
  const data = (await res.json()) as { text?: string; words?: { text: string; start: number; end: number; type?: string }[] };
  const words = (data.words ?? [])
    .filter((w) => (w.type ?? "word") === "word" && w.text.trim())
    .map((w) => ({ text: w.text.trim(), start: Number(w.start) || 0, end: Number(w.end) || 0 }));
  return { words, text: data.text ?? words.map((w) => w.text).join(" ") };
}

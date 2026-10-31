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

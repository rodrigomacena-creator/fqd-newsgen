// Tipos compartilhados do VideoGen (client + servidor + contrato com o worker).
// Este arquivo é "puro" (sem imports de servidor) de propósito.
import type { SceneDirection } from "./direction";
import type { SceneGraphic, SceneOverlay } from "./graphics";

export interface VideoScene {
  /** Trecho da narração falado nesta cena, com a grafia de exibição (vira legenda). */
  narration: string;
  /** Texto grande na tela, quando o padrão usa (palavra-chave, título, número). */
  onScreen: string;
  /** Descrição em português do que aparece na cena (pra revisão humana). */
  visual: string;
  /** Prompt em inglês pro modelo de imagem, já no estilo do padrão. */
  imagePrompt: string;
  /** Duração sugerida em segundos (usada quando não há narração; com narração o corte segue as palavras). */
  durationS: number;
  /** Imagem enviada pelo usuário (briefing) usada nesta cena no lugar da imagem gerada por IA. */
  imageUrl?: string;
  /** Direção de movimento da cena (todos os estilos; roteiro antigo sem direção renderiza como antes). Ver direction.ts. */
  direction?: SceneDirection;
  /** Storyboard: imagem já gerada antes do render e o prompt que a gerou (vale enquanto o prompt for o mesmo). */
  preview?: { url: string; prompt: string };
  /** Só no estilo livre: formato de montagem desta cena (ver SCENE_LAYOUTS em freeStyle.ts). */
  layout?: string;
  /** Só no estilo livre: busca em inglês de um vídeo de banco (Pixabay/Pexels) para esta cena. */
  stockQuery?: string;
  /** Clipe de banco (Pixabay/Pexels) escolhido para a cena (o worker usa no lugar da imagem). */
  stock?: { url: string; thumb: string; id: number; query: string; pick?: number; source?: "pixabay" | "pexels" | "upload" };
  /** Mostra o vídeo base (avatar do HeyGen ou vídeo do usuário) nesta cena em vez da imagem. */
  avatar?: boolean;
  /** Grafismo animado da cena (motor genérico: estilo livre e templates). Ver graphics.ts ↔ worker/render/mograph.py. */
  graphic?: SceneGraphic;
  /** Motion desenhado por cima da foto da cena (anotação, número, etiquetas...). Ver graphics.ts ↔ worker/render/overlay.py. */
  overlay?: SceneOverlay;
  /** Transição de entrada desta cena (motor genérico); vale mais que a da ficha. Ver TRANSITION_KINDS em freeStyle.ts. */
  transition?: string;
}

// ---------- vídeo base (avatar falando / vídeo do usuário) ----------

/**
 * Trilha fixa de vídeo por baixo das cenas. "higgsfield": avatar gerado a partir de uma foto +
 * a narração do ElevenLabs (lipsync, em trechos). "upload": vídeo pronto do usuário; a fala dele
 * vira a narração (transcrita no ElevenLabs para ter o tempo das palavras).
 * Vale só enquanto `narrationUrl` for a narração atual do job.
 */
/** Personagem do HeyGen: avatar da conta ou "talking photo" (foto animada). */
export interface AvatarCharacter {
  kind: "avatar" | "talking_photo";
  id: string;
  name?: string;
  previewUrl?: string;
  /** Voz padrão do avatar no HeyGen (usada quando a pessoa não escolhe uma voz). */
  defaultVoiceId?: string;
}

export function parseCharacter(value: unknown): AvatarCharacter | null {
  const o = typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { return null; } })() : value;
  if (!o || typeof o !== "object") return null;
  const c = o as Record<string, unknown>;
  if ((c.kind !== "avatar" && c.kind !== "talking_photo") || typeof c.id !== "string" || !c.id.trim()) return null;
  return {
    kind: c.kind,
    id: c.id.trim().slice(0, 120),
    name: typeof c.name === "string" ? c.name.trim().slice(0, 120) || undefined : undefined,
    previewUrl: typeof c.previewUrl === "string" && /^https?:\/\//.test(c.previewUrl) ? c.previewUrl.slice(0, 800) : undefined,
    defaultVoiceId: typeof c.defaultVoiceId === "string" && c.defaultVoiceId.trim() ? c.defaultVoiceId.trim().slice(0, 120) : undefined,
  };
}

/** Voz do HeyGen (caminho "Avatar por IA": o HeyGen fala o texto do roteiro com ela). */
export interface HeygenVoice {
  id: string;
  name: string;
  language?: string;
  previewUrl?: string;
}

export function parseVoice(value: unknown): HeygenVoice | null {
  const o = typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { return null; } })() : value;
  if (!o || typeof o !== "object") return null;
  const v = o as Record<string, unknown>;
  if (typeof v.id !== "string" || !v.id.trim()) return null;
  return {
    id: v.id.trim().slice(0, 120),
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 120) : v.id.trim().slice(0, 120),
    language: typeof v.language === "string" ? v.language.slice(0, 40) : undefined,
    previewUrl: typeof v.previewUrl === "string" && /^https?:\/\//.test(v.previewUrl) ? v.previewUrl.slice(0, 800) : undefined,
  };
}

export interface AvatarTrack {
  /** "heygen" = avatar falando; "higgsfield" = trilhas antigas (provedor anterior, não dá mais para consultar). */
  source: "heygen" | "higgsfield" | "upload";
  status: "generating" | "ready" | "failed";
  /** Narração (ou o próprio vídeo, no upload) com que esta trilha está sincronizada. */
  narrationUrl: string;
  /** Foto enviada que virou o personagem (quando não foi escolhido um avatar da conta). */
  imageUrl?: string;
  /** HeyGen: avatar ou foto animada usada. */
  character?: AvatarCharacter;
  /** HeyGen: voz do HeyGen que falou o texto (o HeyGen gera vídeo + áudio; nada do ElevenLabs). */
  voice?: HeygenVoice;
  /** HeyGen: texto falado (narração do roteiro na hora do pedido). Diferente do roteiro atual = avatar desatualizado. */
  text?: string;
  /** Provedor anterior: modelo usado. */
  model?: string;
  /** Trechos em sequência, cobrindo do 0 ao fim da fala (o upload tem um só). */
  segments: AvatarSegment[];
  durationS: number;
  error?: string;
  createdAt: string;
}

export interface AvatarSegment {
  start: number;
  end: number;
  /** Trecho da narração enviado (mp3 no Blob). */
  audioUrl?: string;
  /** HeyGen: video_id do pedido. */
  requestId?: string;
  /** Provedor anterior: URL de consulta. */
  statusUrl?: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  /** Vídeo do trecho no Blob (copiado do provedor, cujo link expira). */
  videoUrl?: string;
  error?: string;
}

/** Quem fala no vídeo (escolhido no passo 2 da criação). */
export type Speaker = "ai_voice" | "ai_avatar" | "upload";
export const parseSpeaker = (v: unknown): Speaker => (v === "ai_avatar" || v === "upload" ? v : "ai_voice");
export const SPEAKER_LABEL: Record<Speaker, string> = {
  ai_voice: "Voz por IA",
  ai_avatar: "Avatar por IA",
  upload: "Áudio / vídeo enviado",
};

/** Fala gravada (áudio/vídeo enviado): a narração é a transcrição e o texto falado não se edita. */
export function fixedSpeech(job: { speaker: string; narrationUrl: string | null; narrationWords: unknown }): boolean {
  return job.speaker === "upload" && Boolean(job.narrationUrl) && Boolean(job.narrationWords);
}

export const AVATAR_SOURCE_LABEL: Record<AvatarTrack["source"], string> = {
  heygen: "Avatar (HeyGen)",
  higgsfield: "Avatar (Higgsfield, antigo)",
  upload: "Vídeo seu",
};

/** A trilha base vale para a narração atual? */
export function avatarReady(avatar: AvatarTrack | null | undefined, narrationUrl: string | null): boolean {
  return Boolean(avatar && avatar.status === "ready" && narrationUrl && avatar.narrationUrl === narrationUrl);
}

/** Avatar do HeyGen gerado de um texto que já não é o do roteiro (a pessoa editou a fala depois). */
export function avatarStale(avatar: AvatarTrack | null | undefined, script: VideoScript | null): boolean {
  if (!avatar || avatar.source !== "heygen" || typeof avatar.text !== "string" || !script) return false;
  return normalizeSpeech(avatar.text) !== normalizeSpeech(fullNarration(script));
}

function normalizeSpeech(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Imagem que o usuário subiu no briefing do vídeo (vai pra IA ver e pode ser usada nas cenas). */
export interface BriefingImage {
  url: string;
  /** Observação opcional do usuário sobre a imagem (ex.: "logo do cliente", "foto do produto"). */
  note?: string;
}

export const MAX_BRIEFING_IMAGES = 8;

// ---------- perfis (quem fala e para qual empresa) ----------

export type VideoProfileKind = "person" | "company";

export interface VideoProfileDTO {
  id: string;
  kind: VideoProfileKind;
  name: string;
  description: string | null;
  tone: string | null;
  speech: string | null;
  voiceId: string | null;
  voiceName: string | null;
  site: string | null;
  instagram: string | null;
  cta: string | null;
  logoUrl: string | null;
  /** Pessoa: foto usada para gerar o avatar falando (vira foto animada no HeyGen). */
  avatarUrl: string | null;
  /** Pessoa: avatar/foto animada já cadastrado na conta do HeyGen (JSON de AvatarCharacter). */
  heygenAvatar: string | null;
  /** Pessoa: voz do HeyGen (JSON de HeygenVoice) usada no caminho "Avatar por IA". */
  heygenVoice: string | null;
  colors: string | null;
  pronunciations: Pronunciation[];
  isDefault: boolean;
  /** Conteúdo neutro e informativo: sem marca, sem venda, CTA só de engajamento. */
  neutral: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pronunciation {
  /** Como aparece na legenda (ex.: "SEO"). */
  display: string;
  /** Como o ElevenLabs deve falar (ex.: "És-í-ôu"). */
  spoken: string;
}

export interface VideoScript {
  title: string;
  scenes: VideoScene[];
  cta: {
    onScreen: string;
    narration: string;
    /** Efeito por cima do fecho (worker/render/cta_fx.py). Sem campo = nenhum. */
    effect?: CtaEffect;
    /** Imagem mostrada no fecho (precisa estar nas imagens do briefing, como as fotos das cenas). */
    imageUrl?: string;
    /** Logo no topo do fecho: da empresa (padrão), outro enviado (logoUrl) ou nenhum. */
    logo?: "company" | "custom" | "none";
    logoUrl?: string;
    /** Tamanho do texto do CTA na tela (1 = padrão; ver CTA_FONT_SCALE). Vale no motor genérico (estilo livre e templates). */
    fontScale?: number;
  };
  /** Palavras que o render destaca (caixa vermelha, cor de destaque etc.). */
  keywords: string[];
  /** Opções de abertura (gancho) que a IA escreveu; a cena 1 usa uma delas e o editor deixa trocar. */
  hooks?: { narration: string; onScreen: string }[];
  /** Prompt em inglês pra trilha (ElevenLabs Music). */
  musicPrompt: string;
  /** Título sugerido para o post (YouTube/Reels/portal); vídeos antigos não têm e usam `title`. */
  postTitle?: string;
  /** Legenda do post (Instagram/YouTube) com hashtags. */
  postCaption: string;
  /** Pronúncias extras deste vídeo, somadas ao dicionário padrão. */
  pronunciations: Pronunciation[];
  /** Só no "estilo livre": ficha de estilo que a IA montou para este vídeo (formato do motor genérico). */
  styleSpec?: Record<string, unknown>;
  /** Trilha já gerada pelo worker (reaproveitada no próximo render se o musicPrompt não mudou e ela é longa o bastante). */
  musicTrack?: { url: string; prompt: string; seconds: number };
}

/** [palavra de exibição, início em s, fim em s] — mesmo formato do words.json do pipeline Python. */
export type NarrationWord = [string, number, number];

export type VideoJobStatus = "draft" | "script_ready" | "queued" | "rendering" | "done" | "failed";

export const VIDEO_STATUS_LABEL: Record<VideoJobStatus, string> = {
  draft: "Rascunho",
  script_ready: "Roteiro pronto",
  queued: "Na fila de render",
  rendering: "Renderizando",
  done: "Pronto",
  failed: "Falhou",
};

export function fullNarration(script: VideoScript): string {
  return [...script.scenes.map((s) => s.narration), script.cta.narration]
    .map((t) => t.trim())
    .filter(Boolean)
    .join(" ");
}

export const DEFAULT_VOICE_ID = "UY3oRETjQaraEM058uNo"; // "Macena" (voz clonada do Rodrigo)
export const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
/** Formato do vídeo: vertical (Reels/Shorts, padrão) ou horizontal (YouTube normal). */
export type VideoFormat = "9:16" | "16:9";
export const parseVideoFormat = (v: unknown): VideoFormat => (v === "16:9" ? "16:9" : "9:16");
/** Horizontal (YouTube) aceita vídeos mais longos. */
export const LANDSCAPE_DURATION_OPTIONS = [30, 60, 90, 120, 180];
export const MAX_DURATION_S: Record<VideoFormat, number> = { "9:16": 90, "16:9": 180 };

// Ritmo medido com a voz Macena no eleven_v4 (ele ignora "speed" e adiciona pausas de
// respiração): ~2,3 palavras/s em pt-BR. Usado pra dimensionar o roteiro e a estimativa na tela.
export const WORDS_PER_SECOND = 2.3;

// ---------- templates (estilos montados a partir de um vídeo de referência) ----------

export type VideoTemplateStatus = "queued" | "analyzing" | "review" | "ready" | "failed";

export const TEMPLATE_STATUS_LABEL: Record<VideoTemplateStatus, string> = {
  queued: "Na fila",
  analyzing: "Montando",
  review: "Para aprovar",
  ready: "Pronto",
  failed: "Falhou",
};

/** reference = montado a partir de um vídeo; brand = do zero, com o material da marca. */
export type VideoTemplateOrigin = "reference" | "brand";

/** Papel de um efeito sonoro da marca (o worker troca o efeito padrão daquele papel). */
export type BrandSfxRole = "transicao" | "impacto" | "subida";

export interface BrandFile {
  url: string;
  /** Nome do arquivo enviado (a IA usa o nome das fontes para descrevê-las). */
  name: string;
  /** Só efeitos sonoros. */
  role?: BrandSfxRole;
}

/** Material da marca enviado para um template "do zero" (VideoTemplate.brandAssets). */
export interface BrandAssets {
  logos: BrandFile[];
  guides: BrandFile[];
  fonts: BrandFile[];
  sfx: BrandFile[];
  music: BrandFile[];
  images: BrandFile[];
}

export const BRAND_ASSET_KINDS = ["logos", "guides", "fonts", "sfx", "music", "images"] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

/** Uma versão do exemplo: o pedido que a gerou (null = primeira versão) e o vídeo. */
export interface TemplateRevision {
  request: string | null;
  sampleUrl: string | null;
  at: string;
  /** O que a IA diz que mudou nesta versão. */
  note?: string;
}

/** Resumo do estilo que a IA devolve ao analisar o vídeo (mesmos campos do VideoPattern). */
export interface TemplateSummary {
  tom: string;
  ritmo: string;
  cenaS: [number, number];
  semNarracao: boolean;
  cta: string;
}

// ---------- custos ----------

export type CostStep = "script" | "narration" | "images" | "music" | "analysis";

/** Um gasto registrado no job. A lista só cresce: gerar o roteiro de novo soma outro gasto. */
export interface CostEntry {
  step: CostStep;
  provider: "openrouter" | "elevenlabs";
  /** Custo em dólar informado pela OpenRouter (usage.cost). */
  usd?: number;
  /** Créditos do ElevenLabs (header character-cost da narração; trilha estimada por segundo). */
  credits?: number;
  /** Se o valor é estimado (trilha) e não medido. */
  estimated?: boolean;
  at: string;
}

export interface CostSummary {
  openrouterUsd: number;
  elevenCredits: number;
  elevenUsd: number;
  totalUsd: number;
  /** Total por etapa, em dólar (créditos já convertidos). */
  byStep: Partial<Record<CostStep, number>>;
  hasEstimate: boolean;
}

export const COST_STEP_LABEL: Record<CostStep, string> = {
  script: "Roteiro (OpenRouter)",
  narration: "Narração (ElevenLabs)",
  images: "Imagens das cenas (OpenRouter)",
  music: "Trilha (ElevenLabs)",
  analysis: "Análise do vídeo de referência (OpenRouter)",
};

export function summarizeCosts(entries: CostEntry[], usdPerCredit: number): CostSummary {
  const s: CostSummary = { openrouterUsd: 0, elevenCredits: 0, elevenUsd: 0, totalUsd: 0, byStep: {}, hasEstimate: false };
  for (const e of entries) {
    const usd = (e.usd ?? 0) + (e.credits ?? 0) * usdPerCredit;
    if (e.provider === "openrouter") s.openrouterUsd += e.usd ?? 0;
    else {
      s.elevenCredits += e.credits ?? 0;
      s.elevenUsd += (e.credits ?? 0) * usdPerCredit;
    }
    s.byStep[e.step] = (s.byStep[e.step] ?? 0) + usd;
    if (e.estimated) s.hasEstimate = true;
  }
  s.totalUsd = s.openrouterUsd + s.elevenUsd;
  return s;
}

/** Efeitos do fecho: mesmo cardápio de EFFECTS em worker/render/cta_fx.py. */
/** Faixa do tamanho do texto do CTA; 1 = padrão = 8,5% da largura do vídeo (espelha cta_font_scale em worker/render/template_engine.py). */
export const CTA_FONT_SCALE = { min: 0.1, max: 2, step: 0.05 } as const;

export const CTA_EFFECTS = [
  { id: "none", label: "Nenhum" },
  { id: "confete", label: "Confete" },
  { id: "brilhos", label: "Brilhos" },
  { id: "pulso", label: "Pulso" },
  { id: "flash", label: "Flash" },
  { id: "seta", label: "Seta para baixo" },
] as const;
export type CtaEffect = (typeof CTA_EFFECTS)[number]["id"];

/**
 * URL que força o download em vez de abrir no navegador. O atributo `download` do `<a>` é ignorado quando o
 * arquivo está em outro domínio (o Blob da Vercel); o Blob aceita `?download=1` e responde com
 * Content-Disposition: attachment (o nome do arquivo vem do próprio blob).
 */
export function downloadUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("download", "1");
    return u.toString();
  } catch {
    return url;
  }
}

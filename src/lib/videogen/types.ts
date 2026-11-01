// Tipos compartilhados do VideoGen (client + servidor + contrato com o worker).
// Este arquivo é "puro" (sem imports de servidor) de propósito.
import type { SceneDirection } from "./direction";

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
  /** Só no estilo livre: busca em inglês de um vídeo de banco (Pexels) para esta cena. */
  stockQuery?: string;
  /** Clipe do Pexels escolhido para a cena (o worker usa no lugar da imagem). */
  stock?: { url: string; thumb: string; id: number; query: string; pick?: number };
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
  cta: { onScreen: string; narration: string };
  /** Palavras que o render destaca (caixa vermelha, cor de destaque etc.). */
  keywords: string[];
  /** Opções de abertura (gancho) que a IA escreveu; a cena 1 usa uma delas e o editor deixa trocar. */
  hooks?: { narration: string; onScreen: string }[];
  /** Prompt em inglês pra trilha (ElevenLabs Music). */
  musicPrompt: string;
  /** Legenda do post (Instagram/YouTube) com hashtags. */
  postCaption: string;
  /** Pronúncias extras deste vídeo, somadas ao dicionário padrão. */
  pronunciations: Pronunciation[];
  /** Só no "estilo livre": ficha de estilo que a IA montou para este vídeo (formato do motor genérico). */
  styleSpec?: Record<string, unknown>;
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

// Ritmo medido com a voz Macena no eleven_v4 (ele ignora "speed" e adiciona pausas de
// respiração): ~2,3 palavras/s em pt-BR. Usado pra dimensionar o roteiro e a estimativa na tela.
export const WORDS_PER_SECOND = 2.3;

// ---------- templates (estilos montados a partir de um vídeo de referência) ----------

export type VideoTemplateStatus = "queued" | "analyzing" | "ready" | "failed";

export const TEMPLATE_STATUS_LABEL: Record<VideoTemplateStatus, string> = {
  queued: "Na fila",
  analyzing: "Montando",
  ready: "Pronto",
  failed: "Falhou",
};

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

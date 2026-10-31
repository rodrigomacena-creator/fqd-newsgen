// Tipos compartilhados do VideoGen (client + servidor + contrato com o worker).
// Este arquivo é "puro" (sem imports de servidor) de propósito.

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
  /** Prompt em inglês pra trilha (ElevenLabs Music). */
  musicPrompt: string;
  /** Legenda do post (Instagram/YouTube) com hashtags. */
  postCaption: string;
  /** Pronúncias extras deste vídeo, somadas ao dicionário padrão. */
  pronunciations: Pronunciation[];
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

export const DEFAULT_VOICE_ID = "UY3oRETjQaraEM058uNo"; // "Marco  Narração" (voz clonada)
export const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

// Ritmo medido com a voz Marco no eleven_v4 (ele ignora "speed" e adiciona pausas de
// respiração): ~2,3 palavras/s em pt-BR. Usado pra dimensionar o roteiro e a estimativa na tela.
export const WORDS_PER_SECOND = 2.3;

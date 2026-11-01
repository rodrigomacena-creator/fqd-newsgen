import type { NarrationWord, Pronunciation } from "./types";

// Regra fixa do Rodrigo: siglas e termos em inglês são falados como em inglês (SEO e GEO
// letra por letra). O ElevenLabs em pt-BR erra esses termos, então o texto enviado pro TTS
// usa uma grafia fonética e a legenda volta pra grafia real. Nomes de marca e sites ficam nas
// pronúncias de cada perfil (ex.: "Oxyn Group" no perfil da empresa), não aqui.
export const DEFAULT_PRONUNCIATIONS: Pronunciation[] = [
  { display: "ChatGPT", spoken: "Chat Gê Pê Tê" },
  { display: "Perplexity", spoken: "Perpléxiti" },
  { display: "Gemini", spoken: "Djêmini" },
  { display: "Google", spoken: "Gúgol" },
  { display: "ranking", spoken: "rânkin" },
  { display: "SEO", spoken: "És-í-ôu" },
  { display: "GEO", spoken: "Dji-í-ôu" },
];

interface Segment {
  display: string;
  spoken: string;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Junta o dicionário padrão com as listas extras, na ordem (a última vence): normalmente
 * pessoa, empresa e por fim as pronúncias do próprio roteiro.
 */
export function mergePronunciations(...extras: Pronunciation[][]): Pronunciation[] {
  const map = new Map<string, Pronunciation>();
  for (const p of [...DEFAULT_PRONUNCIATIONS, ...extras.flat()]) {
    if (p.display.trim() && p.spoken.trim()) map.set(p.display.trim(), { display: p.display.trim(), spoken: p.spoken.trim() });
  }
  return [...map.values()].sort((a, b) => b.display.length - a.display.length);
}

/** Quebra o texto de exibição em segmentos, trocando os termos do dicionário pela grafia falada. */
export function toSegments(displayText: string, pronunciations: Pronunciation[]): Segment[] {
  if (pronunciations.length === 0) return [{ display: displayText, spoken: displayText }];
  // Fronteira de palavra que entende acentos (\b do JS não entende).
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${pronunciations.map((p) => escapeRegExp(p.display)).join("|")})(?![\\p{L}\\p{N}])`,
    "gu"
  );
  const segments: Segment[] = [];
  let last = 0;
  for (const m of displayText.matchAll(pattern)) {
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ display: displayText.slice(last, idx), spoken: displayText.slice(last, idx) });
    const p = pronunciations.find((x) => x.display === m[1])!;
    segments.push({ display: m[1], spoken: p.spoken });
    last = idx + m[1].length;
  }
  if (last < displayText.length) segments.push({ display: displayText.slice(last), spoken: displayText.slice(last) });
  return segments;
}

export function spokenText(displayText: string, pronunciations: Pronunciation[]): string {
  return toSegments(displayText, pronunciations).map((s) => s.spoken).join("");
}

/**
 * Converte o alinhamento por caractere do ElevenLabs (calculado sobre o texto FALADO) em
 * palavras com a grafia de EXIBIÇÃO. Cada caractere exibido é mapeado pro trecho
 * correspondente do texto falado (linear dentro de um termo trocado), então palavras como
 * "oxyngroup.com.br" recebem o tempo da frase falada inteira.
 */
export function alignDisplayWords(
  displayText: string,
  pronunciations: Pronunciation[],
  alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }
): NarrationWord[] {
  const segments = toSegments(displayText, pronunciations);
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  const n = starts.length;
  if (n === 0) return [];

  // display char index -> [spokenStart, spokenEnd] (índices de caractere do texto falado)
  const map: [number, number][] = [];
  let spokenPos = 0;
  for (const seg of segments) {
    const dl = seg.display.length;
    const sl = seg.spoken.length;
    for (let i = 0; i < dl; i++) {
      if (dl === sl) {
        map.push([spokenPos + i, spokenPos + i]);
      } else {
        const a = spokenPos + Math.floor((i * sl) / dl);
        const b = spokenPos + Math.max(Math.floor(((i + 1) * sl) / dl) - 1, Math.floor((i * sl) / dl));
        map.push([a, b]);
      }
    }
    spokenPos += sl;
  }

  const clamp = (i: number) => Math.min(Math.max(i, 0), n - 1);
  const words: NarrationWord[] = [];
  for (const m of displayText.matchAll(/\S+/g)) {
    const i0 = m.index ?? 0;
    const i1 = i0 + m[0].length - 1;
    const t0 = starts[clamp(map[i0][0])];
    const t1 = ends[clamp(map[i1][1])];
    words.push([m[0], Math.round(t0 * 1000) / 1000, Math.round(Math.max(t1, t0) * 1000) / 1000]);
  }
  return words;
}

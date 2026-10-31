import patternsData from "./patterns.json";

// Gerado por scripts/videogen-patterns.mjs a partir de videogen/padroes/*.md.
export interface VideoPattern {
  id: string;
  numero: number;
  nome: string;
  tom: string;
  ritmo: string;
  duracaoReferenciaS: number[];
  cenaS: [number, number];
  semNarracao: boolean;
  cta: string;
}

export const VIDEO_PATTERNS = patternsData as VideoPattern[];

export function getVideoPattern(id: string): VideoPattern | undefined {
  return VIDEO_PATTERNS.find((p) => p.id === id);
}

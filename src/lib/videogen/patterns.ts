import patternsData from "./patterns.json";

// Estilos embutidos: gerados por scripts/videogen-patterns.mjs a partir de videogen/padroes/*.md,
// cada um com renderizador próprio em worker/render/. Os templates montados pela aplicação
// (tabela VideoTemplate) usam o mesmo formato, ver src/lib/videogen/templates.ts.
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
  /** Vídeo de exemplo de ~5s mostrado no seletor de estilo. */
  sampleUrl: string | null;
  kind: "builtin" | "template";
}

export const VIDEO_PATTERNS: VideoPattern[] = (patternsData as Omit<VideoPattern, "sampleUrl" | "kind">[]).map((p) => ({
  ...p,
  sampleUrl: `/videogen/exemplos/${p.id}.mp4`,
  kind: "builtin" as const,
}));

/** Ids dos estilos embutidos (todos têm renderizador no worker). */
export const BUILTIN_PATTERN_IDS = VIDEO_PATTERNS.map((p) => p.id);

export function getVideoPattern(id: string): VideoPattern | undefined {
  return VIDEO_PATTERNS.find((p) => p.id === id);
}

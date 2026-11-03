// Planejamento do vídeo base por cena (arquivo "puro": serve o editor no navegador e o servidor).
import { sceneTiming, type TimedBlock } from "./sceneTiming";
import type { AvatarSegment, AvatarTrack, NarrationWord, VideoScript } from "./types";

/** Trecho mínimo mandado pro Higgsfield (trecho curto demais costuma ser recusado e não sincroniza bem). */
const MIN_SEGMENT_S = 2.5;

/** Blocos de tempo que o avatar pode cobrir: uma por cena + o fecho. */
export function units(script: VideoScript, words: NarrationWord[] | null, total: number): TimedBlock[] {
  const t = sceneTiming(script, words, false);
  return [...t.scenes, { start: t.cta.start, end: Math.max(t.cta.start + 0.1, total) }];
}

/** Índices das cenas marcadas como avatar que nenhum trecho pronto (ou em geração) cobre. */
export function uncoveredScenes(script: VideoScript, words: NarrationWord[] | null, avatar: AvatarTrack | null, total: number): number[] {
  const u = units(script, words, total);
  const alive = (avatar?.segments ?? []).filter((s) => s.status !== "failed");
  return script.scenes
    .map((sc, i) => ({ sc, i }))
    .filter(({ sc, i }) => sc.avatar && !alive.some((s) => s.start <= u[i].start + 0.05 && s.end >= u[i].end - 0.05))
    .map(({ i }) => i);
}

/**
 * Trechos novos a gerar. scope "all" = a fala inteira (dá pra trocar cena por cena depois sem gerar
 * de novo); "marked" = só as cenas marcadas que ainda não têm avatar (mais barato).
 * Corta sempre na fronteira de cena; cena mais longa que o máximo é dividida em partes iguais.
 */
export function planSegments(
  script: VideoScript,
  words: NarrationWord[] | null,
  total: number,
  scope: "all" | "marked",
  existing: AvatarSegment[],
  maxS: number
): { start: number; end: number }[] {
  const u = units(script, words, total);
  const alive = existing.filter((s) => s.status !== "failed");
  const covered = (b: TimedBlock) => alive.some((s) => s.start <= b.start + 0.05 && s.end >= b.end - 0.05);
  const wanted = u.map((b, i) => (scope === "all" ? true : Boolean(script.scenes[i]?.avatar)) && !covered(b) && b.end - b.start > 0.05);

  // sequências de blocos seguidos que precisam de avatar
  const runs: TimedBlock[][] = [];
  wanted.forEach((w, i) => {
    if (!w) return;
    const last = runs.at(-1);
    if (last && wanted[i - 1]) last.push(u[i]);
    else runs.push([u[i]]);
  });

  const out: { start: number; end: number }[] = [];
  for (const run of runs) {
    let cur: { start: number; end: number } | null = null;
    for (const b of run) {
      // bloco maior que o máximo: divide em partes iguais
      const parts = Math.max(1, Math.ceil((b.end - b.start) / maxS));
      const step = (b.end - b.start) / parts;
      for (let k = 0; k < parts; k++) {
        const piece = { start: b.start + k * step, end: k === parts - 1 ? b.end : b.start + (k + 1) * step };
        if (cur && piece.end - cur.start <= maxS) cur.end = piece.end;
        else {
          if (cur) out.push(cur);
          cur = { ...piece };
        }
      }
    }
    if (cur) out.push(cur);
  }
  // trecho curto demais: estica para os lados (cobrir um pouco a mais não atrapalha)
  return out.map((s) => {
    if (s.end - s.start >= MIN_SEGMENT_S) return s;
    const need = MIN_SEGMENT_S - (s.end - s.start);
    const end = Math.min(total, s.end + need);
    const start = Math.max(0, s.start - (need - (end - s.end)));
    return { start, end };
  });
}


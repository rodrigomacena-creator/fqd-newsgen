// Tempo de cada cena para a timeline do editor. Espelha worker/render/timeline.py:
// com narração gerada (e ainda igual ao roteiro), usa os tempos reais das palavras;
// senão estima pelo número de palavras (~WORDS_PER_SECOND) ou pela duração da cena.
import { WORDS_PER_SECOND, fullNarration, type NarrationWord, type VideoScript } from "./types";

export interface TimedBlock {
  start: number;
  end: number;
}

export interface SceneTiming {
  scenes: TimedBlock[];
  cta: TimedBlock;
  total: number;
  /** true = tempos medidos na narração gerada; false = estimativa. */
  measured: boolean;
  /** Palavras com tempo (reais ou estimadas), para a trilha de narração e a legenda da prévia. */
  words: NarrationWord[];
}

const LEAD = 0.08;
const CTA_HOLD = 1.8;
const TAIL = 0.8;
const MIN_SCENE = 0.8;

const split = (t: string) => t.trim().split(/\s+/).filter(Boolean);

export function sceneTiming(script: VideoScript, narrationWords: NarrationWord[] | null, noNarration: boolean): SceneTiming {
  const texts = script.scenes.map((s) => split(s.narration));
  const ctaText = split(script.cta.narration);
  const display = split(fullNarration(script));
  const measured =
    !noNarration && Boolean(narrationWords?.length) && narrationWords!.length === display.length &&
    narrationWords!.every((w, i) => w[0] === display[i]);

  if (measured) {
    const words = narrationWords!;
    let pos = 0;
    let t = 0;
    const starts: number[] = [];
    texts.forEach((own, i) => {
      const first = words[pos];
      const start = own.length && first ? (i === 0 ? 0 : Math.max(0, first[1] - LEAD)) : t;
      starts.push(Math.max(start, t));
      t = starts[i];
      pos += own.length;
    });
    const lastEnd = words.at(-1)![2];
    const ctaStart = ctaText.length && words[pos] ? Math.max(t, words[pos][1] - LEAD) : Math.max(t, lastEnd + 0.2);
    const total = Math.max(lastEnd + TAIL, ctaStart + CTA_HOLD);
    const scenes = starts.map((s, i) => ({ start: s, end: i + 1 < starts.length ? starts[i + 1] : ctaStart }));
    return { scenes, cta: { start: ctaStart, end: total }, total, measured: true, words };
  }

  // estimativa
  const words: NarrationWord[] = [];
  let t = 0;
  const place = (list: string[], dur: number) => {
    const step = list.length ? dur / list.length : 0;
    list.forEach((w, k) => words.push([w, t + k * step, t + (k + 1) * step * 0.9]));
  };
  const scenes = script.scenes.map((s, i) => {
    const own = texts[i];
    const dur = noNarration || !own.length ? Math.max(MIN_SCENE, s.durationS || 2) : Math.max(MIN_SCENE, own.length / WORDS_PER_SECOND);
    if (!noNarration) place(own, dur);
    const block = { start: t, end: t + dur };
    t += dur;
    return block;
  });
  const ctaDur = Math.max(CTA_HOLD, noNarration ? 2 : ctaText.length / WORDS_PER_SECOND + TAIL);
  if (!noNarration) place(ctaText, ctaDur - TAIL);
  const cta = { start: t, end: t + ctaDur };
  return { scenes, cta, total: cta.end, measured: false, words };
}

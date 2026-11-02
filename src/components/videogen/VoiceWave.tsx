"use client";

import { useEffect, useRef, useState } from "react";
import type { NarrationWord } from "@/lib/videogen/types";

const PEAKS_PER_SECOND = 80;
const peakCache = new Map<string, number[]>();

/** Lê o mp3 da narração no navegador e tira o pico de volume de cada fatia de tempo (0-1). */
async function loadPeaks(url: string): Promise<number[]> {
  const hit = peakCache.get(url);
  if (hit) return hit;
  const buf = await (await fetch(url)).arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(audio.sampleRate / PEAKS_PER_SECOND));
    const peaks: number[] = [];
    for (let i = 0; i < data.length; i += step) {
      let max = 0;
      for (let j = i; j < Math.min(i + step, data.length); j++) max = Math.max(max, Math.abs(data[j]));
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.01);
    const norm = peaks.map((p) => Math.min(1, p / top));
    peakCache.set(url, norm);
    return norm;
  } finally {
    void ctx.close();
  }
}

/** Sem áudio (narração ainda não gerada): onda aproximada a partir das palavras estimadas. */
function wordPeaks(words: NarrationWord[], total: number): number[] {
  const n = Math.ceil(total * PEAKS_PER_SECOND);
  const peaks = new Array(n).fill(0.03);
  words.forEach(([w, s, e], k) => {
    const a = Math.floor(s * PEAKS_PER_SECOND);
    const b = Math.max(a + 1, Math.floor(e * PEAKS_PER_SECOND));
    const loud = 0.45 + ((w.length * 7 + k * 13) % 50) / 100;
    for (let i = a; i < b && i < n; i++) {
      const x = (i - a) / (b - a);
      const env = Math.sin(Math.PI * x) ** 0.6;
      const wobble = 0.65 + 0.35 * Math.abs(Math.sin(i * 1.7 + k));
      peaks[i] = Math.max(peaks[i], loud * env * wobble);
    }
  });
  return peaks;
}

function draw(canvas: HTMLCanvasElement, peaks: number[], width: number, height: number, color: string, alpha = 1) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, width, height);
  g.fillStyle = color;
  g.globalAlpha = alpha;
  const mid = height / 2;
  const bar = 2; // barra de 2px com 1px de folga, como nos editores de vídeo
  for (let x = 0; x < width; x += bar + 1) {
    const a = Math.floor((x / width) * peaks.length);
    const b = Math.max(a + 1, Math.floor(((x + bar + 1) / width) * peaks.length));
    let p = 0;
    for (let i = a; i < b && i < peaks.length; i++) p = Math.max(p, peaks[i]);
    const h = Math.max(1, p * (height - 6));
    g.fillRect(x, mid - h / 2, bar, h);
  }
}

/**
 * Faixa da voz como onda sonora. Com narração gerada, a onda vem do próprio mp3; antes disso,
 * é uma aproximação pelas palavras. A parte já tocada fica vermelha.
 */
export function VoiceWave({
  url,
  words,
  total,
  px,
  time,
  height = 56,
}: {
  url: string | null;
  words: NarrationWord[];
  total: number;
  px: number;
  time: number;
  height?: number;
}) {
  const [real, setReal] = useState<{ url: string; peaks: number[] } | null>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const played = useRef<HTMLCanvasElement>(null);
  const width = Math.max(1, Math.round(total * px));

  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadPeaks(url)
      .then((peaks) => alive && setReal({ url, peaks }))
      .catch(() => {}); // sem acesso ao áudio: fica a onda aproximada
    return () => {
      alive = false;
    };
  }, [url]);

  const peaks = real && real.url === url ? real.peaks : null;

  // tema claro/escuro muda a cor da onda: redesenha quando o data-theme troca
  const [theme, setTheme] = useState("");
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setTheme(el.dataset.theme ?? ""));
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    // a onda real cobre a duração do áudio; o resto da linha do tempo (fecho sem fala) fica vazio
    const p = peaks ? [...peaks, ...new Array(Math.max(0, Math.ceil(total * PEAKS_PER_SECOND) - peaks.length)).fill(0)].slice(0, Math.ceil(total * PEAKS_PER_SECOND)) : wordPeaks(words, total);
    const styles = getComputedStyle(document.documentElement);
    const muted = styles.getPropertyValue("--text-secondary").trim() || "#8a857a";
    if (base.current) draw(base.current, p, width, height, muted, 0.45);
    if (played.current) draw(played.current, p, width, height, "#FF3B3B");
  }, [peaks, words, total, width, height, theme]);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={base} className={`absolute inset-0 ${peaks ? "" : "opacity-70"}`} />
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: Math.min(width, Math.max(0, time * px)) }}>
        <canvas ref={played} className="absolute left-0 top-0" />
      </div>
    </div>
  );
}

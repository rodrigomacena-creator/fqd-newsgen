"use client";

import { useEffect, useRef, useState } from "react";

// Tempo típico de um roteiro (~20-40s). O progresso é estimado: anda rápido no começo,
// desacelera e nunca chega ao fim sozinho (quem termina é a resposta da API).
const TAU_S = 16;
const MAX = 0.94;
const HEIGHT = 72;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  kind: "spark" | "dust";
}

function progressAt(seconds: number) {
  return MAX * (1 - Math.exp(-seconds / TAU_S));
}

/**
 * Animação enquanto a IA escreve o roteiro: uma linha de luz avança da esquerda para a
 * direita; a ponta solta faíscas e uma poeira fina corre pela pista em direção a ela.
 * Desenhada num canvas, na cor de destaque do tema.
 */
export function ScriptLoader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--accent-yellow").trim() || "#e10600";
    const muted = styles.getPropertyValue("--border").trim() || "#ddd";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      width = canvas.clientWidth;
      canvas.width = width * dpr;
      canvas.height = HEIGHT * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const particles: Particle[] = [];
    const start = performance.now();
    const midY = HEIGHT / 2;
    const pad = 8;
    let raf = 0;
    let last = start;
    let lastPct = -1;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = progressAt((now - start) / 1000);
      const headX = pad + (width - pad * 2) * p;
      const shown = Math.round(p * 100);
      if (shown !== lastPct) {
        lastPct = shown;
        setPct(shown);
      }

      ctx.clearRect(0, 0, width, HEIGHT);

      // pista
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, midY);
      ctx.lineTo(width - pad, midY);
      ctx.stroke();

      // trecho percorrido, com degradê que acende perto da ponta
      const grad = ctx.createLinearGradient(pad, 0, Math.max(headX, pad + 1), 0);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, accent);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad, midY);
      ctx.lineTo(headX, midY);
      ctx.stroke();

      if (!reduced) {
        // faíscas da ponta (saem para trás, espalhando)
        for (let i = 0; i < 3; i++) {
          const a = Math.PI + (Math.random() - 0.5) * 1.6;
          const sp = 20 + Math.random() * 70;
          particles.push({
            x: headX,
            y: midY,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 0,
            max: 0.5 + Math.random() * 0.7,
            r: 0.6 + Math.random() * 1.4,
            kind: "spark",
          });
        }
        // poeira que corre pela pista em direção à ponta
        if (Math.random() < 0.6) {
          const x = pad + Math.random() * Math.max(headX - pad, 1);
          particles.push({
            x,
            y: midY + (Math.random() - 0.5) * 34,
            vx: 30 + Math.random() * 40,
            vy: 0,
            life: 0,
            max: 1 + Math.random(),
            r: 0.5 + Math.random() * 0.9,
            kind: "dust",
          });
        }
      }

      ctx.fillStyle = accent;
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life += dt;
        if (pt.life >= pt.max) {
          particles.splice(i, 1);
          continue;
        }
        if (pt.kind === "spark") {
          pt.vx *= 0.96;
          pt.vy = pt.vy * 0.96 + 6 * dt;
        } else {
          pt.vy += (midY - pt.y) * 1.2 * dt; // atraída para a linha
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        const t = pt.life / pt.max;
        ctx.globalAlpha = (pt.kind === "spark" ? 1 : 0.5) * (1 - t) * Math.min(1, t * 6);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ponta luminosa
      const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(now / 160);
      const glow = ctx.createRadialGradient(headX, midY, 0, headX, midY, 16 * pulse);
      glow.addColorStop(0, accent);
      glow.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(headX, midY, 16 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(headX, midY, 3, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div role="progressbar" aria-label="Escrevendo o roteiro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="w-full">
      <canvas ref={canvasRef} aria-hidden className="block w-full" style={{ height: HEIGHT }} />
      <p className="text-center text-xs text-text-secondary">
        Escrevendo o roteiro<span className="tabular-nums"> · {pct}%</span>
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

// Tempo típico de um roteiro (~20-40s). O progresso é estimado: anda rápido no começo,
// desacelera e nunca chega ao fim sozinho (quem termina é a resposta da API).
const TAU_S = 16;
const MAX = 0.94;

/**
 * Animação enquanto a IA escreve o roteiro: um lápis vai rabiscando a pista do início
 * até a bandeirinha de chegada, dando pulinhos, e deixa o rabisco para trás.
 */
export function ScriptLoader() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 150);
    return () => clearInterval(t);
  }, []);

  const p = MAX * (1 - Math.exp(-elapsed / TAU_S));

  return (
    <div
      role="progressbar"
      aria-label="Escrevendo o roteiro"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      className="w-full select-none"
    >
      <style>{`
        @keyframes sl-hop { 0%,100% { transform: translateY(0) rotate(16deg); } 50% { transform: translateY(-10px) rotate(6deg); } }
        @keyframes sl-scribble { from { background-position: 0 0; } to { background-position: 24px 0; } }
        @keyframes sl-wave { 0%,100% { transform: skewY(0deg) scaleX(1); } 50% { transform: skewY(-6deg) scaleX(.9); } }
        @keyframes sl-dust { 0% { opacity: .9; transform: translate(0,0) scale(1); } 100% { opacity: 0; transform: translate(-14px,-6px) scale(.3); } }
        .sl-hop { animation: sl-hop .45s ease-in-out infinite; transform-origin: 95% 60%; }
        .sl-scribble { animation: sl-scribble .6s linear infinite; }
        .sl-wave { animation: sl-wave .9s ease-in-out infinite; transform-origin: 0 50%; }
        .sl-dust { animation: sl-dust .6s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .sl-hop, .sl-scribble, .sl-wave, .sl-dust { animation: none; } }
      `}</style>

      <div className="relative mx-auto h-20 max-w-md px-2">
        {/* pista */}
        <div className="absolute inset-x-2 bottom-3 h-2.5 rounded-full bg-surface-2 ring-1 ring-border" />
        {/* rabisco que o lápis deixa */}
        <div
          className="sl-scribble absolute bottom-3 left-2 h-2.5 rounded-full bg-accent-yellow/25 transition-[width] duration-200 ease-linear"
          style={{
            width: `calc((100% - 1rem) * ${p})`,
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='10'%3E%3Cpath d='M0 5 Q6 0 12 5 T24 5' fill='none' stroke='%23e10600' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E\")",
            backgroundRepeat: "repeat-x",
            backgroundSize: "24px 10px",
            backgroundPositionY: "center",
          }}
        />
        {/* bandeirinha de chegada */}
        <svg viewBox="0 0 24 32" aria-hidden className="absolute bottom-3 right-1 h-11 w-8">
          <line x1="4" y1="2" x2="4" y2="31" stroke="currentColor" strokeWidth="2" className="text-text-secondary" strokeLinecap="round" />
          <g className="sl-wave">
            <path d="M5 3h14l-3 5 3 5H5z" fill="var(--accent-yellow)" />
            <path d="M5 3h4v5H5zM13 3h4v5h-4zM9 8h4v5H9z" fill="var(--background)" opacity=".85" />
          </g>
        </svg>
        {/* lápis */}
        <div className="absolute bottom-[0.55rem] transition-[left] duration-200 ease-linear" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p} - 3.35rem)` }}>
          <span className="sl-dust absolute right-0 bottom-3 h-1.5 w-1.5 rounded-full bg-accent-yellow/60" aria-hidden />
          <svg viewBox="0 0 40 40" aria-hidden className="sl-hop h-14 w-14 drop-shadow-sm">
            {/* ponta */}
            <path d="M30 20 L38 24 L30 28 Z" fill="#f2d3a2" />
            <path d="M35.5 22.8 L38 24 L35.5 25.2 Z" fill="#2b2b2b" />
            {/* corpo */}
            <rect x="8" y="20" width="22" height="8" rx="1" fill="#ffc83d" />
            <rect x="8" y="22.6" width="22" height="2.8" fill="#f2b21e" />
            {/* braçadeira e borracha */}
            <rect x="5" y="20" width="4" height="8" fill="#b8b8b8" />
            <rect x="1" y="20" width="5" height="8" rx="2" fill="#ff8fa3" />
            {/* olhinhos */}
            <circle cx="20" cy="23" r="1.6" fill="#2b2b2b" />
            <circle cx="25" cy="23" r="1.6" fill="#2b2b2b" />
            <circle cx="20.5" cy="22.5" r=".5" fill="#fff" />
            <circle cx="25.5" cy="22.5" r=".5" fill="#fff" />
            <path d="M21 26.2 Q22.5 27.6 24 26.2" stroke="#2b2b2b" strokeWidth=".9" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-text-secondary">
        Escrevendo o roteiro<span className="tabular-nums"> · {Math.round(p * 100)}%</span>
      </p>
    </div>
  );
}

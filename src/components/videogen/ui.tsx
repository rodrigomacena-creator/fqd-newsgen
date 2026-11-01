"use client";

// Peças de interface compartilhadas pelas telas do VideoGen.
import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { VIDEO_STATUS_LABEL, type VideoJobStatus } from "@/lib/videogen/types";

export const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent-yellow focus-visible:ring-2 focus-visible:ring-accent-yellow/30 disabled:cursor-not-allowed disabled:opacity-50";
export const labelClass = "block text-xs font-medium text-text-secondary";
export const sectionTitle = "text-[15px] font-bold uppercase tracking-wide text-accent-yellow";
export const cardClass = "rounded-2xl border border-border bg-surface p-5 sm:p-6";
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-accent-yellow/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
export const primaryButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-yellow px-5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${focusRing}`;
export const secondaryButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:border-accent-yellow hover:text-accent-yellow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-inherit ${focusRing}`;
export const dangerButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-accent-red transition hover:bg-accent-red/10 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
export const iconButton = `inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${focusRing}`;

/** Textarea que cresce com o conteúdo (nada de texto escondido num campo de uma linha só). */
export function AutoTextarea({ value, className = "", minRows = 1, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={minRows} value={value} className={`resize-none overflow-hidden ${className}`} {...rest} />;
}

const STATUS_STYLE: Record<VideoJobStatus, { cls: string; icon: React.ReactNode }> = {
  draft: { cls: "bg-surface-2 text-text-secondary", icon: <Dot /> },
  script_ready: { cls: "bg-surface-2 text-foreground", icon: <Icon name="doc" /> },
  queued: { cls: "bg-warning/15 text-warning", icon: <Icon name="clock" /> },
  rendering: { cls: "bg-warning/15 text-warning", icon: <Spinner /> },
  done: { cls: "bg-success/15 text-success", icon: <Icon name="check" /> },
  failed: { cls: "bg-accent-red/10 text-accent-red", icon: <Icon name="alert" /> },
};

/** Status com cor + ícone + texto (a cor nunca é a única pista). */
export function StatusBadge({ status, label, progress }: { status: VideoJobStatus; label?: string; progress?: number | null }) {
  const st = STATUS_STYLE[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.cls}`}>
      {st.icon}
      {label ?? VIDEO_STATUS_LABEL[status]}
      {status === "rendering" && progress != null && <span className="tabular-nums">{progress}%</span>}
    </span>
  );
}

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none ${className}`} />;
}

function Dot() {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />;
}

const PATHS: Record<string, string> = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  alert: "M12 8v5m0 3.5v.5M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  doc: "M8 3h6l5 5v13H8a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5M9 13h6M9 17h6",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M19 12l-7 7-7-7",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 18l-6-6 6-6",
  download: "M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  mic: "M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  building: "M4 21V5l8-2v18M12 8h8v13M8 8v.5M8 12v.5M8 16v.5M16 12v.5M16 16v.5M2 21h20",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  x: "M6 6l12 12M18 6L6 18",
};

export function Icon({ name, className = "h-3.5 w-3.5" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

export const FLOW_STEPS = [
  { label: "Tema", hint: "Descreva o vídeo e escolha o estilo" },
  { label: "Roteiro", hint: "A IA escreve; você revisa as cenas" },
  { label: "Narração", hint: "Gere a voz e ouça" },
  { label: "Render", hint: "O servidor monta o mp4" },
  { label: "Pronto", hint: "Assista e baixe" },
] as const;

/**
 * Trilha com as 5 etapas do VideoGen, igual em todas as telas, para o usuário
 * saber onde está e o que ainda vem pela frente.
 * `current` é o índice (0-4) da etapa em andamento; com `finished` todas ficam concluídas.
 */
export function FlowSteps({ current, finished = false, skipped = [] }: { current: number; finished?: boolean; skipped?: number[] }) {
  return (
    <nav aria-label="Etapas do vídeo" className="rounded-2xl border border-border bg-surface px-3 py-4 sm:px-5">
      <p className="mb-3 px-1 text-xs font-semibold text-text-secondary sm:hidden">
        {finished ? "Todas as etapas concluídas" : `Passo ${current + 1} de ${FLOW_STEPS.length}: ${FLOW_STEPS[current].hint}`}
      </p>
      <ol className="flex items-start">
        {FLOW_STEPS.map((s, i) => {
          const isSkipped = skipped.includes(i);
          const state = finished || i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={s.label}
              aria-current={state === "current" && !finished ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
            >
              {i > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-1/2 top-4 h-0.5 w-[calc(100%-2.25rem)] -translate-x-[1.125rem] ${state === "todo" ? "bg-border" : "bg-success/50"}`}
                />
              )}
              <span
                aria-hidden
                className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums ${
                  isSkipped
                    ? "border-dashed border-border bg-surface text-text-secondary"
                    : state === "done"
                      ? "border-success bg-success text-background"
                      : state === "current"
                        ? "border-accent-yellow bg-accent-yellow text-accent-yellow-ink ring-4 ring-accent-yellow/20"
                        : "border-border bg-surface text-text-secondary"
                }`}
              >
                {state === "done" && !isSkipped ? <Icon name="check" className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-[11px] font-semibold sm:text-xs ${state === "todo" || isSkipped ? "text-text-secondary" : ""}`}>
                {s.label}
                <span className="sr-only">
                  {isSkipped ? " (não se aplica)" : state === "done" ? " (concluída)" : state === "current" ? " (etapa atual)" : " (próxima)"}
                </span>
              </span>
              <span className="hidden px-1 text-[11px] leading-snug text-text-secondary sm:block">{isSkipped ? "Sem narração neste estilo" : s.hint}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AutoTextarea, CopyButton, Icon, fieldClass, iconButton, labelClass, secondaryButton } from "./ui";
import { SceneImage } from "./SceneImage";
import { sceneTiming } from "@/lib/videogen/sceneTiming";
import type { BriefingImage, NarrationWord, VideoScene, VideoScript } from "@/lib/videogen/types";

type Selection = number | "cta";

const PAD = 12; // respiro antes do 0s
const MIN_PX = 14;
const MAX_PX = 140;

const fmt = (s: number) => s.toFixed(1).replace(".", ",");
function clock(s: number) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(1).padStart(4, "0").replace(".", ",")}`;
}

interface Drag {
  from: number;
  pointerId: number;
  /** posição (px, dentro da área das trilhas) da borda esquerda do bloco arrastado */
  left: number;
  grab: number;
  started: boolean;
  startX: number;
}

/**
 * Editor de cenas em formato de timeline (tipo editor de vídeo): blocos com a frase de cada cena,
 * largura proporcional ao tempo, arrastáveis para mudar a ordem. Clicar num bloco abre os detalhes
 * (texto na tela, prompt da imagem, foto...) no painel ao lado da prévia.
 */
export function SceneStudio({
  script,
  briefing,
  narrationWords,
  narrationUrl,
  noNarration,
  disabled,
  targetS,
  onScene,
  onCta,
  onReorder,
  onInsert,
  onRemove,
  onAddImage,
}: {
  script: VideoScript;
  briefing: BriefingImage[];
  narrationWords: NarrationWord[] | null;
  narrationUrl: string | null;
  noNarration: boolean;
  disabled: boolean;
  targetS: number;
  onScene: (index: number, patch: Partial<VideoScene>) => void;
  onCta: (patch: Partial<VideoScript["cta"]>) => void;
  onReorder: (from: number, to: number) => void;
  onInsert: (at: number, scene: VideoScene) => void;
  onRemove: (index: number) => void;
  onAddImage: (url: string) => void;
}) {
  const timing = useMemo(() => sceneTiming(script, narrationWords, noNarration), [script, narrationWords, noNarration]);
  const count = script.scenes.length;
  const [sel, setSel] = useState<Selection>(0);
  const selected: Selection = sel === "cta" || sel < count ? sel : Math.max(0, count - 1);

  // ---------- reprodução ----------
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const useAudio = timing.measured && Boolean(narrationUrl);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let t = timeRef.current;
    const audio = useAudio ? audioRef.current : null;
    const tick = (now: number) => {
      t = audio ? audio.currentTime : t + (now - last) / 1000;
      last = now;
      if (t >= timing.total) {
        setTime(timing.total);
        setPlaying(false);
        return;
      }
      setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, useAudio, timing.total]);

  function togglePlay() {
    const audio = audioRef.current;
    if (playing) {
      audio?.pause();
      setPlaying(false);
      return;
    }
    const from = time >= timing.total - 0.05 ? 0 : time;
    setTime(from);
    if (useAudio && audio) {
      audio.currentTime = from;
      void audio.play().catch(() => setPlaying(false));
    }
    setPlaying(true);
  }

  function seek(t: number) {
    const v = Math.min(Math.max(t, 0), timing.total);
    setTime(v);
    if (audioRef.current && useAudio) audioRef.current.currentTime = v;
  }

  function select(s: Selection) {
    setSel(s);
    const block = s === "cta" ? timing.cta : timing.scenes[s];
    if (block && !playing) seek(block.start);
  }

  // durante a reprodução, a cena selecionada acompanha o cursor
  const playingSel: Selection | null = playing
    ? time >= timing.cta.start
      ? "cta"
      : Math.max(0, timing.scenes.findIndex((b) => time >= b.start && time < b.end))
    : null;
  const shown: Selection = playingSel ?? selected;

  // ---------- zoom / largura ----------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitPx, setFitPx] = useState(32);
  const [narrow, setNarrow] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const LABEL_W = narrow ? 40 : 96; // coluna com o nome das trilhas (só ícone no celular)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const small = el.clientWidth < 640;
      setNarrow(small);
      const w = el.clientWidth - (small ? 40 : 96) - PAD - 64;
      // no celular a timeline rola de lado: blocos largos o bastante para ler a frase
      setFitPx(Math.min(MAX_PX, Math.max(small ? 70 : 44, w / Math.max(timing.total, 1))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [timing.total]);
  const px = zoom ?? fitPx;
  const width = timing.total * px + 64 + PAD;

  // ---------- arrastar ----------
  const [drag, setDrag] = useState<Drag | null>(null);
  const durations = timing.scenes.map((b) => b.end - b.start);

  /** Onde a cena arrastada cairia (índice na lista sem ela), pela posição do centro do bloco. */
  function insertIndex(d: Drag) {
    const center = (d.left + (durations[d.from] * px) / 2) / px;
    let acc = 0;
    let idx = 0;
    durations.forEach((dur, i) => {
      if (i === d.from) return;
      if (acc + dur / 2 < center) idx++;
      acc += dur;
    });
    return idx;
  }

  // posições dos blocos (durante o arraste, os outros se reorganizam em volta do espaço livre)
  const layout = useMemo(() => {
    if (!drag?.started) return timing.scenes.map((b) => b.start);
    const idx = insertIndex(drag);
    const pos: number[] = [];
    let acc = 0;
    let k = 0;
    durations.forEach((dur, i) => {
      if (i === drag.from) return;
      if (k === idx) acc += durations[drag.from];
      pos[i] = acc;
      acc += dur;
      k++;
    });
    return pos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, timing, px]);
  const slotStart = drag?.started
    ? (() => {
        const idx = insertIndex(drag);
        let acc = 0;
        let k = 0;
        for (let i = 0; i < durations.length; i++) {
          if (i === drag.from) continue;
          if (k === idx) break;
          acc += durations[i];
          k++;
        }
        return acc;
      })()
    : 0;

  function laneX(clientX: number) {
    const el = scrollRef.current!;
    return clientX - el.getBoundingClientRect().left + el.scrollLeft - LABEL_W - PAD;
  }

  function onBlockPointerDown(e: ReactPointerEvent, i: number, fromGrip: boolean) {
    if (disabled || e.button !== 0) return;
    // no toque, só a alça arrasta (o resto do bloco rola a timeline)
    if (e.pointerType !== "mouse" && !fromGrip) return;
    const left = timing.scenes[i].start * px;
    setDrag({ from: i, pointerId: e.pointerId, left, grab: laneX(e.clientX) - left, started: fromGrip && e.pointerType !== "mouse", startX: e.clientX });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onBlockPointerMove(e: ReactPointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const started = drag.started || Math.abs(e.clientX - drag.startX) > 5;
    if (!started) return;
    const left = Math.min(Math.max(laneX(e.clientX) - drag.grab, -20), timing.cta.start * px);
    setDrag({ ...drag, left, started });
    // rola sozinho perto das bordas
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    if (e.clientX > r.right - 40) el.scrollLeft += 12;
    else if (e.clientX < r.left + LABEL_W + 30) el.scrollLeft -= 12;
  }

  function onBlockPointerUp(e: ReactPointerEvent, i: number) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.started) {
      const to = insertIndex(drag);
      if (to !== drag.from) {
        onReorder(drag.from, to);
        setSel(to);
      }
    } else {
      select(i);
    }
    setDrag(null);
  }

  function onBlockKey(e: KeyboardEvent, i: number) {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const to = i + (e.key === "ArrowLeft" ? -1 : 1);
      if (!disabled && to >= 0 && to < count) {
        onReorder(i, to);
        setSel(to);
      }
    }
  }

  // ---------- render ----------
  const shownBlock = shown === "cta" ? timing.cta : timing.scenes[shown];
  const shownScene = shown === "cta" ? null : script.scenes[shown];
  const caption = captionAt(timing.words, playing ? time : (shownBlock?.start ?? 0) + 0.01, shownBlock);
  const tickStep = px >= 40 ? 1 : px >= 20 ? 2 : 5;
  const ticks = Array.from({ length: Math.floor(timing.total / tickStep) + 1 }, (_, k) => k * tickStep);
  const majorEvery = tickStep === 1 ? 5 : tickStep === 2 ? 10 : 10;

  return (
    <div className="flex flex-col gap-4">
      {useAudio && <audio ref={audioRef} src={narrationUrl!} preload="auto" onEnded={() => setPlaying(false)} className="hidden" />}

      <div className="order-2 grid gap-4 lg:order-1 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
        {/* prévia */}
        <section aria-label="Prévia da cena" className="hidden flex-col items-center rounded-2xl border border-border bg-surface p-4 lg:flex">
          <p className="self-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Prévia {shown === "cta" ? "do fecho" : `da cena ${shown + 1}`}
          </p>
          <div className="relative mt-3 aspect-[9/16] w-[200px] overflow-hidden rounded-2xl bg-[#1b1b1f] shadow-lg">
            {shownScene?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownScene.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_70%,#5a4a40_0,#2a2326_45%,#141416_100%)] px-4 text-center text-[11px] text-white/60">
                {shown !== "cta" && (
                  <>
                    <Icon name="image" className="h-6 w-6" />
                    <span className="line-clamp-4">{shownScene?.visual || "Imagem gerada pela IA no render"}</span>
                  </>
                )}
              </div>
            )}
            {shown === "cta" ? (
              <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-lg bg-black/85 px-3 py-3 text-center text-sm font-extrabold uppercase text-white">
                {script.cta.onScreen || "CTA"}
              </div>
            ) : (
              shownScene?.onScreen && (
                <p className="absolute inset-x-2 top-6 text-center text-[15px] font-extrabold uppercase leading-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,.6)]">
                  {shownScene.onScreen}
                </p>
              )
            )}
            {caption && shown !== "cta" && (
              <p className="absolute inset-x-2 bottom-12 text-center text-sm font-extrabold uppercase text-white [text-shadow:0_2px_6px_#000]">{caption}</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" aria-label="Cena anterior" onClick={() => step(-1)} className={iconButton}>
              <Icon name="prev" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pausar" : "Tocar"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"
            >
              <Icon name={playing ? "pause" : "play"} className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Próxima cena" onClick={() => step(1)} className={iconButton}>
              <Icon name="next" className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm tabular-nums text-text-secondary">
            <span className="font-semibold text-foreground">{clock(time)}</span> / {clock(timing.total)}
          </p>
          <p className="mt-2 text-center text-[11px] leading-snug text-text-secondary">
            {useAudio ? "Com a narração gerada." : noNarration ? "Tempos pela duração das cenas." : "Tempos estimados até gerar a narração."} As
            imagens de verdade saem no render.
          </p>
        </section>

        {/* detalhes */}
        <section aria-label="Detalhes" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          {selected === "cta" ? (
            <CtaInspector script={script} noNarration={noNarration} disabled={disabled} block={timing.cta} onChange={onCta} onPrev={() => select(count - 1)} />
          ) : script.scenes[selected] ? (
            <SceneInspector
              index={selected}
              total={count}
              scene={script.scenes[selected]}
              block={timing.scenes[selected]}
              measured={timing.measured}
              noNarration={noNarration}
              disabled={disabled}
              briefing={briefing}
              onAddImage={onAddImage}
              onChange={(patch) => onScene(selected, patch)}
              onPrev={() => select(selected - 1)}
              onNext={() => select(selected + 1 < count ? selected + 1 : "cta")}
              onMove={(d) => {
                onReorder(selected, selected + d);
                setSel(selected + d);
              }}
              onDuplicate={() => {
                onInsert(selected + 1, { ...script.scenes[selected] });
                setSel(selected + 1);
              }}
              onInsertAfter={() => {
                onInsert(selected + 1, { narration: "", onScreen: "", visual: "", imagePrompt: "", durationS: 2 });
                setSel(selected + 1);
              }}
              onRemove={() => onRemove(selected)}
            />
          ) : null}
        </section>
      </div>

      {/* timeline */}
      <section aria-label="Timeline das cenas" className="order-1 rounded-2xl border border-border bg-surface lg:order-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Timeline</h3>
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-foreground">{fmt(timing.total)}s</span> de {targetS}s pedidos · {count} {count === 1 ? "cena" : "cenas"} + fecho
            {!timing.measured && !noNarration && " · estimado"}
          </p>
          <span className="flex-1" />
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pausar" : "Tocar"} className={`${iconButton} lg:hidden`}>
            <Icon name={playing ? "pause" : "play"} className="h-4 w-4" />
          </button>
          <label className="hidden items-center gap-2 text-xs text-text-secondary sm:flex">
            Zoom
            <input
              type="range"
              min={MIN_PX}
              max={MAX_PX}
              value={Math.round(px)}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-28 accent-[var(--foreground)]"
              aria-label="Zoom da timeline"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onInsert(count, { narration: "", onScreen: "", visual: "", imagePrompt: "", durationS: 2 });
              setSel(count);
            }}
            disabled={disabled}
            className={`min-h-9 px-3 text-xs ${secondaryButton}`}
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> Adicionar cena
          </button>
        </div>

        <div ref={scrollRef} className="relative overflow-x-auto overscroll-x-contain pb-2">
          <div className="relative" style={{ width: width + LABEL_W }}>
            {/* nomes das trilhas (fixos ao rolar) */}
            <div className="sticky left-0 z-40 float-left border-r border-border bg-surface text-xs font-semibold text-text-secondary" style={{ width: LABEL_W }}>
              <div className="h-7 border-b border-border" />
              <div className="flex h-[84px] items-center gap-1.5 px-3">
                <Icon name="scenes" className="h-4 w-4 shrink-0" />{!narrow && <span>Cenas</span>}
              </div>
              {!noNarration && (
                <div className="flex h-14 items-center gap-1.5 px-3">
                  <Icon name="wave" className="h-4 w-4 shrink-0" />{!narrow && <span>Narração</span>}
                </div>
              )}
              {script.musicPrompt && (
                <div className="flex h-11 items-center gap-1.5 px-3">
                  <Icon name="music" className="h-4 w-4 shrink-0" />{!narrow && <span>Trilha</span>}
                </div>
              )}
            </div>

            <div className="relative" style={{ marginLeft: LABEL_W, width, paddingLeft: PAD }}>
              <div className="relative">
              {/* régua */}
              <div
                className="relative h-7 cursor-pointer border-b border-border"
                onPointerDown={(e) => seek(laneX(e.clientX) / px)}
                aria-hidden
              >
                {ticks.map((s) => (
                  <span key={s} className="absolute bottom-0" style={{ left: s * px }}>
                    <span className={`block w-px ${s % majorEvery === 0 ? "h-2.5 bg-text-secondary/60" : "h-1.5 bg-border-hover"}`} />
                    {s % majorEvery === 0 && (
                      <span className="absolute bottom-3 -translate-x-1/2 text-[10px] tabular-nums text-text-secondary">{s}s</span>
                    )}
                  </span>
                ))}
              </div>

              {/* cenas */}
              <div className="relative h-[84px] border-b border-dashed border-border" role="listbox" aria-label="Cenas" aria-orientation="horizontal">
                {drag?.started && (
                  <div
                    className="absolute top-2 bottom-2 rounded-xl border-2 border-dashed border-accent-yellow bg-accent-yellow/5"
                    style={{ left: slotStart * px + 2, width: durations[drag.from] * px - 4 }}
                  />
                )}
                {script.scenes.map((sc, i) => {
                  const isDrag = drag?.started && drag.from === i;
                  const left = isDrag ? drag.left : layout[i] * px;
                  const isSel = selected === i;
                  const isPlaying = playingSel === i;
                  return (
                    <div
                      key={i}
                      role="option"
                      aria-selected={isSel}
                      tabIndex={0}
                      aria-label={`Cena ${i + 1}: ${sc.narration || sc.onScreen || "vazia"}`}
                      onPointerDown={(e) => onBlockPointerDown(e, i, false)}
                      onPointerMove={onBlockPointerMove}
                      onPointerUp={(e) => onBlockPointerUp(e, i)}
                      onPointerCancel={() => setDrag(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          select(i);
                        } else onBlockKey(e, i);
                      }}
                      title="Clique para ver os detalhes · arraste para mudar a ordem (Alt+← → no teclado)"
                      className={`absolute top-2 bottom-2 select-none overflow-hidden rounded-xl border-[1.5px] py-1.5 pl-5 pr-2 text-left outline-none transition-[box-shadow,background-color,border-color] focus-visible:ring-2 focus-visible:ring-accent-yellow ${
                        isDrag
                          ? "z-10 -translate-y-3 -rotate-2 cursor-grabbing border-foreground bg-surface shadow-xl"
                          : isSel
                            ? "border-accent-yellow bg-accent-yellow/[0.06] shadow-[0_0_0_3px_rgba(241,0,0,.12)]"
                            : isPlaying
                              ? "border-foreground/50 bg-surface"
                              : "border-border-hover bg-surface hover:border-foreground/40"
                      } ${disabled ? "cursor-default" : isDrag ? "" : "cursor-grab"} ${drag?.started && !isDrag ? "duration-200 [transition-property:left]" : ""}`}
                      style={{ left: left + 2, width: Math.max(durations[i] * px - 4, 18) }}
                    >
                      <span
                        aria-hidden
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onBlockPointerDown(e, i, true);
                        }}
                        className="absolute inset-y-0 left-0 flex w-5 touch-none items-center justify-center text-text-secondary/60"
                      >
                        <Icon name="grip" className="h-4 w-4" />
                      </span>
                      <span className={`flex justify-between gap-1 text-[10px] font-bold uppercase tabular-nums ${isSel ? "text-accent-yellow" : "text-text-secondary"}`}>
                        <span className="truncate">{durations[i] * px > 104 ? `Cena ${i + 1}` : i + 1}</span>
                        <span>{fmt(durations[i])}s</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">
                        {(noNarration ? sc.onScreen : sc.narration) || <em className="font-normal text-text-secondary">Sem frase</em>}
                      </span>
                    </div>
                  );
                })}
                {/* fecho */}
                <button
                  type="button"
                  onClick={() => select("cta")}
                  aria-pressed={selected === "cta"}
                  className={`absolute top-2 bottom-2 overflow-hidden rounded-xl border-[1.5px] px-2.5 py-1.5 text-left text-white transition ${
                    selected === "cta" ? "border-accent-yellow bg-[#17171a] shadow-[0_0_0_3px_rgba(241,0,0,.2)]" : "border-[#17171a] bg-[#17171a]"
                  }`}
                  style={{ left: timing.cta.start * px + 2, width: Math.max((timing.cta.end - timing.cta.start) * px - 4, 18) }}
                >
                  <span className="flex justify-between gap-1 text-[10px] font-bold uppercase tabular-nums text-white/60">
                    <span className="truncate">Fecho · CTA</span>
                    <span>{fmt(timing.cta.end - timing.cta.start)}s</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">{script.cta.narration || script.cta.onScreen}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsert(count, { narration: "", onScreen: "", visual: "", imagePrompt: "", durationS: 2 });
                    setSel(count);
                  }}
                  disabled={disabled}
                  aria-label="Adicionar cena no fim"
                  className="absolute top-2 bottom-2 flex w-11 items-center justify-center rounded-xl border-[1.5px] border-dashed border-border-hover text-text-secondary transition hover:border-accent-yellow hover:text-accent-yellow disabled:opacity-40"
                  style={{ left: timing.total * px + 8 }}
                >
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>

              {/* narração: uma barrinha por palavra, no tempo dela */}
              {!noNarration && (
                <div className="relative h-14 border-b border-dashed border-border" aria-hidden>
                  {timing.words.map((w, k) => {
                    const h = 8 + ((w[0].length * 7 + k * 13) % 28);
                    return (
                      <span
                        key={k}
                        className={`absolute top-1/2 -translate-y-1/2 rounded-sm ${time >= w[1] && time < w[2] + 0.05 && playing ? "bg-accent-yellow" : "bg-[#c9c2b3]"}`}
                        style={{ left: w[1] * px, width: Math.max(2, (w[2] - w[1]) * px - 2), height: h }}
                      />
                    );
                  })}
                </div>
              )}

              {/* trilha */}
              {script.musicPrompt && (
                <div className="relative h-11" aria-hidden>
                  <div
                    className="absolute top-2 bottom-2 flex items-center overflow-hidden rounded-lg border border-[#e0d4bc] bg-[repeating-linear-gradient(90deg,#efe6d4_0_6px,#e9dec8_6px_12px)] px-2.5 text-[11px] font-semibold text-[#8a7a5c]"
                    style={{ left: 0, width: timing.total * px }}
                  >
                    <span className="truncate">{script.musicPrompt}</span>
                  </div>
                </div>
              )}

              {/* cursor de reprodução */}
              <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-accent-yellow" style={{ left: time * px }} aria-hidden>
                <span className="absolute -left-[6px] top-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-accent-yellow" />
              </div>
              </div>
            </div>
          </div>
        </div>
        <p className="px-4 pb-3 pt-1 text-[11px] text-text-secondary">
          {drag?.started
            ? `Solte para colocar a cena ${drag.from + 1} nesta posição.`
            : "Clique num bloco para ver e editar tudo da cena. Arraste para mudar a ordem (no celular, pela alça à esquerda do bloco)."}
        </p>
      </section>
    </div>
  );

  function step(d: number) {
    const cur = shown === "cta" ? count : shown;
    const next = Math.min(Math.max(cur + d, 0), count);
    if (playing) {
      seek((next === count ? timing.cta : timing.scenes[next]).start);
    } else select(next === count ? "cta" : next);
  }
}

/** Até 4 palavras faladas em volta do instante t, dentro do bloco (legenda da prévia). */
function captionAt(words: NarrationWord[], t: number, block?: { start: number; end: number }) {
  if (!block) return "";
  const inBlock = words.filter((w) => w[1] >= block.start - 0.1 && w[1] < block.end);
  if (!inBlock.length) return "";
  let i = inBlock.findIndex((w) => w[1] > t) - 1;
  if (i < 0) i = t < inBlock[0][1] ? 0 : inBlock.length - 1;
  const startIdx = Math.floor(i / 3) * 3;
  return inBlock
    .slice(startIdx, startIdx + 3)
    .map((w) => w[0])
    .join(" ");
}

function InspectorHead({
  badge,
  title,
  meta,
  onPrev,
  onNext,
}: {
  badge: string;
  title: string;
  meta: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="rounded-lg bg-accent-yellow px-2.5 py-1 text-xs font-bold text-accent-yellow-ink">{badge}</span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="text-xs tabular-nums text-text-secondary">{meta}</p>
      </div>
      <span className="flex-1" />
      <button type="button" aria-label="Anterior" onClick={onPrev} disabled={!onPrev} className={iconButton}>
        <Icon name="prev" className="h-4 w-4" />
      </button>
      <button type="button" aria-label="Próxima" onClick={onNext} disabled={!onNext} className={iconButton}>
        <Icon name="next" className="h-4 w-4" />
      </button>
    </div>
  );
}

function SceneInspector({
  index,
  total,
  scene,
  block,
  measured,
  noNarration,
  disabled,
  briefing,
  onAddImage,
  onChange,
  onPrev,
  onNext,
  onMove,
  onDuplicate,
  onInsertAfter,
  onRemove,
}: {
  index: number;
  total: number;
  scene: VideoScene;
  block: { start: number; end: number };
  measured: boolean;
  noNarration: boolean;
  disabled: boolean;
  briefing: BriefingImage[];
  onAddImage: (url: string) => void;
  onChange: (patch: Partial<VideoScene>) => void;
  onPrev: () => void;
  onNext: () => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onInsertAfter: () => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const ids = (k: string) => `scene-${index}-${k}`;
  return (
    <div>
      <InspectorHead
        badge={`Cena ${n}`}
        title="Detalhes da cena"
        meta={`de ${fmt(block.start)}s a ${fmt(block.end)}s · ${fmt(block.end - block.start)}s${!noNarration && !measured ? " (estimado)" : ""}`}
        onPrev={index > 0 ? onPrev : undefined}
        onNext={onNext}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {!noNarration && (
          <div>
            <label htmlFor={ids("narration")} className={labelClass}>
              Frase <span className="font-normal">(narração e legenda)</span>
            </label>
            <AutoTextarea
              id={ids("narration")}
              minRows={2}
              value={scene.narration}
              onChange={(e) => onChange({ narration: e.target.value })}
              disabled={disabled}
              className={`mt-1 ${fieldClass}`}
            />
          </div>
        )}
        <div>
          <label htmlFor={ids("screen")} className={labelClass}>
            Texto na tela
          </label>
          <AutoTextarea
            id={ids("screen")}
            value={scene.onScreen}
            onChange={(e) => onChange({ onScreen: e.target.value })}
            disabled={disabled}
            className={`mt-1 ${fieldClass}`}
          />
          {noNarration ? (
            <label className="mt-3 flex items-center gap-2 text-xs font-medium text-text-secondary">
              Duração
              <input
                type="number"
                inputMode="decimal"
                min={0.5}
                max={60}
                step={0.5}
                value={scene.durationS}
                onChange={(e) => onChange({ durationS: Number(e.target.value) })}
                disabled={disabled}
                className="h-10 w-20 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-accent-yellow"
              />
              s
            </label>
          ) : (
            <p className="mt-2 text-xs text-text-secondary">Com narração, a duração da cena segue a fala.</p>
          )}
        </div>
        <div>
          <label htmlFor={ids("visual")} className={labelClass}>
            O que aparece <span className="font-normal">(descrição para você revisar)</span>
          </label>
          <AutoTextarea
            id={ids("visual")}
            minRows={3}
            value={scene.visual}
            onChange={(e) => onChange({ visual: e.target.value })}
            disabled={disabled}
            className={`mt-1 ${fieldClass}`}
          />
        </div>
        <div>
          <div className="flex items-end justify-between gap-2">
            <label htmlFor={ids("prompt")} className={labelClass}>
              Prompt da imagem <span className="font-normal">(inglês)</span>
            </label>
            {!scene.imageUrl && <CopyButton text={scene.imagePrompt} />}
          </div>
          {scene.imageUrl ? (
            <p className="mt-1 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-text-secondary">
              Esta cena usa sua foto, então o prompt não é usado.
            </p>
          ) : (
            <AutoTextarea
              id={ids("prompt")}
              minRows={3}
              value={scene.imagePrompt}
              onChange={(e) => onChange({ imagePrompt: e.target.value })}
              disabled={disabled}
              className={`mt-1 font-mono text-xs ${fieldClass}`}
            />
          )}
        </div>
      </div>
      <SceneImage index={index} scene={scene} briefing={briefing} disabled={disabled} onPick={(url) => onChange({ imageUrl: url })} onAddImage={onAddImage} />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button type="button" onClick={() => onMove(-1)} disabled={disabled || index === 0} aria-label="Mover para a esquerda" title="Mover para a esquerda" className={iconButton}>
          <Icon name="prev" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={disabled || index === total - 1} aria-label="Mover para a direita" title="Mover para a direita" className={iconButton}>
          <Icon name="next" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDuplicate} disabled={disabled} className={`min-h-9 px-3 text-xs ${secondaryButton}`}>
          <Icon name="copy" /> Duplicar
        </button>
        <button type="button" onClick={onInsertAfter} disabled={disabled} className={`min-h-9 px-3 text-xs ${secondaryButton}`}>
          <Icon name="plus" /> Cena depois desta
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled || total <= 1}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-accent-red transition hover:bg-accent-red/10 disabled:opacity-40"
        >
          <Icon name="trash" /> Excluir cena
        </button>
      </div>
    </div>
  );
}

function CtaInspector({
  script,
  noNarration,
  disabled,
  block,
  onChange,
  onPrev,
}: {
  script: VideoScript;
  noNarration: boolean;
  disabled: boolean;
  block: { start: number; end: number };
  onChange: (patch: Partial<VideoScript["cta"]>) => void;
  onPrev: () => void;
}) {
  return (
    <div>
      <InspectorHead badge="Fecho" title="Chamada final (CTA)" meta={`de ${fmt(block.start)}s a ${fmt(block.end)}s`} onPrev={onPrev} />
      <div className="grid gap-4 sm:grid-cols-2">
        {!noNarration && (
          <div>
            <label htmlFor="cta-narration" className={labelClass}>
              CTA falado
            </label>
            <AutoTextarea
              id="cta-narration"
              minRows={2}
              value={script.cta.narration}
              onChange={(e) => onChange({ narration: e.target.value })}
              disabled={disabled}
              className={`mt-1 ${fieldClass}`}
            />
          </div>
        )}
        <div>
          <label htmlFor="cta-screen" className={labelClass}>
            CTA na tela
          </label>
          <AutoTextarea
            id="cta-screen"
            minRows={2}
            value={script.cta.onScreen}
            onChange={(e) => onChange({ onScreen: e.target.value })}
            disabled={disabled}
            className={`mt-1 ${fieldClass}`}
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-text-secondary">O logo da empresa aparece no topo durante o fecho, quando o perfil tem logo.</p>
    </div>
  );
}

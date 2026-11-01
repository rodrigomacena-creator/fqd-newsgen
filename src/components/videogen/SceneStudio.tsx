"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AutoTextarea, CopyButton, Icon } from "./ui";
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
  const keywords = new Set((script.keywords ?? []).flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean));
  const tickStep = px >= 40 ? 1 : px >= 20 ? 2 : 5;
  const ticks = Array.from({ length: Math.floor(timing.total / tickStep) + 1 }, (_, k) => k * tickStep);
  const majorEvery = tickStep === 1 ? 5 : 10;
  const phrase = shown === "cta" ? script.cta.narration || script.cta.onScreen : noNarration ? shownScene?.onScreen : shownScene?.narration;
  const addAtEnd = () => {
    onInsert(count, { ...EMPTY });
    setSel(count);
  };

  return (
    <div
      data-theme="dark"
      className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-3xl border border-[#222228] bg-[#0C0C0E] text-foreground shadow-[0_30px_80px_-40px_rgba(0,0,0,.6)] lg:grid-cols-[minmax(0,1fr)_392px] lg:grid-rows-[540px_auto]"
    >
      {useAudio && <audio ref={audioRef} src={narrationUrl!} preload="auto" onEnded={() => setPlaying(false)} className="hidden" />}

      {/* palco: número grande, frase e prévia 9:16 */}
      <section
        aria-label={shown === "cta" ? "Prévia do fecho" : `Prévia da cena ${shown + 1}`}
        className="relative order-1 flex items-center gap-4 overflow-hidden px-4 py-5 sm:gap-8 sm:px-8 sm:py-8 lg:border-r lg:border-[#222228]"
      >
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#E10600]/10 blur-3xl" />
        <div className="relative min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF3B3B]">{shown === "cta" ? "Fecho · CTA" : "Cena"}</p>
          <p className="mt-1 font-bold leading-none tracking-tight tabular-nums">
            {shown === "cta" ? (
              <span className="text-5xl sm:text-7xl">CTA</span>
            ) : (
              <>
                <span className="text-5xl sm:text-[88px]">{String(shown + 1).padStart(2, "0")}</span>
                <span className="ml-2 text-xl text-[#5A5A63] sm:text-3xl">/ {String(count).padStart(2, "0")}</span>
              </>
            )}
          </p>
          <p className="mt-3 line-clamp-4 text-base font-semibold leading-snug text-[#F4F2EE] sm:mt-5 sm:text-[26px] sm:leading-[1.25]">
            {phrase ? <>&ldquo;{phrase}&rdquo;</> : <em className="font-normal text-text-secondary">Sem frase ainda</em>}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-5 sm:gap-2">
            {shownBlock && (
              <>
                <Chip strong>{fmt(shownBlock.end - shownBlock.start)}s</Chip>
                <Chip>
                  {fmt(shownBlock.start)}s → {fmt(shownBlock.end)}s
                </Chip>
              </>
            )}
            {shown !== "cta" && <Chip>{shownScene?.imageUrl ? "Sua foto" : "Imagem por IA"}</Chip>}
            {!timing.measured && !noNarration && <Chip>estimado</Chip>}
          </div>
          <p className="mt-4 hidden max-w-md text-xs leading-relaxed text-text-secondary sm:block">
            Prévia aproximada. {useAudio ? "Toca com a narração gerada." : noNarration ? "Tempos pela duração das cenas." : "Tempos estimados até gerar a narração."} As
            imagens de verdade saem no render.
          </p>
        </div>

        <div className="relative aspect-[9/16] w-[118px] shrink-0 overflow-hidden rounded-[22px] border-[3px] border-[#26262C] bg-[#18181C] shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)] sm:w-[210px] sm:rounded-[30px] sm:border-4">
          {shownScene?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownScene.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_70%,#4a2a28_0,#221a1c_45%,#111113_100%)] px-3 text-center text-[10px] text-white/50 sm:text-[11px]">
              {shown !== "cta" && (
                <>
                  <Icon name="sparkles" className="h-5 w-5" />
                  <span className="hidden line-clamp-5 sm:[display:-webkit-box]">{shownScene?.visual || "Imagem gerada pela IA no render"}</span>
                </>
              )}
            </div>
          )}
          {shown === "cta" ? (
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-lg bg-[#E10600] px-2 py-2.5 text-center text-[11px] font-extrabold uppercase leading-tight text-white sm:inset-x-3 sm:text-sm">
              {script.cta.onScreen || "CTA"}
            </div>
          ) : (
            shownScene?.onScreen && (
              <p className="absolute inset-x-2 top-4 text-center text-[11px] font-extrabold uppercase leading-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,.6)] sm:top-7 sm:text-[17px]">
                {shownScene.onScreen}
              </p>
            )
          )}
          {caption.length > 0 && shown !== "cta" && (
            <p className="absolute inset-x-1.5 bottom-7 flex flex-wrap justify-center gap-x-1 gap-y-0.5 text-center text-[10px] font-extrabold uppercase text-white [text-shadow:0_2px_6px_#000] sm:bottom-12 sm:text-sm">
              {caption.map((w, k) =>
                keywords.has(norm(w)) ? (
                  <span key={k} className="rounded-[4px] bg-[#E10600] px-1 [text-shadow:none]">
                    {w}
                  </span>
                ) : (
                  <span key={k}>{w}</span>
                ),
              )}
            </p>
          )}
        </div>
      </section>

      {/* detalhes */}
      <aside
        aria-label="Detalhes"
        className="relative order-3 border-t border-[#222228] bg-[#141418] px-4 pb-5 pt-6 max-lg:rounded-t-3xl sm:px-6 lg:order-2 lg:overflow-y-auto lg:overscroll-contain lg:border-t-0 lg:pt-5 [scrollbar-color:#2A2A31_transparent] [scrollbar-width:thin]"
      >
        <span aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[#2A2A31] lg:hidden" />
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
              onInsert(selected + 1, { ...EMPTY });
              setSel(selected + 1);
            }}
            onRemove={() => onRemove(selected)}
          />
        ) : null}
      </aside>

      {/* timeline */}
      <section aria-label="Timeline das cenas" className="order-2 border-t border-[#222228] bg-[#101013] lg:order-3 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#222228] px-3 py-3 sm:px-5">
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Cena anterior" onClick={() => step(-1)} className={darkIconButton}>
              <Icon name="prev" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pausar" : "Tocar"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E10600] text-white shadow-[0_8px_24px_-6px_rgba(225,6,0,.7)] transition hover:bg-[#FF1A12] active:scale-95"
            >
              <Icon name={playing ? "pause" : "play"} className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Próxima cena" onClick={() => step(1)} className={darkIconButton}>
              <Icon name="next" className="h-4 w-4" />
            </button>
          </div>
          <p className="rounded-lg bg-[#0C0C0E] px-2.5 py-1.5 font-mono text-[13px] tabular-nums text-text-secondary">
            <span className="font-semibold text-[#F4F2EE]">{clock(time)}</span> / {clock(timing.total)}
          </p>
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-[#F4F2EE]">
              {count} {count === 1 ? "cena" : "cenas"} + fecho
            </span>{" "}
            · {fmt(timing.total)} s de {targetS} s{!timing.measured && !noNarration && " · estimado"}
          </p>
          <span className="flex-1" />
          <label className="hidden items-center gap-2 text-xs text-text-secondary sm:flex">
            Zoom
            <input
              type="range"
              min={MIN_PX}
              max={MAX_PX}
              value={Math.round(px)}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-28 accent-[#FF3B3B]"
              aria-label="Zoom da timeline"
            />
          </label>
          <button
            type="button"
            onClick={addAtEnd}
            disabled={disabled}
            aria-label="Adicionar cena"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#2A2A31] px-3 text-xs font-semibold text-[#F4F2EE] transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-40"
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Adicionar cena</span>
          </button>
        </div>

        <div ref={scrollRef} className="relative overflow-x-auto overscroll-x-contain pb-2">
          <div className="relative" style={{ width: width + LABEL_W }}>
            {/* nomes das trilhas (fixos ao rolar) */}
            <div
              className="sticky left-0 z-40 float-left border-r border-[#222228] bg-[#101013] text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary"
              style={{ width: LABEL_W }}
            >
              <div className="h-7 border-b border-[#222228]" />
              <div className="flex h-[88px] items-center gap-1.5 px-3">
                <Icon name="scenes" className="h-4 w-4 shrink-0" />
                {!narrow && <span>Cenas</span>}
              </div>
              {!noNarration && (
                <div className="flex h-14 items-center gap-1.5 px-3">
                  <Icon name="wave" className="h-4 w-4 shrink-0" />
                  {!narrow && <span>Voz</span>}
                </div>
              )}
              {script.musicPrompt && (
                <div className="flex h-11 items-center gap-1.5 px-3">
                  <Icon name="music" className="h-4 w-4 shrink-0" />
                  {!narrow && <span>Trilha</span>}
                </div>
              )}
            </div>

            <div className="relative" style={{ marginLeft: LABEL_W, width, paddingLeft: PAD }}>
              <div className="relative">
                {/* régua */}
                <div className="relative h-7 cursor-pointer border-b border-[#222228]" onPointerDown={(e) => seek(laneX(e.clientX) / px)} aria-hidden>
                  {ticks.map((s) => (
                    <span key={s} className="absolute bottom-0" style={{ left: s * px }}>
                      <span className={`block w-px ${s % majorEvery === 0 ? "h-2.5 bg-[#5A5A63]" : "h-1.5 bg-[#2A2A31]"}`} />
                      {s % majorEvery === 0 && (
                        <span className="absolute bottom-3 -translate-x-1/2 font-mono text-[10px] tabular-nums text-[#6E6E78]">{s}s</span>
                      )}
                    </span>
                  ))}
                </div>

                {/* cenas */}
                <div className="relative h-[88px] border-b border-[#1C1C21]" role="listbox" aria-label="Cenas" aria-orientation="horizontal">
                  {drag?.started && (
                    <>
                      <div
                        className="absolute top-2.5 bottom-2.5 rounded-xl border-[1.5px] border-dashed border-[#3A3A42] bg-white/[0.02]"
                        style={{ left: slotStart * px + 2, width: durations[drag.from] * px - 4 }}
                      />
                      <div
                        className="absolute top-0.5 bottom-0.5 z-20 w-[3px] -translate-x-1/2 rounded-full bg-[#FF3B3B] shadow-[0_0_12px_2px_rgba(255,59,59,.7)]"
                        style={{ left: slotStart * px }}
                      />
                    </>
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
                        className={`absolute top-2.5 bottom-2.5 select-none overflow-hidden rounded-xl border py-1.5 pl-5 pr-2 text-left outline-none transition-[box-shadow,background-color,border-color] focus-visible:ring-2 focus-visible:ring-[#FF3B3B] ${
                          isDrag
                            ? "z-30 -translate-y-3 -rotate-2 cursor-grabbing border-[#FF3B3B] bg-[#2A1416] shadow-[0_18px_40px_-8px_rgba(0,0,0,.8),0_0_0_1px_rgba(255,59,59,.4)]"
                            : isSel
                              ? "z-10 border-[#FF3B3B] bg-[#2A1416] shadow-[0_0_0_3px_rgba(255,59,59,.18),0_0_24px_-4px_rgba(255,59,59,.45)]"
                              : isPlaying
                                ? "border-[#4A4A52] bg-[#25252C]"
                                : "border-[#2A2A31] bg-[#1F1F25] hover:border-[#3A3A42] hover:bg-[#23232A]"
                        } ${disabled ? "cursor-default" : isDrag ? "" : "cursor-grab"} ${drag?.started && !isDrag ? "duration-200 [transition-property:left]" : ""}`}
                        style={{ left: left + 2, width: Math.max(durations[i] * px - 4, 18) }}
                      >
                        <span
                          aria-hidden
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onBlockPointerDown(e, i, true);
                          }}
                          className={`absolute inset-y-0 left-0 flex w-5 touch-none items-center justify-center ${isSel || isDrag ? "text-[#FF3B3B]/70" : "text-[#4A4A52]"}`}
                        >
                          <Icon name="grip" className="h-4 w-4" />
                        </span>
                        <span className={`flex justify-between gap-1 font-mono text-[10px] font-semibold tabular-nums ${isSel || isDrag ? "text-[#FF6B66]" : "text-[#7A7A84]"}`}>
                          <span className="truncate">{String(i + 1).padStart(2, "0")}</span>
                          {durations[i] * px >= 72 && <span>{fmt(durations[i])}s</span>}
                        </span>
                        <span className={`mt-1 line-clamp-2 text-xs font-medium leading-snug ${isSel || isDrag ? "text-white" : "text-[#D8D6D0]"}`}>
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
                    className={`absolute top-2.5 bottom-2.5 overflow-hidden rounded-xl border px-2.5 py-1.5 text-left text-[#141418] transition ${
                      selected === "cta"
                        ? "border-[#FF3B3B] bg-[#F4F2EE] shadow-[0_0_0_3px_rgba(255,59,59,.3),0_0_24px_-4px_rgba(255,59,59,.45)]"
                        : "border-[#F4F2EE] bg-[#E9E6DF] hover:bg-[#F4F2EE]"
                    }`}
                    style={{ left: timing.cta.start * px + 2, width: Math.max((timing.cta.end - timing.cta.start) * px - 4, 18) }}
                  >
                    <span className="flex justify-between gap-1 font-mono text-[10px] font-bold uppercase tabular-nums text-[#E10600]">
                      <span className="truncate">Fecho</span>
                      <span className="text-[#6E6E78]">{fmt(timing.cta.end - timing.cta.start)}s</span>
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs font-semibold leading-snug">{script.cta.narration || script.cta.onScreen}</span>
                  </button>
                  <button
                    type="button"
                    onClick={addAtEnd}
                    disabled={disabled}
                    aria-label="Adicionar cena no fim"
                    className="absolute top-2.5 bottom-2.5 flex w-11 items-center justify-center rounded-xl border border-dashed border-[#2A2A31] text-[#6E6E78] transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-40"
                    style={{ left: timing.total * px + 8 }}
                  >
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                </div>

                {/* voz: uma barrinha por palavra, no tempo dela (vermelha até o cursor) */}
                {!noNarration && (
                  <div className="relative h-14 border-b border-[#1C1C21]" aria-hidden>
                    {timing.words.map((w, k) => {
                      const h = 8 + ((w[0].length * 7 + k * 13) % 28);
                      return (
                        <span
                          key={k}
                          className={`absolute top-1/2 -translate-y-1/2 rounded-sm ${w[1] <= time ? "bg-[#FF3B3B]" : "bg-[#3A3A44]"}`}
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
                      className="absolute top-2 bottom-2 flex items-center overflow-hidden rounded-lg border border-[#3A3428] bg-[repeating-linear-gradient(90deg,#2A251C_0_3px,#1E1B15_3px_7px)] px-2.5 text-[11px] font-semibold text-[#CBB98F]"
                      style={{ left: 0, width: timing.total * px }}
                    >
                      <span className="truncate">♪ {script.musicPrompt}</span>
                    </div>
                  </div>
                )}

                {/* cursor de reprodução */}
                <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-[#FF3B3B] shadow-[0_0_8px_rgba(255,59,59,.6)]" style={{ left: time * px }} aria-hidden>
                  <span className="absolute left-1/2 top-0.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#FF3B3B] px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-white">
                    {fmt(time)}s
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="px-4 pb-3 pt-1 text-[11px] text-[#6E6E78] sm:px-5">
          {drag?.started
            ? `Solte para colocar a cena ${drag.from + 1} na linha vermelha.`
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

const EMPTY: VideoScene = { narration: "", onScreen: "", visual: "", imagePrompt: "", durationS: 2 };

const darkIconButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition hover:bg-white/5 hover:text-[#F4F2EE] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
const studioField =
  "w-full rounded-xl border border-[#222228] bg-[#0C0C0E] px-3 py-2.5 text-sm text-[#F4F2EE] outline-none transition placeholder:text-[#5A5A63] focus:border-[#FF3B3B] focus-visible:ring-2 focus-visible:ring-[#FF3B3B]/25 disabled:cursor-not-allowed disabled:opacity-50";
const studioLabel = "block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary";

const norm = (w: string) =>
  w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

function Chip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] tabular-nums sm:text-xs ${
        strong ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-[#FF8A85]" : "border-[#2A2A31] bg-[#141418] text-text-secondary"
      }`}
    >
      {children}
    </span>
  );
}

/** Até 3 palavras faladas em volta do instante t, dentro do bloco (legenda da prévia). */
function captionAt(words: NarrationWord[], t: number, block?: { start: number; end: number }): string[] {
  if (!block) return [];
  const inBlock = words.filter((w) => w[1] >= block.start - 0.1 && w[1] < block.end);
  if (!inBlock.length) return [];
  let i = inBlock.findIndex((w) => w[1] > t) - 1;
  if (i < 0) i = t < inBlock[0][1] ? 0 : inBlock.length - 1;
  const startIdx = Math.floor(i / 3) * 3;
  return inBlock.slice(startIdx, startIdx + 3).map((w) => w[0]);
}

function InspectorHead({ title, meta, onPrev, onNext }: { title: ReactNode; meta: string; onPrev?: () => void; onNext?: () => void }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-[#F4F2EE]">{title}</h3>
        <p className="font-mono text-[11px] tabular-nums text-text-secondary">{meta}</p>
      </div>
      <span className="flex-1" />
      <button type="button" aria-label="Anterior" onClick={onPrev} disabled={!onPrev} className={`${darkIconButton} border border-[#222228]`}>
        <Icon name="prev" className="h-4 w-4" />
      </button>
      <button type="button" aria-label="Próxima" onClick={onNext} disabled={!onNext} className={`${darkIconButton} border border-[#222228]`}>
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
  const footButton =
    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#2A2A31] px-3 text-xs font-semibold text-[#F4F2EE] transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-40";
  return (
    <div>
      <InspectorHead
        title={
          <>
            Cena {n} <span className="font-normal text-text-secondary">· Detalhes</span>
          </>
        }
        meta={`${fmt(block.start)}s → ${fmt(block.end)}s · ${fmt(block.end - block.start)}s${!noNarration && !measured ? " (estimado)" : ""}`}
        onPrev={index > 0 ? onPrev : undefined}
        onNext={onNext}
      />
      <div className="space-y-4">
        {!noNarration && (
          <div>
            <label htmlFor={ids("narration")} className={studioLabel}>
              Frase <span className="font-normal normal-case tracking-normal">(narração e legenda)</span>
            </label>
            <AutoTextarea
              id={ids("narration")}
              minRows={2}
              value={scene.narration}
              onChange={(e) => onChange({ narration: e.target.value })}
              disabled={disabled}
              className={`mt-1.5 ${studioField}`}
            />
          </div>
        )}
        <div>
          <label htmlFor={ids("screen")} className={studioLabel}>
            Texto na tela
          </label>
          <AutoTextarea id={ids("screen")} value={scene.onScreen} onChange={(e) => onChange({ onScreen: e.target.value })} disabled={disabled} className={`mt-1.5 ${studioField}`} />
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
                className="h-10 w-20 rounded-lg border border-[#222228] bg-[#0C0C0E] px-2 text-sm text-[#F4F2EE] outline-none focus:border-[#FF3B3B]"
              />
              s
            </label>
          ) : (
            <p className="mt-1.5 text-[11px] text-[#6E6E78]">Com narração, a duração da cena segue a fala.</p>
          )}
        </div>

        <SceneImage
          index={index}
          scene={scene}
          briefing={briefing}
          disabled={disabled}
          onPick={(url) => onChange({ imageUrl: url })}
          onAddImage={onAddImage}
          prompt={
            <div className="rounded-xl border border-[#222228] bg-[#0C0C0E] focus-within:border-[#FF3B3B]">
              <div className="flex items-center justify-between gap-2 border-b border-[#1C1C21] py-1 pl-3 pr-1">
                <label htmlFor={ids("prompt")} className="text-[11px] font-medium text-text-secondary">
                  Prompt da imagem (inglês)
                </label>
                <CopyButton text={scene.imagePrompt} />
              </div>
              <AutoTextarea
                id={ids("prompt")}
                minRows={3}
                value={scene.imagePrompt}
                onChange={(e) => onChange({ imagePrompt: e.target.value })}
                disabled={disabled}
                className="block w-full resize-none bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-[#D8D6D0] outline-none disabled:opacity-50"
              />
            </div>
          }
        />

        <div>
          <label htmlFor={ids("visual")} className={studioLabel}>
            O que aparece <span className="font-normal normal-case tracking-normal">(para você revisar)</span>
          </label>
          <AutoTextarea id={ids("visual")} minRows={2} value={scene.visual} onChange={(e) => onChange({ visual: e.target.value })} disabled={disabled} className={`mt-1.5 ${studioField}`} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#222228] pt-4">
        <button type="button" onClick={() => onMove(-1)} disabled={disabled || index === 0} aria-label="Mover para a esquerda" title="Mover para a esquerda" className={darkIconButton}>
          <Icon name="prev" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={disabled || index === total - 1} aria-label="Mover para a direita" title="Mover para a direita" className={darkIconButton}>
          <Icon name="next" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDuplicate} disabled={disabled} className={footButton}>
          <Icon name="copy" /> Duplicar
        </button>
        <button type="button" onClick={onInsertAfter} disabled={disabled} className={footButton}>
          <Icon name="plus" /> Cena depois
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled || total <= 1}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#FF5A55] transition hover:bg-[#FF3B3B]/10 disabled:opacity-40"
        >
          <Icon name="trash" /> Excluir
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
      <InspectorHead
        title={
          <>
            Fecho <span className="font-normal text-text-secondary">· Chamada final</span>
          </>
        }
        meta={`${fmt(block.start)}s → ${fmt(block.end)}s`}
        onPrev={onPrev}
      />
      <div className="space-y-4">
        {!noNarration && (
          <div>
            <label htmlFor="cta-narration" className={studioLabel}>
              CTA falado
            </label>
            <AutoTextarea id="cta-narration" minRows={2} value={script.cta.narration} onChange={(e) => onChange({ narration: e.target.value })} disabled={disabled} className={`mt-1.5 ${studioField}`} />
          </div>
        )}
        <div>
          <label htmlFor="cta-screen" className={studioLabel}>
            CTA na tela
          </label>
          <AutoTextarea id="cta-screen" minRows={2} value={script.cta.onScreen} onChange={(e) => onChange({ onScreen: e.target.value })} disabled={disabled} className={`mt-1.5 ${studioField}`} />
        </div>
      </div>
      <p className="mt-4 text-xs text-text-secondary">O logo da empresa aparece no topo durante o fecho, quando o perfil tem logo.</p>
    </div>
  );
}

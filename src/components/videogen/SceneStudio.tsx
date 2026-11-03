"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AutoTextarea, CopyButton, Icon, Spinner } from "./ui";
import { uploadImage } from "@/lib/videogen/uploadImage";
import { SceneImage } from "./SceneImage";
import { VoiceWave } from "./VoiceWave";
import { sceneTiming } from "@/lib/videogen/sceneTiming";
import { DIRECTION_FIELD_LABEL, DIRECTION_FIELDS, DIRECTION_OPTIONS, defaultDirection, type SceneDirection } from "@/lib/videogen/direction";
import { CTA_EFFECTS, MAX_BRIEFING_IMAGES, type AvatarTrack, type BriefingImage, type NarrationWord, type VideoScene, type VideoScript } from "@/lib/videogen/types";

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
  landscape = false,
  onScene,
  onCta,
  onReorder,
  onInsert,
  onRemove,
  onAddImage,
  avatar = null,
  avatarValid = false,
  lockedNarration = false,
}: {
  /** Vídeo base (avatar/vídeo seu): ganha uma trilha fixa na timeline e cada cena escolhe avatar ou imagem. */
  avatar?: AvatarTrack | null;
  /** A trilha base é da narração atual (senão está desatualizada). */
  avatarValid?: boolean;
  /** A fala vem de um vídeo gravado: o texto falado não muda. */
  lockedNarration?: boolean;
  script: VideoScript;
  briefing: BriefingImage[];
  narrationWords: NarrationWord[] | null;
  narrationUrl: string | null;
  noNarration: boolean;
  disabled: boolean;
  targetS: number;
  /** Vídeo horizontal (16:9): a prévia do palco fica deitada. */
  landscape?: boolean;
  onScene: (index: number, patch: Partial<VideoScene>) => void;
  onCta: (patch: Partial<VideoScript["cta"]>) => void;
  onReorder: (from: number, to: number) => void;
  onInsert: (at: number, scene: VideoScene) => void;
  onRemove: (index: number) => void;
  onAddImage: (url: string) => void;
}) {
  const timing = useMemo(() => sceneTiming(script, narrationWords, noNarration), [script, narrationWords, noNarration]);
  const count = script.scenes.length;
  const baseLabel = avatar?.source === "upload" ? "Vídeo" : "Avatar";
  /** Trecho do vídeo base que cobre o instante t (null se não tem). */
  const segmentAt = (t: number) =>
    avatarValid ? avatar?.segments.find((g) => g.status === "completed" && g.videoUrl && t >= g.start - 0.05 && t < g.end + 0.05) ?? null : null;
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

  // painel de detalhes (palco + inspetor) recolhido por padrão: só a timeline fica à vista
  // (o editor só monta no navegador, depois de carregar o vídeo: dá para ler o localStorage aqui)
  const [details, setDetailsState] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("videogen.details") === "1";
    } catch {
      return false;
    }
  });
  function setDetails(open: boolean) {
    setDetailsState(open);
    try {
      localStorage.setItem("videogen.details", open ? "1" : "0");
    } catch {}
  }
  /** Clique num bloco: seleciona e abre os detalhes. */
  function openBlock(s: Selection) {
    select(s);
    setDetails(true);
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

  /** Arrastar o marcador de tempo (pela régua, pela faixa da voz ou pela etiqueta do cursor). */
  function startScrub(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    seek(laneX(e.clientX) / px);
    const move = (ev: PointerEvent) => seek(laneX(ev.clientX) / px);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
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
      openBlock(i);
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
  const shownPreview = shownScene?.preview && shownScene.preview.prompt === shownScene.imagePrompt ? shownScene.preview.url : undefined;
  const caption = captionAt(timing.words, playing ? time : (shownBlock?.start ?? 0) + 0.01, shownBlock);
  const keywords = new Set((script.keywords ?? []).flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean));
  const tickStep = px >= 40 ? 1 : px >= 20 ? 2 : 5;
  const ticks = Array.from({ length: Math.floor(timing.total / tickStep) + 1 }, (_, k) => k * tickStep);
  const majorEvery = tickStep === 1 ? 5 : 10;
  const phrase = shown === "cta" ? script.cta.narration || script.cta.onScreen : noNarration ? shownScene?.onScreen : shownScene?.narration;
  // roteiro com direção de movimento: cena nova já nasce com uma (roteiro antigo sem direção fica como está)
  const directed = script.scenes.some((sc) => sc.direction);
  const blank = (at: number): VideoScene => (directed ? { ...EMPTY, direction: defaultDirection(at) } : { ...EMPTY });
  const addAtEnd = () => {
    onInsert(count, blank(count));
    setSel(count);
  };

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-3xl border border-border bg-surface text-foreground shadow-[0_30px_80px_-50px_rgba(0,0,0,.35)] lg:grid-cols-[minmax(0,1fr)_392px] ${details ? "lg:grid-rows-[auto_540px]" : ""}`}
    >
      {useAudio && <audio ref={audioRef} src={narrationUrl!} preload="auto" onEnded={() => setPlaying(false)} className="hidden" />}

      {/* palco: número grande, frase e prévia 9:16 */}
      <section
        aria-label={shown === "cta" ? "Prévia do fecho" : `Prévia da cena ${shown + 1}`}
        id="studio-details-stage"
        hidden={!details}
        className="relative order-2 flex items-center gap-4 overflow-hidden px-4 py-5 sm:gap-8 sm:px-8 sm:py-8 lg:border-r lg:border-border"
      >
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#E10600]/[0.06] blur-3xl" />
        <div className="relative min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF3B3B]">{shown === "cta" ? "Fecho · CTA" : "Cena"}</p>
          <p className="mt-1 font-bold leading-none tracking-tight tabular-nums">
            {shown === "cta" ? (
              <span className="text-5xl sm:text-7xl">CTA</span>
            ) : (
              <>
                <span className="text-5xl sm:text-[88px]">{String(shown + 1).padStart(2, "0")}</span>
                <span className="ml-2 text-xl text-text-secondary/70 sm:text-3xl">/ {String(count).padStart(2, "0")}</span>
              </>
            )}
          </p>
          <p className="mt-3 line-clamp-4 text-base font-semibold leading-snug text-foreground sm:mt-5 sm:text-[26px] sm:leading-[1.25]">
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
            {shown !== "cta" && (
              <Chip>{avatar && shownScene?.avatar ? baseLabel : shownScene?.imageUrl ? "Sua imagem" : shownScene?.stock?.source === "upload" ? "Seu vídeo" : shownPreview ? "Storyboard" : "Imagem por IA"}</Chip>
            )}
            {!timing.measured && !noNarration && <Chip>estimado</Chip>}
          </div>
          <p className="mt-4 hidden max-w-md text-xs leading-relaxed text-text-secondary sm:block">
            Prévia aproximada. {useAudio ? "Toca com a narração gerada." : noNarration ? "Tempos pela duração das cenas." : "Tempos estimados até gerar a narração."} As
            imagens de verdade saem no render.
          </p>
        </div>

        <div
          className={`relative shrink-0 overflow-hidden border-[3px] border-[#26262C] bg-[#18181C] shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)] sm:border-4 ${
            landscape ? "aspect-video w-[180px] rounded-xl sm:w-[300px] sm:rounded-2xl" : "aspect-[9/16] w-[118px] rounded-[22px] sm:w-[210px] sm:rounded-[30px]"
          }`}
        >
          {avatar && shownScene?.avatar && (segmentAt((shownBlock?.start ?? 0) + 0.05) || avatar.imageUrl) ? (
            <BaseFrame
              segment={segmentAt((shownBlock?.start ?? 0) + 0.05)}
              poster={avatar.imageUrl}
              time={playing ? time : (shownBlock?.start ?? 0) + 0.05}
              playing={playing}
            />
          ) : shownScene?.imageUrl || shownPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownScene?.imageUrl || shownPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
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
        id="studio-details"
        hidden={!details}
        aria-label="Detalhes"
        className="relative order-3 border-t border-border bg-background px-4 pb-5 pt-6 max-lg:rounded-t-3xl sm:px-6 lg:overflow-y-auto lg:overscroll-contain lg:border-t-0 lg:pt-5 [scrollbar-color:var(--border-hover)_transparent] [scrollbar-width:thin]"
      >
        <span aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border-hover lg:hidden" />
        {selected === "cta" ? (
          <CtaInspector script={script} noNarration={noNarration} disabled={disabled} block={timing.cta} onChange={onCta} onPrev={() => select(count - 1)} briefing={briefing} onAddImage={onAddImage} />
        ) : script.scenes[selected] ? (
          <SceneInspector
            index={selected}
            total={count}
            hasBase={Boolean(avatar)}
            baseLabel={baseLabel}
            lockedNarration={lockedNarration}
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
            directed={directed}
            onEnableDirection={() => script.scenes.forEach((_, i) => onScene(i, { direction: defaultDirection(i) }))}
            onInsertAfter={() => {
              onInsert(selected + 1, blank(selected + 1));
              setSel(selected + 1);
            }}
            onRemove={() => onRemove(selected)}
          />
        ) : null}
      </aside>

      {/* timeline */}
      <section aria-label="Timeline das cenas" className={`order-1 bg-surface-2 lg:col-span-2 ${details ? "border-b border-border" : ""}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-3 sm:px-5">
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
          <p className="rounded-lg bg-surface px-2.5 py-1.5 font-mono text-[13px] tabular-nums text-text-secondary">
            <span className="font-semibold text-foreground">{clock(time)}</span> / {clock(timing.total)}
          </p>
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-foreground">
              {count} {count === 1 ? "cena" : "cenas"} + fecho
            </span>{" "}
            · {fmt(timing.total)} s de {targetS} s{!timing.measured && !noNarration && " · estimado"}
          </p>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setDetails(!details)}
            aria-expanded={details}
            aria-controls="studio-details"
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
              details ? "border-[#FF3B3B] bg-[#FF3B3B]/10 text-[#FF3B3B]" : "border-border text-foreground hover:border-[#FF3B3B] hover:text-[#FF3B3B]"
            }`}
          >
            <Icon name="down" className={`h-3.5 w-3.5 transition-transform ${details ? "rotate-180" : ""}`} />
            {details ? "Fechar detalhes" : `Detalhes ${shown === "cta" ? "do fecho" : `da cena ${shown + 1}`}`}
          </button>
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
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-40"
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Adicionar cena</span>
          </button>
        </div>

        <div ref={scrollRef} className="relative isolate overflow-x-auto overscroll-x-contain pb-2">
          <div className="relative" style={{ width: width + LABEL_W }}>
            {/* nomes das trilhas (fixos ao rolar) */}
            <div
              className="sticky left-0 z-40 float-left border-r border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary"
              style={{ width: LABEL_W }}
            >
              <div className="h-7 border-b border-border" />
              <div className="flex h-[88px] items-center gap-1.5 px-3">
                <Icon name="scenes" className="h-4 w-4 shrink-0" />
                {!narrow && <span>Cenas</span>}
              </div>
              {avatar && (
                <div className="flex h-12 items-center gap-1.5 border-b border-border px-3">
                  <Icon name="user" className="h-4 w-4 shrink-0" />
                  {!narrow && <span>{baseLabel}</span>}
                </div>
              )}
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
                <div className="relative h-7 cursor-ew-resize touch-none select-none border-b border-border" onPointerDown={startScrub} aria-hidden>
                  {ticks.map((s) => (
                    <span key={s} className="absolute bottom-0" style={{ left: s * px }}>
                      <span className={`block w-px ${s % majorEvery === 0 ? "h-2.5 bg-text-secondary/60" : "h-1.5 bg-border-hover"}`} />
                      {s % majorEvery === 0 && (
                        <span className="absolute bottom-3 -translate-x-1/2 font-mono text-[10px] tabular-nums text-text-secondary">{s}s</span>
                      )}
                    </span>
                  ))}
                </div>

                {/* cenas */}
                <div className="relative h-[88px] border-b border-border" role="listbox" aria-label="Cenas" aria-orientation="horizontal">
                  {drag?.started && (
                    <>
                      <div
                        className="absolute top-2.5 bottom-2.5 rounded-xl border-[1.5px] border-dashed border-border-hover bg-surface-2/60"
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
                            openBlock(i);
                          } else onBlockKey(e, i);
                        }}
                        title="Clique para ver os detalhes · arraste para mudar a ordem (Alt+← → no teclado)"
                        className={`absolute top-2.5 bottom-2.5 select-none overflow-hidden rounded-xl border py-1.5 pl-5 pr-2 text-left outline-none transition-[box-shadow,background-color,border-color] focus-visible:ring-2 focus-visible:ring-[#FF3B3B] ${
                          isDrag
                            ? "z-30 -translate-y-3 -rotate-2 cursor-grabbing border-[#FF3B3B] bg-accent-yellow/[0.07] shadow-[0_18px_40px_-8px_rgba(0,0,0,.3),0_0_0_1px_rgba(255,59,59,.4)]"
                            : isSel
                              ? "z-10 border-[#FF3B3B] bg-accent-yellow/[0.07] shadow-[0_0_0_3px_rgba(255,59,59,.18),0_0_24px_-4px_rgba(255,59,59,.45)]"
                              : isPlaying
                                ? "border-border-hover bg-surface-2"
                                : "border-border bg-surface hover:border-border-hover hover:bg-surface-2"
                        } ${disabled ? "cursor-default" : isDrag ? "" : "cursor-grab"} ${drag?.started && !isDrag ? "duration-200 [transition-property:left]" : ""}`}
                        style={{ left: left + 2, width: Math.max(durations[i] * px - 4, 18) }}
                      >
                        <span
                          aria-hidden
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onBlockPointerDown(e, i, true);
                          }}
                          className={`absolute inset-y-0 left-0 flex w-5 touch-none items-center justify-center ${isSel || isDrag ? "text-[#FF3B3B]/70" : "text-text-secondary/50"}`}
                        >
                          <Icon name="grip" className="h-4 w-4" />
                        </span>
                        <span className={`flex justify-between gap-1 font-mono text-[10px] font-semibold tabular-nums ${isSel || isDrag ? "text-[#E10600] [[data-theme=dark]_&]:text-[#FF6B66]" : "text-text-secondary"}`}>
                          <span className="truncate">
                            {String(i + 1).padStart(2, "0")}
                            {avatar && sc.avatar && <span className="ml-1 rounded bg-[#2D6CDF] px-1 font-sans text-[9px] uppercase text-white">{baseLabel}</span>}
                          </span>
                          {durations[i] * px >= 72 && <span>{fmt(durations[i])}s</span>}
                        </span>
                        <span className={`mt-1 line-clamp-2 text-xs font-medium leading-snug ${isSel || isDrag ? "text-foreground" : "text-foreground/85"}`}>
                          {(noNarration ? sc.onScreen : sc.narration) || <em className="font-normal text-text-secondary">Sem frase</em>}
                        </span>
                      </div>
                    );
                  })}
                  {/* fecho */}
                  <button
                    type="button"
                    onClick={() => openBlock("cta")}
                    aria-pressed={selected === "cta"}
                    className={`absolute top-2.5 bottom-2.5 overflow-hidden rounded-xl border px-2.5 py-1.5 text-left text-background transition ${
                      selected === "cta"
                        ? "border-[#FF3B3B] bg-foreground shadow-[0_0_0_3px_rgba(255,59,59,.3),0_0_24px_-4px_rgba(255,59,59,.45)]"
                        : "border-foreground bg-foreground hover:opacity-90"
                    }`}
                    style={{ left: timing.cta.start * px + 2, width: Math.max((timing.cta.end - timing.cta.start) * px - 4, 18) }}
                  >
                    <span className="flex justify-between gap-1 font-mono text-[10px] font-bold uppercase tabular-nums text-[#E10600] [[data-theme=dark]_&]:text-[#FF6B66]">
                      <span className="truncate">Fecho</span>
                      <span className="opacity-60">{fmt(timing.cta.end - timing.cta.start)}s</span>
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs font-semibold leading-snug">{script.cta.narration || script.cta.onScreen}</span>
                  </button>
                  <button
                    type="button"
                    onClick={addAtEnd}
                    disabled={disabled}
                    aria-label="Adicionar cena no fim"
                    className="absolute top-2.5 bottom-2.5 flex w-11 items-center justify-center rounded-xl border border-dashed border-border text-text-secondary transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-40"
                    style={{ left: timing.total * px + 8 }}
                  >
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                </div>

                {/* vídeo base: trilha fixa por baixo das cenas; clique no trecho de uma cena troca avatar ↔ imagem */}
                {avatar && (
                  <div className="relative h-12 border-b border-border">
                    {timing.scenes.map((b, i) => {
                      const sc = script.scenes[i];
                      const on = Boolean(sc?.avatar);
                      const has = Boolean(segmentAt((b.start + b.end) / 2));
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={disabled}
                          aria-pressed={on}
                          onClick={() => onScene(i, { avatar: on ? undefined : true })}
                          title={on ? `Cena ${i + 1}: mostra ${baseLabel === "Vídeo" ? "o vídeo" : "o avatar"}. Clique para usar imagem.` : `Cena ${i + 1}: mostra imagem. Clique para usar ${baseLabel === "Vídeo" ? "o vídeo" : "o avatar"}.`}
                          className={`absolute top-1.5 bottom-1.5 flex items-center justify-center gap-1 overflow-hidden rounded-lg border px-1 text-[10px] font-semibold transition disabled:cursor-default ${
                            on
                              ? has
                                ? "border-[#2D6CDF] bg-[#2D6CDF] text-white hover:bg-[#2459B8]"
                                : "border-dashed border-[#2D6CDF] bg-[#2D6CDF]/10 text-[#2D6CDF]"
                              : "border-border bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--border)_5px_6px)] text-text-secondary hover:border-[#2D6CDF] hover:text-[#2D6CDF]"
                          }`}
                          style={{ left: b.start * px + 2, width: Math.max((b.end - b.start) * px - 4, 14) }}
                        >
                          <Icon name={on ? "user" : "image"} className="h-3.5 w-3.5 shrink-0" />
                          {(b.end - b.start) * px >= 64 && <span className="truncate">{on ? (has ? baseLabel : "sem avatar") : "Imagem"}</span>}
                        </button>
                      );
                    })}
                    {/* trechos já gerados (linha fina embaixo) */}
                    {avatarValid &&
                      avatar.segments.map((g, k) => (
                        <span
                          key={k}
                          aria-hidden
                          className={`absolute bottom-0.5 h-1 rounded-full ${g.status === "completed" ? "bg-[#2D6CDF]" : g.status === "failed" ? "bg-accent-red" : "animate-pulse bg-[#2D6CDF]/40"}`}
                          style={{ left: g.start * px + 2, width: Math.max((g.end - g.start) * px - 4, 4) }}
                        />
                      ))}
                  </div>
                )}

                {/* voz: onda sonora da narração (vermelha até o cursor) */}
                {!noNarration && (
                  <div className="relative flex h-14 cursor-ew-resize touch-none select-none items-center border-b border-border" onPointerDown={startScrub} aria-hidden>
                    <VoiceWave url={useAudio ? narrationUrl : null} words={timing.words} total={timing.total} px={px} time={time} height={48} />
                  </div>
                )}

                {/* trilha */}
                {script.musicPrompt && (
                  <div className="relative h-11" aria-hidden>
                    <div
                      className="absolute top-2 bottom-2 flex items-center overflow-hidden rounded-lg border border-[#e0d4bc] bg-[repeating-linear-gradient(90deg,#efe6d4_0_3px,#e9dec8_3px_7px)] px-2.5 text-[11px] font-semibold text-[#8a7a5c] [[data-theme=dark]_&]:border-[#3A3428] [[data-theme=dark]_&]:bg-[repeating-linear-gradient(90deg,#2A251C_0_3px,#1E1B15_3px_7px)] [[data-theme=dark]_&]:text-[#CBB98F]"
                      style={{ left: 0, width: timing.total * px }}
                    >
                      <span className="truncate">♪ {script.musicPrompt}</span>
                    </div>
                  </div>
                )}

                {/* cursor de reprodução */}
                <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-[#FF3B3B] shadow-[0_0_8px_rgba(255,59,59,.6)]" style={{ left: time * px }} aria-hidden>
                  <span
                    onPointerDown={startScrub}
                    title="Arraste para mudar o tempo"
                    className="pointer-events-auto absolute left-1/2 top-0.5 -translate-x-1/2 cursor-grab touch-none select-none whitespace-nowrap rounded-md bg-[#FF3B3B] px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-white active:cursor-grabbing"
                  >
                    {fmt(time)}s
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="px-4 pb-3 pt-1 text-[11px] text-text-secondary sm:px-5">
          {drag?.started
            ? `Solte para colocar a cena ${drag.from + 1} na linha vermelha.`
            : details
              ? "Clique num bloco para ver e editar tudo da cena. Arraste para mudar a ordem (no celular, pela alça à esquerda do bloco)."
              : "Clique num bloco (ou em “Detalhes”) para abrir a prévia e editar a cena. Arraste para mudar a ordem."}
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

/** Slide novo em branco na posição `at` (roteiro com direção de movimento: já nasce com uma). */
export function blankScene(scenes: VideoScene[], at: number): VideoScene {
  return scenes.some((sc) => sc.direction) ? { ...EMPTY, direction: defaultDirection(at) } : { ...EMPTY };
}

const darkIconButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
const studioField =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-secondary/70 focus:border-[#FF3B3B] focus-visible:ring-2 focus-visible:ring-[#FF3B3B]/25 disabled:cursor-not-allowed disabled:opacity-50";
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
        strong ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-[#E10600] [[data-theme=dark]_&]:text-[#FF6B66]" : "border-border bg-surface text-text-secondary"
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
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="font-mono text-[11px] tabular-nums text-text-secondary">{meta}</p>
      </div>
      <span className="flex-1" />
      <button type="button" aria-label="Anterior" onClick={onPrev} disabled={!onPrev} className={`${darkIconButton} border border-border`}>
        <Icon name="prev" className="h-4 w-4" />
      </button>
      <button type="button" aria-label="Próxima" onClick={onNext} disabled={!onNext} className={`${darkIconButton} border border-border`}>
        <Icon name="next" className="h-4 w-4" />
      </button>
    </div>
  );
}

function SceneInspector({
  index,
  total,
  hasBase,
  baseLabel,
  lockedNarration,
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
  directed,
  onEnableDirection,
}: {
  directed: boolean;
  onEnableDirection: () => void;
  hasBase: boolean;
  baseLabel: string;
  lockedNarration: boolean;
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
    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-40";
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
        {hasBase && (
          <div>
            <p className={studioLabel}>Nesta cena aparece</p>
            <div role="radiogroup" aria-label="Nesta cena aparece" className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1">
              {[
                { on: true, label: baseLabel === "Vídeo" ? "Seu vídeo" : "Você (avatar)", icon: "user" as const },
                { on: false, label: "Imagem", icon: "image" as const },
              ].map((o) => {
                const active = Boolean(scene.avatar) === o.on;
                return (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => onChange({ avatar: o.on ? true : undefined })}
                    className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${
                      active ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-text-secondary hover:text-foreground"
                    }`}
                  >
                    <Icon name={o.icon} className="h-3.5 w-3.5" /> {o.label}
                  </button>
                );
              })}
            </div>
            {scene.avatar && (
              <p className="mt-1.5 text-[11px] text-text-secondary">
                A cena mostra {baseLabel === "Vídeo" ? "o seu vídeo" : "o avatar falando"} em tela cheia, com o texto e a legenda do estilo por cima. A imagem abaixo só entra se não houver vídeo.
              </p>
            )}
          </div>
        )}
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
              disabled={disabled || lockedNarration}
              className={`mt-1.5 ${studioField}`}
            />
            {lockedNarration && <p className="mt-1.5 text-[11px] text-text-secondary">A fala vem do vídeo que você enviou e não muda aqui.</p>}
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
                className="h-10 w-20 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-[#FF3B3B]"
              />
              s
            </label>
          ) : (
            <p className="mt-1.5 text-[11px] text-text-secondary">Com narração, a duração da cena segue a fala.</p>
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
            <div className="rounded-xl border border-border bg-surface focus-within:border-[#FF3B3B]">
              <div className="flex items-center justify-between gap-2 border-b border-border py-1 pl-3 pr-1">
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
                className="block w-full resize-none bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground/85 outline-none disabled:opacity-50"
              />
            </div>
          }
        />

        {!scene.imageUrl && scene.layout !== "text_only" && scene.stock?.source !== "upload" && (
          <div>
            <label htmlFor={ids("stock")} className={studioLabel}>
              Vídeo de banco <span className="font-normal normal-case tracking-normal text-text-secondary">(opcional, busca em inglês)</span>
            </label>
            <input
              id={ids("stock")}
              value={scene.stockQuery ?? ""}
              placeholder="ex.: barista pouring coffee"
              maxLength={80}
              onChange={(e) => onChange({ stockQuery: e.target.value || undefined, stock: undefined })}
              disabled={disabled}
              className={`mt-1.5 ${studioField}`}
            />
            <p className="mt-1.5 text-[11px] text-text-secondary">
              {scene.stock
                ? `Clipe escolhido (${scene.stock.source === "pexels" ? "Pexels" : "Pixabay"}). Troque no storyboard.`
                : "Com uma busca aqui, a cena usa um vídeo filmado de verdade no lugar da imagem. Clique em “Buscar vídeos de banco” no storyboard para ver o clipe. Vale no estilo livre e nos templates."}
            </p>
          </div>
        )}

        <MotionFields index={index} direction={scene.direction} directed={directed} disabled={disabled} onChange={(direction) => onChange({ direction })} onEnable={onEnableDirection} />

        <div>
          <label htmlFor={ids("visual")} className={studioLabel}>
            O que aparece <span className="font-normal normal-case tracking-normal">(para você revisar)</span>
          </label>
          <AutoTextarea id={ids("visual")} minRows={2} value={scene.visual} onChange={(e) => onChange({ visual: e.target.value })} disabled={disabled} className={`mt-1.5 ${studioField}`} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
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
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-accent-red transition hover:bg-[#FF3B3B]/10 disabled:opacity-40"
        >
          <Icon name="trash" /> Excluir
        </button>
      </div>
    </div>
  );
}

/** Direção de movimento da cena: corte, câmera, objeto, traço e ênfase (o worker só entende estes valores). */
function MotionFields({
  index,
  direction,
  directed,
  disabled,
  onChange,
  onEnable,
}: {
  index: number;
  direction?: SceneDirection;
  directed: boolean;
  disabled: boolean;
  onChange: (d: SceneDirection) => void;
  onEnable: () => void;
}) {
  if (!direction) {
    if (directed) return null;
    return (
      <div className="rounded-xl border border-dashed border-border p-3">
        <p className={studioLabel}>Movimento</p>
        <p className="mt-1.5 text-xs text-text-secondary">
          Este roteiro é de antes do movimento por cena e renderiza como antes. Ativar dá a cada cena um corte de entrada, câmera, entrada do objeto, traço à mão e
          ênfase na palavra-chave, que você pode ajustar.
        </p>
        <button
          type="button"
          onClick={onEnable}
          disabled={disabled}
          className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-40"
        >
          <Icon name="sparkles" /> Ativar movimento por cena
        </button>
      </div>
    );
  }
  return (
    <fieldset>
      <legend className={studioLabel}>Movimento</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {DIRECTION_FIELDS.map((f) => {
          const id = `scene-${index}-dir-${f}`;
          const options = DIRECTION_OPTIONS[f] as Record<string, string>;
          return (
            <div key={f} className={f === "cut" ? "col-span-2" : undefined}>
              <label htmlFor={id} className="text-[11px] font-medium text-text-secondary">
                {DIRECTION_FIELD_LABEL[f]}
              </label>
              <select
                id={id}
                value={direction[f]}
                disabled={disabled}
                onChange={(e) => onChange({ ...direction, [f]: e.target.value } as SceneDirection)}
                className={`mt-1 h-10 !py-0 ${studioField.replace("bg-surface", "bg-background").replace("text-sm", "text-[13px]")}`}
              >
                {Object.entries(options).map(([value, label]) => (
                  <option key={value} value={value} className="bg-background text-foreground">
                    {label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function CtaInspector({
  script,
  noNarration,
  disabled,
  block,
  onChange,
  onPrev,
  briefing,
  onAddImage,
}: {
  script: VideoScript;
  noNarration: boolean;
  disabled: boolean;
  block: { start: number; end: number };
  onChange: (patch: Partial<VideoScript["cta"]>) => void;
  onPrev: () => void;
  briefing: BriefingImage[];
  onAddImage: (url: string) => void;
}) {
  const cta = script.cta;
  const logoMode = cta.logo ?? "company";
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

      <div className="mt-6 space-y-5 border-t border-border pt-5">
        <div>
          <p className={studioLabel}>Efeito</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {CTA_EFFECTS.map((e) => {
              const active = (cta.effect ?? "none") === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => onChange({ effect: e.id === "none" ? undefined : e.id })}
                  className={`min-h-9 rounded-lg border px-2 text-xs font-semibold transition disabled:opacity-50 ${
                    active ? "border-[#FF3B3B] bg-[#FF3B3B]/10 text-[#FF3B3B]" : "border-border text-text-secondary hover:text-foreground"
                  }`}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        </div>

        <CtaImagePicker
          label="Imagem no fecho"
          help="Aparece num cartão entre o logo e o texto do CTA (produto, capa, foto sua...)."
          url={cta.imageUrl}
          briefing={briefing}
          disabled={disabled}
          onAddImage={onAddImage}
          onPick={(url) => onChange({ imageUrl: url })}
        />

        <div>
          <p className={studioLabel}>Logo no topo</p>
          <div role="radiogroup" aria-label="Logo no topo do fecho" className="mt-2 flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {(
              [
                ["company", "Da empresa"],
                ["custom", "Outro"],
                ["none", "Sem logo"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={logoMode === id}
                disabled={disabled}
                onClick={() => onChange({ logo: id === "company" ? undefined : id, ...(id !== "custom" ? { logoUrl: undefined } : {}) })}
                className={`flex min-h-9 flex-1 items-center justify-center rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
                  logoMode === id ? "bg-surface text-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {logoMode === "company" && <p className="mt-1.5 text-[11px] text-text-secondary">Usa o logo do perfil da empresa, quando ele tem logo.</p>}
          {logoMode === "custom" && (
            <div className="mt-3">
              <CtaImagePicker
                label="Logo"
                help="PNG com fundo transparente fica melhor. Vai sobre um cartão branco."
                url={cta.logoUrl}
                briefing={briefing}
                disabled={disabled}
                onAddImage={onAddImage}
                onPick={(url) => onChange({ logoUrl: url })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Escolhe uma imagem do briefing ou envia uma nova (que entra no briefing, para o Blob ser limpo depois). */
function CtaImagePicker({
  label,
  help,
  url,
  briefing,
  disabled,
  onAddImage,
  onPick,
}: {
  label: string;
  help: string;
  url?: string;
  briefing: BriefingImage[];
  disabled: boolean;
  onAddImage: (url: string) => void;
  onPick: (url: string | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = briefing.length >= MAX_BRIEFING_IMAGES;

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const u = await uploadImage(file, "briefing");
      onAddImage(u);
      onPick(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className={studioLabel}>{label}</p>
      {url ? (
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-16 w-16 rounded-lg border border-border bg-white object-contain" />
          <button type="button" disabled={disabled} onClick={() => onPick(undefined)} className="text-xs font-semibold text-text-secondary hover:text-[#FF3B3B] disabled:opacity-50">
            Remover
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {briefing.map((b) => (
            <button
              key={b.url}
              type="button"
              disabled={disabled}
              onClick={() => onPick(b.url)}
              title="Usar esta imagem"
              className="h-14 w-14 overflow-hidden rounded-lg border border-border transition hover:border-[#FF3B3B] disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
          <button
            type="button"
            disabled={disabled || uploading || full}
            onClick={() => inputRef.current?.click()}
            className="flex h-14 min-w-14 items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 text-xs font-semibold text-text-secondary transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-50"
          >
            {uploading ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />} Enviar
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-text-secondary">{full && !url ? `Limite de ${MAX_BRIEFING_IMAGES} imagens no vídeo.` : help}</p>
      {error && <p className="mt-1 text-[11px] text-[#FF3B3B]">{error}</p>}
    </div>
  );
}

/** Prévia do vídeo base no palco: mostra o trecho no instante da cena (e acompanha quando toca). */
function BaseFrame({
  segment,
  poster,
  time,
  playing,
}: {
  segment: { start: number; videoUrl?: string } | null;
  poster?: string;
  time: number;
  playing: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !segment) return;
    const want = Math.max(0, time - segment.start);
    if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
    if (playing && v.paused) void v.play().catch(() => {});
    if (!playing && !v.paused) v.pause();
  }, [segment, time, playing]);
  if (!segment?.videoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return poster ? <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null;
  }
  return <video ref={ref} key={segment.videoUrl} src={segment.videoUrl} muted playsInline preload="auto" poster={poster} className="absolute inset-0 h-full w-full object-cover" />;
}

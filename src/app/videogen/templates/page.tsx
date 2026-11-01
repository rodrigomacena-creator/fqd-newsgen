"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { Header } from "@/components/Header";
import { formatUsd } from "@/components/videogen/CostPanel";
import { Icon, Spinner, cardClass, dangerButton, fieldClass, iconButton, primaryButton, secondaryButton, sectionTitle } from "@/components/videogen/ui";
import { TEMPLATE_STATUS_LABEL } from "@/lib/videogen/types";
import type { VideoTemplateDTO } from "@/lib/videogen/templates";

const MAX_BYTES = 300 * 1024 * 1024;
const EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v" };

const HOW = [
  { title: "Cole o link ou envie o vídeo", body: "Um Reels, Short ou pin com a edição que você quer copiar: link do YouTube ou do Pinterest, ou o arquivo." },
  { title: "A IA aprende a edição", body: "Ela assiste o vídeo e anota cores, fontes, legenda, transições e ritmo." },
  { title: "Veja o exemplo de 5s", body: "O motor de render monta um exemplo. Pronto, o estilo aparece no seletor." },
];

function randomId() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

const LINK_RE = /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|pin\.it|pinterest\.(com(\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2}))(\/|$)/i;

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

export default function TemplatesPage() {
  const [mode, setMode] = useState<"link" | "file">("link");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [templates, setTemplates] = useState<VideoTemplateDTO[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/videogen/templates")
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates((t) => t ?? []));
  }, []);

  useEffect(load, [load]);

  const building = Boolean(templates?.some((t) => t.status === "queued" || t.status === "analyzing"));
  useEffect(() => {
    if (!building) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [building, load]);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function pick(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (!EXT[f.type]) {
      setError("Formato não suportado. Envie um vídeo .mp4, .mov ou .webm.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`O vídeo tem ${formatMb(f.size)}. O limite é 300 MB: corte um trecho menor.`);
      return;
    }
    setFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "link") {
      if (!LINK_RE.test(link.trim())) {
        setError("Cole um link do YouTube ou do Pinterest (ex.: youtube.com/shorts/…, pin.it/…).");
        document.getElementById("tpl-link")?.focus();
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/videogen/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, notes, sourceUrl: link.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao criar o template.");
        setTemplates((list) => [data.template, ...(list ?? [])]);
        setLink("");
        setName("");
        setNotes("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!file) {
      setError("Escolha o vídeo de referência.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setUploadPct(0);
    try {
      const blob = await upload(`videogen/templates/ref-${randomId()}/referencia.${EXT[file.type]}`, file, {
        access: "public",
        handleUploadUrl: "/api/videogen/templates/upload",
        contentType: file.type,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setUploadPct(Math.round(percentage)),
      });
      setUploadPct(100);
      const res = await fetch("/api/videogen/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, notes, referenceUrl: blob.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar o template.");
      setTemplates((list) => [data.template, ...(list ?? [])]);
      setFile(null);
      setName("");
      setNotes("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado no envio.");
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  }

  async function act(t: VideoTemplateDTO, kind: "retry" | "delete") {
    if (kind === "delete" && !window.confirm(`Excluir o template "${t.name}"? Vídeos que usam este estilo não poderão mais ir para o render.`)) {
      return;
    }
    setActing(t.id);
    setError(null);
    try {
      const res = await fetch(kind === "retry" ? `/api/videogen/templates/${t.id}/retry` : `/api/videogen/templates/${t.id}`, {
        method: kind === "retry" ? "POST" : "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não deu certo.");
      setTemplates((list) =>
        kind === "delete" ? (list ?? []).filter((x) => x.id !== t.id) : (list ?? []).map((x) => (x.id === t.id ? data.template : x))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header wide />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/videogen"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-secondary transition hover:text-accent-yellow"
        >
          <Icon name="back" className="h-4 w-4" /> VideoGen
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Montar template</h1>
        <p className="mt-2 max-w-2xl text-text-secondary">
          Transforme um vídeo que você admira em um estilo seu. Depois é só escolher o estilo ao criar um vídeo novo.
        </p>

        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {HOW.map((h, i) => (
            <li key={h.title} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-yellow text-sm font-bold text-accent-yellow-ink">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold">{h.title}</span>
                <span className="mt-0.5 block text-xs text-text-secondary">{h.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <form onSubmit={handleSubmit} noValidate className={`${cardClass} min-w-0 space-y-5`} aria-busy={busy}>
            <h2 className={sectionTitle}>Novo template</h2>

            <div role="tablist" aria-label="Como enviar a referência" className="inline-flex rounded-lg border border-border p-1">
              {(
                [
                  ["link", "Colar link"],
                  ["file", "Enviar arquivo"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  disabled={busy}
                  className={`min-h-9 rounded-md px-3 text-sm font-medium transition ${
                    mode === m ? "bg-accent-yellow text-accent-yellow-ink" : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "link" ? (
              <div>
                <label htmlFor="tpl-link" className="block text-sm font-medium">
                  Link do vídeo <span aria-hidden>*</span>
                </label>
                <input
                  id="tpl-link"
                  type="url"
                  inputMode="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  disabled={busy}
                  placeholder="https://www.youtube.com/shorts/… ou https://pin.it/…"
                  className={`mt-2 ${fieldClass}`}
                />
                <p className="mt-1.5 text-xs text-text-secondary">
                  YouTube (vídeo ou Short) ou Pinterest (pin com vídeo). O servidor baixa o vídeo sozinho; de vídeos longos, usa os 2 primeiros minutos.
                </p>
              </div>
            ) : (
            <div>
              <span className="block text-sm font-medium">
                Vídeo de referência <span aria-hidden>*</span>
              </span>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`mt-2 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-5 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-yellow/40 sm:flex-row sm:text-left ${
                  dragging ? "border-accent-yellow bg-accent-yellow/5" : "border-border hover:border-border-hover"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                  onChange={(e) => pick(e.target.files?.[0])}
                  disabled={busy}
                  className="sr-only"
                />
                {previewUrl && file ? (
                  <video src={previewUrl} muted playsInline autoPlay loop className="h-40 w-[90px] shrink-0 rounded-lg bg-black object-cover" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-secondary">
                    <Icon name="film" className="h-6 w-6" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                    {file ? file.name : "Arraste o vídeo aqui ou toque para escolher"}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {file ? `${formatMb(file.size)} · toque para trocar` : ".mp4, .mov ou .webm, até 300 MB. Vertical funciona melhor."}
                  </span>
                </span>
              </label>
            </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="tpl-name" className="block text-sm font-medium">
                  Nome do estilo <span className="font-normal text-text-secondary">(opcional)</span>
                </label>
                <input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  disabled={busy}
                  placeholder="A IA sugere um se ficar vazio"
                  className={`mt-2 ${fieldClass}`}
                />
              </div>
              <div>
                <label htmlFor="tpl-notes" className="block text-sm font-medium">
                  O que aproveitar? <span className="font-normal text-text-secondary">(opcional)</span>
                </label>
                <input
                  id="tpl-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={1000}
                  disabled={busy}
                  placeholder="Ex.: a legenda e as cores; ignore o apresentador"
                  className={`mt-2 ${fieldClass}`}
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
              </div>
            )}

            {uploadPct !== null && (
              <div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadPct}
                  aria-label="Envio do vídeo"
                  className="h-2 overflow-hidden rounded-full bg-surface-2"
                >
                  <div className="h-full rounded-full bg-accent-yellow transition-[width]" style={{ width: `${Math.max(3, uploadPct)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-text-secondary" aria-live="polite">
                  Enviando o vídeo… <span className="tabular-nums">{uploadPct}%</span>
                </p>
              </div>
            )}

            <button type="submit" disabled={busy} className={`w-full py-3.5 ${primaryButton}`}>
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="arrow" className="h-4 w-4" />}
              {busy ? (mode === "link" ? "Criando…" : "Enviando…") : "Montar template"}
            </button>
            <p className="text-center text-xs text-text-secondary">
              A montagem roda no servidor de render e leva de 2 a 5 minutos. Você pode sair desta página.
            </p>
          </form>

          <aside className="min-w-0" aria-labelledby="tpl-list-title">
            <h2 id="tpl-list-title" className={sectionTitle}>
              Seus templates
            </h2>
            <div className="mt-4 space-y-3">
              {templates === null &&
                [0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />)}
              {templates?.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
                  <p className="text-sm font-medium">Nenhum template ainda</p>
                  <p className="mt-1 text-xs text-text-secondary">O primeiro que você montar aparece aqui e no seletor de estilo.</p>
                </div>
              )}
              {templates?.map((t) => (
                <TemplateCard key={t.id} t={t} busy={acting === t.id} onRetry={() => act(t, "retry")} onDelete={() => act(t, "delete")} />
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function TemplateCard({ t, busy, onRetry, onDelete }: { t: VideoTemplateDTO; busy: boolean; onRetry: () => void; onDelete: () => void }) {
  const building = t.status === "queued" || t.status === "analyzing";
  return (
    <article className="flex gap-4 rounded-2xl border border-border bg-surface p-3">
      <div className="relative aspect-[9/16] w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        {t.status === "ready" && t.sampleUrl ? (
          <video src={t.sampleUrl} muted loop playsInline autoPlay controls aria-label={`Exemplo de ${t.name}`} className="h-full w-full object-cover" />
        ) : t.sourceUrl ? (
          <span aria-hidden className="flex h-full w-full items-center justify-center text-text-secondary">
            <Icon name="film" className="h-6 w-6" />
          </span>
        ) : (
          <video src={`${t.referenceUrl}#t=1`} muted playsInline preload="metadata" aria-hidden className="h-full w-full object-cover opacity-60" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold">{t.name}</h3>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy || t.status === "analyzing"}
            aria-label={`Excluir ${t.name}`}
            title={t.status === "analyzing" ? "Espere a montagem terminar" : "Excluir"}
            className={`-mr-1 -mt-1 shrink-0 ${iconButton}`}
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${
              t.status === "ready"
                ? "bg-success/15 text-success"
                : t.status === "failed"
                  ? "bg-accent-red/10 text-accent-red"
                  : "bg-warning/15 text-warning"
            }`}
          >
            {building ? <Spinner className="h-3 w-3" /> : <Icon name={t.status === "ready" ? "check" : "alert"} className="h-3 w-3" />}
            {TEMPLATE_STATUS_LABEL[t.status]}
            {t.status === "analyzing" && t.progress != null && <span className="tabular-nums">{t.progress}%</span>}
          </span>
        </p>
        {t.status === "ready" && t.summary?.tom && <p className="mt-1.5 line-clamp-3 text-xs text-text-secondary">{t.summary.tom}</p>}
        {building && (
          <p className="mt-1.5 text-xs text-text-secondary">
            {t.status === "queued"
              ? "Esperando o servidor de render."
              : t.sourceUrl && (t.progress ?? 0) < 8
                ? "Baixando o vídeo do link."
                : "Analisando o vídeo e gerando o exemplo de 5s."}
          </p>
        )}
        {t.status === "failed" && t.error && <p className="mt-1.5 line-clamp-3 text-xs text-accent-red [overflow-wrap:anywhere]">{t.error}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-text-secondary">
          <a href={t.referenceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-accent-yellow hover:underline">
            {t.sourceUrl ? (/pin(terest)?\./i.test(t.sourceUrl) ? "Ver no Pinterest" : "Ver no YouTube") : "Ver referência"}
          </a>
          {t.costSummary && t.costSummary.totalUsd > 0 && <span>≈ {formatUsd(t.costSummary.totalUsd)}</span>}
        </div>
        {t.status === "ready" && (
          <Link href={`/videogen?estilo=${t.id}`} className={`mt-2 ${secondaryButton} min-h-10 text-xs`}>
            Criar vídeo neste estilo
          </Link>
        )}
        {t.status === "failed" && (
          <button type="button" onClick={onRetry} disabled={busy} className={`mt-2 ${dangerButton} min-h-10 justify-start px-0 text-xs`}>
            <Icon name="refresh" className="h-3.5 w-3.5" /> Tentar de novo
          </button>
        )}
      </div>
    </article>
  );
}

"use client";

// Detalhe de um template: exemplo atual, versões, pedir alteração à IA e aprovar.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatUsd } from "@/components/videogen/CostPanel";
import { AutoTextarea, Icon, Spinner, dangerButton, fieldClass, iconButton, primaryButton, secondaryButton } from "@/components/videogen/ui";
import type { VideoTemplateDTO } from "@/lib/videogen/templates";
import { BRAND_ASSET_KINDS, TEMPLATE_STATUS_LABEL, type BrandAssetKind } from "@/lib/videogen/types";

const KIND_LABEL: Record<BrandAssetKind, string> = {
  logos: "Logos",
  guides: "Guia",
  fonts: "Fontes",
  sfx: "Efeitos",
  music: "Trilha",
  images: "Imagens",
};

const REVISION_EXAMPLES = [
  "Deixe tudo mais rápido e energético",
  "Troque a fonte da legenda pela da marca",
  "Fundo mais claro, com a cor principal da marca",
  "Tire a marca d'água",
];

export function TemplateDetail({
  t,
  onClose,
  onChange,
  onRetry,
}: {
  t: VideoTemplateDTO;
  onClose: () => void;
  onChange: (t: VideoTemplateDTO) => void;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState<"revise" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null); // versão aberta (null = atual)
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const building = t.status === "queued" || t.status === "analyzing";
  const versions = t.revisions;
  const current = viewing !== null ? versions[viewing] : null;
  const videoUrl = current?.sampleUrl ?? t.sampleUrl;
  const canRevise = Boolean(t.sampleUrl) && (t.status === "review" || t.status === "ready" || t.status === "failed");

  async function call(kind: "revise" | "approve", e?: FormEvent) {
    e?.preventDefault();
    if (kind === "revise" && !request.trim()) {
      setError("Escreva o que você quer mudar.");
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/videogen/templates/${t.id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "revise" ? { request } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não deu certo.");
      onChange(data.template);
      if (kind === "revise") {
        setRequest("");
        setViewing(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(null);
    }
  }

  const assets = t.brandAssets;
  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="tpl-detail-title"
      className="m-auto w-[min(920px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 id="tpl-detail-title" className="truncate text-lg font-semibold">
            {t.name}
          </h2>
          <p className="text-xs text-text-secondary">
            {t.origin === "brand" ? "Template da marca" : "Template de vídeo de referência"} · {TEMPLATE_STATUS_LABEL[t.status]}
            {t.costSummary && t.costSummary.totalUsd > 0 && <> · ≈ {formatUsd(t.costSummary.totalUsd)} até agora</>}
          </p>
        </div>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className={iconButton}>
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      <div className="grid max-h-[80vh] gap-5 overflow-y-auto px-5 py-5 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl bg-black">
            {videoUrl ? (
              <video key={videoUrl} src={videoUrl} controls autoPlay loop playsInline className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-white/60">
                {building ? <Spinner className="h-6 w-6" /> : <Icon name="film" className="h-6 w-6" />}
              </span>
            )}
            {building && t.sampleUrl && viewing === null && (
              <span className="absolute inset-x-2 top-2 rounded-md bg-black/70 px-2 py-1 text-center text-[11px] text-white">
                Versão anterior · a nova está sendo montada
              </span>
            )}
          </div>
          {versions.length > 1 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-text-secondary">Versões</p>
              <ol className="mt-1.5 space-y-1">
                {versions.map((v, i) => {
                  const isCurrent = i === versions.length - 1;
                  const active = viewing === i || (viewing === null && isCurrent && !building);
                  return (
                    <li key={`${v.at}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setViewing(isCurrent ? null : i)}
                        disabled={!v.sampleUrl}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                          active ? "border-foreground bg-surface-2" : "border-border hover:border-border-hover"
                        }`}
                      >
                        <span className="font-semibold">V{i + 1}</span>
                        {isCurrent && <span className="text-text-secondary"> · atual</span>}
                        <span className="mt-0.5 block line-clamp-2 text-text-secondary">{v.request ?? "Primeira versão"}</span>
                        {v.note && active && <span className="mt-1 block text-[11px] italic text-text-secondary">IA: {v.note}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {building && (
            <div className="flex gap-3 rounded-xl bg-warning/10 px-4 py-3 text-sm" role="status">
              <Spinner className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">
                  {t.status === "queued" ? "Na fila do servidor de render" : `Montando${t.progress != null ? ` · ${t.progress}%` : ""}`}
                </p>
                <p className="mt-0.5 text-xs text-text-secondary [overflow-wrap:anywhere]">
                  {t.revisionRequest
                    ? `Aplicando: "${t.revisionRequest}"`
                    : t.origin === "brand"
                      ? "A IA está estudando o material e o exemplo de 8s está sendo renderizado. Leva de 2 a 5 minutos."
                      : "Analisando o vídeo e gerando o exemplo."}
                </p>
              </div>
            </div>
          )}

          {t.status === "failed" && (
            <div role="alert" className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
              <p className="font-medium">A montagem falhou</p>
              {t.error && <p className="mt-0.5 text-xs [overflow-wrap:anywhere]">{t.error}</p>}
              <button type="button" onClick={onRetry} className={`mt-1 ${dangerButton} min-h-9 px-0 text-xs`}>
                <Icon name="refresh" className="h-3.5 w-3.5" /> Tentar de novo
              </button>
            </div>
          )}

          {t.status === "review" && (
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <p className="text-sm font-semibold">Gostou do exemplo?</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Aprovado, o template aparece no seletor de estilo dos vídeos novos. Se algo não ficou como você queria, peça o ajuste abaixo.
              </p>
              <button type="button" onClick={() => call("approve")} disabled={busy !== null} className={`mt-3 ${primaryButton}`}>
                {busy === "approve" ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
                Aprovar template
              </button>
            </div>
          )}

          {t.status === "ready" && (
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/videogen?estilo=${t.id}`} className={primaryButton}>
                <Icon name="film" className="h-4 w-4" /> Criar vídeo neste estilo
              </Link>
              <span className="text-xs text-text-secondary">Ainda dá para pedir ajustes: o novo exemplo volta para aprovação.</span>
            </div>
          )}

          {canRevise && (
            <form onSubmit={(e) => call("revise", e)} className="space-y-2">
              <label htmlFor="tpl-revise" className="block text-sm font-semibold">
                Pedir alteração
              </label>
              <AutoTextarea
                id="tpl-revise"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) call("revise");
                }}
                maxLength={2000}
                minRows={3}
                disabled={busy !== null}
                placeholder="Ex.: a legenda está pequena, aumente; troque o fundo para a cor creme do guia; transições mais rápidas."
                className={fieldClass}
              />
              <div className="flex flex-wrap gap-1.5">
                {REVISION_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setRequest((r) => (r.trim() ? `${r.trim()}. ${ex}` : ex))}
                    className="min-h-8 rounded-full border border-border px-3 text-xs text-text-secondary transition hover:border-accent-yellow hover:text-foreground"
                  >
                    + {ex}
                  </button>
                ))}
              </div>
              <button type="submit" disabled={busy !== null || !request.trim()} className={secondaryButton}>
                {busy === "revise" ? <Spinner className="h-4 w-4" /> : <Icon name="sparkles" className="h-4 w-4" />}
                Gerar nova versão
              </button>
              <p className="text-xs text-text-secondary">A IA muda só o que você pediu e renderiza outro exemplo (2 a 5 minutos).</p>
            </form>
          )}

          {error && (
            <div role="alert" className="flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
            </div>
          )}

          {(t.brief || assets) && (
            <div className="space-y-2 border-t border-border pt-4">
              {t.brief && (
                <div>
                  <p className="text-xs font-medium text-text-secondary">Ideia do template</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{t.brief}</p>
                </div>
              )}
              {assets && (
                <div>
                  <p className="text-xs font-medium text-text-secondary">Material enviado</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {BRAND_ASSET_KINDS.flatMap((k) =>
                      (assets[k] ?? []).map((f, i) => (
                        <li key={`${k}-${i}`}>
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs hover:text-accent-yellow"
                            title={f.name}
                          >
                            <span className="font-semibold">{KIND_LABEL[k]}:</span>
                            <span className="truncate">{f.name}</span>
                          </a>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {t.guide && (
            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowGuide((s) => !s)}
                aria-expanded={showGuide}
                className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold hover:text-accent-yellow"
              >
                <Icon name={showGuide ? "down" : "next"} className="h-3.5 w-3.5" /> Guia do estilo (vai para o roteirista)
              </button>
              {showGuide && (
                <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-xs leading-relaxed text-text-secondary">
                  {t.guide}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </dialog>,
    document.body
  );
}

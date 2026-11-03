"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AutoTextarea, Icon, Spinner, fieldClass, iconButton, primaryButton, secondaryButton } from "./ui";
import { formatUsd } from "./CostPanel";

interface Source {
  url: string;
  title: string;
}

const MAX_REQUEST = 1000;

/**
 * "Criar com IA" do campo Tema: o usuário escreve um pedido solto ("me fale das últimas notícias de X") e a IA
 * devolve um tema pronto (título, ângulo e pontos do vídeo), pesquisando na web quando marcado.
 */
export function TopicAiModal({
  durationS,
  onUse,
  onClose,
}: {
  durationS: number;
  onUse: (topic: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState("");
  const [web, setWeb] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [usd, setUsd] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function create(e?: FormEvent) {
    e?.preventDefault();
    if (!request.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/videogen/topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, web, durationS }),
      });
      const data = (await res.json().catch(() => ({}))) as { topic?: string; sources?: Source[]; usd?: number; error?: string };
      if (!res.ok || !data.topic) throw new Error(data.error || "Não foi possível criar o tema.");
      setTopic(data.topic);
      setSources(data.sources ?? []);
      setUsd((u) => u + (data.usd ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  // portal no body: o campo Tema fica dentro do formulário da página, e form dentro de form enviaria o de fora
  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !loading && ref.current?.close()}
      aria-labelledby="topic-ai-title"
      className="m-auto w-[min(680px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="topic-ai-title" className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="sparkles" className="h-4 w-4 text-accent-yellow" /> Criar tema com IA
        </h2>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className={iconButton}>
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={create} className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <label htmlFor="topic-ai-request" className="text-sm font-medium">
            O que você quer no vídeo?
          </label>
          <AutoTextarea
            id="topic-ai-request"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) create();
            }}
            maxLength={MAX_REQUEST}
            minRows={3}
            autoFocus
            placeholder="Ex.: me fale sobre as últimas notícias das eleições americanas"
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} className="h-4 w-4 accent-[var(--accent-yellow)]" />
            Pesquisar na web (notícias e fatos recentes)
          </label>
          <button type="submit" disabled={loading || !request.trim()} className={topic ? secondaryButton : primaryButton}>
            {loading ? <Spinner className="h-4 w-4" /> : <Icon name="sparkles" className="h-4 w-4" />}
            {loading ? (web ? "Pesquisando e escrevendo…" : "Escrevendo…") : topic ? "Gerar de novo" : "Criar tema"}
          </button>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
            {error}
          </p>
        )}
        {topic && (
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <label htmlFor="topic-ai-result" className="text-sm font-medium">
                Tema sugerido <span className="font-normal text-text-secondary">(dá para editar antes de usar)</span>
              </label>
              <AutoTextarea
                id="topic-ai-result"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={2000}
                minRows={6}
                className={`mt-1.5 ${fieldClass}`}
              />
            </div>
            {sources.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Fontes consultadas</p>
                <ul className="mt-1.5 space-y-1">
                  {sources.map((s) => (
                    <li key={s.url} className="truncate text-xs">
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-text-secondary underline-offset-2 hover:text-foreground hover:underline">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-text-secondary">{usd > 0 && `≈ ${formatUsd(usd)}`}</span>
              <button
                type="button"
                onClick={() => {
                  onUse(topic.trim());
                  ref.current?.close();
                }}
                disabled={!topic.trim()}
                className={primaryButton}
              >
                <Icon name="check" className="h-4 w-4" /> Usar este tema
              </button>
            </div>
          </div>
        )}
      </form>
    </dialog>,
    document.body
  );
}

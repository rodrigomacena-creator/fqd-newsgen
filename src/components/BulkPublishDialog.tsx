"use client";

import { useEffect, useRef, useState } from "react";

interface WordPressCategory {
  id: number;
  name: string;
}

export interface BulkPublishItem {
  id: string;
  title: string;
}

type ItemStatus = "pending" | "sending" | "done" | "error";

// Pausa entre um envio e o próximo: o WordPress baixa/reenvia a thumbnail a cada post,
// então espaçar evita rajada de requisições no servidor e no site.
const PAUSE_BETWEEN_MS = 800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envia várias notícias para o Portal em fila: uma por vez, em sequência, usando a mesma
 * rota do botão individual. Só 1 requisição fica em andamento, então o consumo do servidor
 * é o de um envio comum, independente de quantas notícias foram selecionadas.
 */
export function BulkPublishDialog({
  items,
  skipped,
  onClose,
  onFinished,
}: {
  items: BulkPublishItem[];
  skipped: number;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [categories, setCategories] = useState<WordPressCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [programCategoryId, setProgramCategoryId] = useState("");
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const cancelRef = useRef(false);

  const loadingCategories = categories.length === 0 && !categoriesError;

  useEffect(() => {
    fetch("/api/wordpress/categories")
      .then((res) => res.json())
      .then((data: { categories?: WordPressCategory[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setCategories(data.categories ?? []);
      })
      .catch((err) =>
        setCategoriesError(err instanceof Error ? err.message : "Erro ao carregar categorias.")
      );
  }, []);

  const statusOf = (id: string): ItemStatus => statuses[id] ?? "pending";
  const doneCount = items.filter((i) => statusOf(i.id) === "done").length;
  const errorCount = items.filter((i) => statusOf(i.id) === "error").length;
  const processed = doneCount + errorCount;

  async function run() {
    if (!categoryId || running) return;
    // Na 1ª rodada envia todos; nas seguintes ("tentar de novo") só os que falharam.
    const queue = items.filter((i) => statusOf(i.id) !== "done");

    cancelRef.current = false;
    setRunning(true);
    setStarted(true);
    setErrors({});
    setStatuses((prev) => {
      const next = { ...prev };
      for (const item of queue) next[item.id] = "pending";
      return next;
    });

    for (let i = 0; i < queue.length; i++) {
      if (cancelRef.current) break;
      const item = queue[i];
      setStatuses((prev) => ({ ...prev, [item.id]: "sending" }));

      try {
        const res = await fetch(`/api/articles/${item.id}/publish-wordpress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: Number(categoryId),
            programCategoryId: programCategoryId ? Number(programCategoryId) : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Não foi possível publicar no WordPress.");
        setStatuses((prev) => ({ ...prev, [item.id]: "done" }));
      } catch (err) {
        setStatuses((prev) => ({ ...prev, [item.id]: "error" }));
        setErrors((prev) => ({
          ...prev,
          [item.id]: err instanceof Error ? err.message : "Erro inesperado.",
        }));
      }

      if (i < queue.length - 1 && !cancelRef.current) await sleep(PAUSE_BETWEEN_MS);
    }

    setRunning(false);
    onFinished();
  }

  function close() {
    if (running) return;
    onClose();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !running) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [running, onClose]);

  const finished = started && !running;
  const pct = items.length === 0 ? 0 : Math.round((processed / items.length) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enviar notícias para o Portal"
      onClick={close}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface p-6"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Enviar para o portal FQDTV
          </h3>
          <button
            type="button"
            onClick={close}
            disabled={running}
            aria-label="Fechar"
            className="text-xl leading-none text-text-secondary transition hover:text-foreground disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm text-text-secondary">
          {items.length} {items.length === 1 ? "notícia será enviada" : "notícias serão enviadas"} como
          rascunho, uma de cada vez (fila), com a mesma categoria. Você revisa e publica no WordPress.
          {skipped > 0 &&
            ` ${skipped} selecionada${skipped > 1 ? "s" : ""} ficou de fora (já enviada${skipped > 1 ? "s" : ""} ou sem matéria de Portal).`}
        </p>

        {categoriesError && (
          <p className="mt-4 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {categoriesError}
          </p>
        )}

        {!started && (
          <>
            <div className="mt-4">
              <label htmlFor="bulk-category" className="block text-sm font-medium">
                Categoria
              </label>
              <select
                id="bulk-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={loadingCategories}
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-yellow disabled:opacity-50"
              >
                <option value="" className="bg-background text-foreground">
                  {loadingCategories ? "Carregando…" : "Selecione…"}
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-background text-foreground">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label htmlFor="bulk-program" className="block text-sm font-medium">
                Programa <span className="font-normal text-text-secondary">(opcional)</span>
              </label>
              <select
                id="bulk-program"
                value={programCategoryId}
                onChange={(e) => setProgramCategoryId(e.target.value)}
                disabled={loadingCategories}
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-yellow disabled:opacity-50"
              >
                <option value="" className="bg-background text-foreground">
                  Nenhum
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-background text-foreground">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {started && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span>
                {processed} de {items.length} processada{processed === 1 ? "" : "s"}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent-yellow transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>

            <ul className="mt-4 max-h-56 space-y-1.5 overflow-y-auto text-sm">
              {items.map((item) => {
                const status = statusOf(item.id);
                return (
                  <li key={item.id} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 w-4 shrink-0 text-center ${
                        status === "done"
                          ? "text-green-600"
                          : status === "error"
                            ? "text-accent-red"
                            : "text-text-secondary"
                      }`}
                      aria-hidden
                    >
                      {status === "done" ? "✓" : status === "error" ? "✕" : status === "sending" ? "…" : "·"}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-1">{item.title}</span>
                      {status === "error" && (
                        <span className="block text-xs text-accent-red">{errors[item.id]}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            {finished && (
              <p className="mt-4 rounded-lg bg-surface-2 px-4 py-3 text-sm">
                {errorCount === 0
                  ? `${doneCount} notícia${doneCount === 1 ? " enviada" : "s enviadas"} com sucesso como rascunho.`
                  : `${doneCount} enviada${doneCount === 1 ? "" : "s"}, ${errorCount} com erro.`}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => (cancelRef.current = true)}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary transition hover:border-accent-red hover:text-accent-red"
            >
              Parar após o atual
            </button>
          ) : finished ? (
            <>
              {errorCount > 0 && (
                <button
                  type="button"
                  onClick={run}
                  className="w-full rounded-lg bg-accent-yellow px-4 py-2.5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90"
                >
                  Tentar de novo ({errorCount})
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition hover:border-accent-yellow"
              >
                Fechar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={!categoryId || items.length === 0}
              className="w-full rounded-lg bg-accent-yellow px-4 py-2.5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enviar {items.length} como rascunho
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

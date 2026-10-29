"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { DeleteArticleButton } from "./DeleteArticleButton";
import { BulkPublishDialog, type BulkPublishItem } from "./BulkPublishDialog";

export interface HistoryItem {
  id: string;
  title: string;
  subtitle: string;
  coverImage: string | null;
  sentToPortal: boolean;
  hasPortal: boolean;
  dateLabel: string;
}

const PAGE_SIZE_OPTIONS = [10, 50, 100];

export function HistoryList({
  items,
  total,
  page,
  pageSize,
  totalPages,
}: {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  // Fila congelada ao abrir o diálogo: o router.refresh() ao final de cada rodada muda
  // sentToPortal na lista e não pode alterar os itens que o diálogo está processando.
  const [publishQueue, setPublishQueue] = useState<{ items: BulkPublishItem[]; skipped: number } | null>(null);

  // Só entram na fila as que têm matéria de Portal e ainda não foram enviadas.
  const selectedItems = items.filter((item) => selected.has(item.id));
  const publishable = selectedItems.filter((item) => item.hasPortal && !item.sentToPortal);

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const someSelected = items.some((item) => selected.has(item.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));
  }

  function goTo(next: { page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    params.set("page", String(next.page ?? page));
    params.set("pageSize", String(next.pageSize ?? pageSize));
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleBulkDelete() {
    if (selected.size === 0 || deleting) return;
    if (
      !confirm(
        `Excluir ${selected.size} notícia${selected.size > 1 ? "s" : ""} selecionada${selected.size > 1 ? "s" : ""}? Essa ação não pode ser desfeita.`
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/articles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível excluir as notícias selecionadas.");
      }

      setSelected(new Set());
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mt-8 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={toggleAll}
            className="h-4 w-4 accent-accent-yellow"
          />
          Selecionar todas nesta página
        </label>

        {someSelected && (
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setPublishQueue({
                items: publishable.map((item) => ({ id: item.id, title: item.title })),
                skipped: selectedItems.length - publishable.length,
              })
            }
            disabled={deleting || publishable.length === 0}
            title={
              publishable.length === 0
                ? "Nenhuma das selecionadas está disponível para envio (já enviadas ou sem matéria de Portal)."
                : undefined
            }
            className="rounded-lg bg-accent-red px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-red-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar para o portal FQDTV ({publishable.length})
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={deleting}
            className="rounded-lg border border-accent-red px-4 py-2 text-xs font-semibold text-accent-red transition hover:bg-accent-red/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Excluindo…" : `Excluir selecionadas (${selected.size})`}
          </button>
          </div>
        )}
      </div>

      {publishQueue && (
        <BulkPublishDialog
          items={publishQueue.items}
          skipped={publishQueue.skipped}
          onClose={() => {
            setPublishQueue(null);
            setSelected(new Set());
          }}
          onFinished={() => router.refresh()}
        />
      )}

      <ul className="mt-3 space-y-2">
        {items.map((article) => (
          <li
            key={article.id}
            className={`relative flex items-center gap-4 overflow-hidden rounded-2xl border p-3 transition ${
              selected.has(article.id)
                ? "border-accent-yellow/50 bg-accent-yellow/5"
                : "border-border bg-surface"
            }`}
          >
            {article.sentToPortal && (
              <span
                title="Já enviada ao Portal"
                aria-label="Já enviada ao Portal"
                className="absolute inset-y-0 left-0 w-1.5 bg-green-500"
              />
            )}
            <input
              type="checkbox"
              checked={selected.has(article.id)}
              onChange={() => toggle(article.id)}
              aria-label={`Selecionar ${article.title}`}
              className="h-4 w-4 shrink-0 accent-accent-yellow"
            />

            <div className="relative flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
              {article.coverImage ? (
                <Image
                  src={article.coverImage}
                  alt={article.title}
                  fill
                  sizes="112px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-6 w-6 text-text-secondary/40"
                  aria-hidden
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M4 16.5l5-5 3.5 3.5L16 11l4 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <Link
                href={`/noticia/${article.id}`}
                className="line-clamp-1 font-semibold hover:text-accent-yellow"
              >
                {article.title}
              </Link>
              <p className="mt-1 line-clamp-1 text-sm text-text-secondary">{article.subtitle}</p>
              <p className="mt-1 text-xs text-text-secondary/70">
                {article.dateLabel}
                {article.sentToPortal && (
                  <span className="ml-2 font-semibold text-green-600">· Enviada ao Portal</span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <Link
                href={`/noticia/${article.id}`}
                className="text-sm font-medium hover:text-accent-yellow hover:underline"
              >
                Ver
              </Link>
              <DeleteArticleButton articleId={article.id} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 text-sm">
        <div className="flex items-center gap-2 text-text-secondary">
          <span>Mostrar</span>
          <select
            value={pageSize}
            onChange={(e) => goTo({ pageSize: Number(e.target.value), page: 1 })}
            className="rounded-lg border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-accent-yellow"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size} className="bg-background text-foreground">
                {size}
              </option>
            ))}
          </select>
          <span>de {total}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goTo({ page: page - 1 })}
            disabled={page <= 1}
            className="rounded-lg border border-border px-3 py-1.5 text-text-secondary transition hover:border-accent-yellow hover:text-accent-yellow disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-text-secondary">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goTo({ page: page + 1 })}
            disabled={page >= totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-text-secondary transition hover:border-accent-yellow hover:text-accent-yellow disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}

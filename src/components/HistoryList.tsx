"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { DeleteArticleButton } from "./DeleteArticleButton";

export interface HistoryItem {
  id: string;
  title: string;
  subtitle: string;
  coverImage: string | null;
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
      <div className="mt-6 flex items-center justify-between">
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
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={deleting}
            className="rounded-lg border border-accent-red px-4 py-2 text-xs font-semibold text-accent-red transition hover:bg-accent-red/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Excluindo…" : `Excluir selecionadas (${selected.size})`}
          </button>
        )}
      </div>

      <ul className="mt-3 divide-y divide-border">
        {items.map((article) => (
          <li key={article.id} className="flex items-center gap-4 py-5">
            <input
              type="checkbox"
              checked={selected.has(article.id)}
              onChange={() => toggle(article.id)}
              aria-label={`Selecionar ${article.title}`}
              className="h-4 w-4 shrink-0 accent-accent-yellow"
            />

            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
              {article.coverImage && (
                <Image
                  src={article.coverImage}
                  alt={article.title}
                  fill
                  sizes="112px"
                  className="object-cover"
                  unoptimized
                />
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
              <p className="mt-1 text-xs text-text-secondary/70">{article.dateLabel}</p>
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

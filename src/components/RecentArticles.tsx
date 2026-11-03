"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ArticleListItem } from "@/lib/articleListing";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Suas notícias" na home do NewsGen: as últimas geradas, com link pro histórico completo. */
export function RecentArticles({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<{ articles: ArticleListItem[]; total: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/articles?take=6")
      .then((res) => res.json())
      .then((d) => !cancelled && setData({ articles: d.articles ?? [], total: d.total ?? 0 }))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <aside id="suas-noticias" className="min-w-0 scroll-mt-24" aria-labelledby="suas-noticias-title">
      <h2 id="suas-noticias-title" className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
        Suas notícias
      </h2>
      {error ? (
        <p className="mt-3 text-sm text-text-secondary">Não foi possível carregar as notícias.</p>
      ) : data === null ? (
        <div className="mt-3 space-y-2" aria-label="Carregando">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none" />
          ))}
        </div>
      ) : data.articles.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-sm font-medium">Nenhuma notícia ainda</p>
          <p className="mt-1 text-xs text-text-secondary">Cole um link ao lado e gere a primeira.</p>
        </div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {data.articles.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/noticia/${a.id}`}
                  className="flex items-center gap-3 px-3 py-3 transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 ring-1 ring-border">
                    {a.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.coverImage} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-1 text-center text-[10px] leading-tight text-text-secondary">sem imagem</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium" title={a.title}>
                      {a.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-text-secondary">
                      <span>{[a.hasPortal && "Portal", a.hasInstagram && "Instagram"].filter(Boolean).join(" + ")}</span>
                      {a.sentToPortal && <span className="font-medium text-success">no WordPress</span>}
                      <span>{formatDate(a.createdAt)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/noticias"
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition hover:border-accent-yellow hover:text-accent-yellow"
          >
            Ver histórico completo ({data.total})
          </Link>
        </>
      )}
    </aside>
  );
}

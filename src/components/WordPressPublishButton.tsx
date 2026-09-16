"use client";

import { useEffect, useState } from "react";

interface WordPressCategory {
  id: number;
  name: string;
}

export function WordPressPublishButton({
  articleId,
  initialWordpressUrl,
}: {
  articleId: string;
  initialWordpressUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<WordPressCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [programCategoryId, setProgramCategoryId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [wordpressUrl, setWordpressUrl] = useState(initialWordpressUrl);

  const loadingCategories = open && categories.length === 0 && !categoriesError;

  useEffect(() => {
    if (!open || categories.length > 0) return;
    fetch("/api/wordpress/categories")
      .then((res) => res.json())
      .then((data: { categories?: WordPressCategory[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setCategories(data.categories ?? []);
      })
      .catch((err) =>
        setCategoriesError(err instanceof Error ? err.message : "Erro ao carregar categorias.")
      );
  }, [open, categories.length]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function handlePublish() {
    if (!categoryId || publishing) return;

    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/publish-wordpress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(categoryId),
          programCategoryId: programCategoryId ? Number(programCategoryId) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível publicar no WordPress.");

      setWordpressUrl(data.editUrl);
      setOpen(false);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setPublishing(false);
    }
  }

  if (wordpressUrl) {
    return (
      <a
        href={wordpressUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-10 inline-block text-xs font-medium text-text-secondary hover:text-accent-yellow hover:underline"
      >
        Ver rascunho no WordPress ↗
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-10 rounded-lg border border-border px-4 py-2.5 text-xs font-semibold text-foreground transition hover:border-accent-yellow hover:text-accent-yellow"
      >
        Enviar para o Portal (WordPress)
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enviar para o Portal"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Enviar para o Portal
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="text-xl leading-none text-text-secondary transition hover:text-foreground"
              >
                ×
              </button>
            </div>

            <p className="mt-3 text-sm text-text-secondary">
              Cria um rascunho no WordPress com o título, a matéria, o resumo e a
              thumbnail do vídeo. Você revisa e publica por lá.
            </p>

            {categoriesError && (
              <p className="mt-4 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                {categoriesError}
              </p>
            )}

            <div className="mt-4">
              <label htmlFor="wp-category" className="block text-sm font-medium">
                Categoria
              </label>
              <select
                id="wp-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={loadingCategories || publishing}
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
              <label htmlFor="wp-program" className="block text-sm font-medium">
                Programa <span className="font-normal text-text-secondary">(opcional)</span>
              </label>
              <select
                id="wp-program"
                value={programCategoryId}
                onChange={(e) => setProgramCategoryId(e.target.value)}
                disabled={loadingCategories || publishing}
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
              <p className="mt-1 text-xs text-text-secondary">
                Mesma lista de categorias — escolha o programa específico, se houver.
              </p>
            </div>

            <button
              type="button"
              onClick={handlePublish}
              disabled={!categoryId || publishing}
              className="mt-5 w-full rounded-lg bg-accent-yellow px-4 py-2.5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? "Enviando…" : "Enviar como rascunho"}
            </button>

            {publishError && (
              <p className="mt-3 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                {publishError}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

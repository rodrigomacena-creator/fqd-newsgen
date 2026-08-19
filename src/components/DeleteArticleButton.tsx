"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteArticleButton({
  articleId,
  redirectTo,
  className,
}: {
  articleId: string;
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (loading) return;
    if (!confirm("Excluir esta notícia? Essa ação não pode ser desfeita.")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/articles/${articleId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível excluir a notícia.");
      }

      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className={
        className ??
        "text-sm font-medium text-accent-red hover:underline disabled:opacity-50"
      }
    >
      {loading ? "Excluindo…" : "Excluir"}
    </button>
  );
}

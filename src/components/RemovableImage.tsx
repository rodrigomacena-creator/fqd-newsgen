"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export type ImageTarget = "cover" | "instagram" | { section: number };

export function RemovableImage({
  articleId,
  target,
  src,
  alt,
  sizes,
  className,
}: {
  articleId: string;
  target: ImageTarget;
  src: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const router = useRouter();
  const [removed, setRemoved] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (removed) return null;

  async function handleRemove() {
    if (removing) return;
    if (!confirm("Remover esta imagem? Essa ação não pode ser desfeita.")) return;

    setRemoving(true);
    try {
      const removeImage = typeof target === "string" ? target : target.section;
      const res = await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeImage }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível remover a imagem.");
      }

      setRemoved(true);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro inesperado.");
      setRemoving(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Remover imagem"
      title="Clique para remover esta imagem"
      onClick={handleRemove}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRemove();
        }
      }}
      className={`${className ?? ""} group cursor-pointer`}
    >
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" unoptimized />
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/60 group-hover:opacity-100">
        <span className="rounded-lg bg-accent-red px-3 py-1.5 text-xs font-semibold text-white">
          {removing ? "Removendo…" : "Remover imagem"}
        </span>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export type ImageTarget =
  | "cover"
  | "instagram"
  | { section: number }
  | { instagramImage: number };

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
  const [showOverlay, setShowOverlay] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!showModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowModal(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showModal]);

  if (removed) return null;

  async function handleRemove() {
    if (removing) return;
    if (!confirm("Remover esta imagem? Essa ação não pode ser desfeita.")) return;

    setRemoving(true);
    try {
      const removeImage =
        typeof target === "string"
          ? target
          : "section" in target
            ? target.section
            : { instagramImage: target.instagramImage };
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
    <>
      <div
        onMouseEnter={() => setShowOverlay(true)}
        onMouseLeave={() => setShowOverlay(false)}
        onClick={() => setShowOverlay((v) => !v)}
        className={`${className ?? ""} cursor-pointer`}
      >
        <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" unoptimized />
        <div
          className={`absolute inset-0 flex items-center justify-center gap-2 bg-black/60 transition ${
            showOverlay ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowModal(true);
            }}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90"
          >
            Ver imagem
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            disabled={removing}
            className="rounded-lg bg-accent-red px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-red/90 disabled:opacity-60"
          >
            {removing ? "Removendo…" : "Remover"}
          </button>
        </div>
      </div>

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setShowModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setShowModal(false)}
            aria-label="Fechar"
            className="absolute right-4 top-4 text-3xl leading-none text-white/80 transition hover:text-white"
          >
            ×
          </button>
          {/* Fullscreen preview: tamanho real desconhecido de antemão, então usa
              <img> simples em vez de next/image (que exige dimensões fixas). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";

interface SourceRef {
  type: "youtube" | "webpage";
  url: string;
  title: string;
}

export function GenerationParamsModal({
  sources,
  subtitleCount,
  paragraphCount,
  photoCount,
  extraInstructions,
  profileName,
  textModel,
  imageModel,
  instagramImageModel,
}: {
  sources: SourceRef[];
  subtitleCount: number | null;
  paragraphCount: number | null;
  photoCount: number | null;
  extraInstructions: string | null;
  profileName: string | null;
  textModel: string;
  imageModel: string;
  instagramImageModel: string | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-10 text-xs font-medium text-text-secondary hover:text-accent-yellow hover:underline"
      >
        Exibir parâmetros de entrada
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Parâmetros de entrada"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Parâmetros de entrada
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

            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-text-secondary">
                  Fontes ({sources.length})
                </dt>
                <dd className="mt-1.5 space-y-1.5">
                  {sources.map((source, index) => (
                    <a
                      key={index}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      title={source.url}
                      className="block truncate text-foreground underline hover:text-accent-yellow"
                    >
                      {source.type === "youtube" ? "YouTube" : "Página"} — {source.title}
                    </a>
                  ))}
                </dd>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-xs font-medium text-text-secondary">Subtítulos</dt>
                  <dd className="mt-1">{subtitleCount ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-text-secondary">Parágrafos</dt>
                  <dd className="mt-1">{paragraphCount ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-text-secondary">Fotos</dt>
                  <dd className="mt-1">{photoCount ?? "—"}</dd>
                </div>
              </div>

              <div>
                <dt className="text-xs font-medium text-text-secondary">
                  Instruções adicionais
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-foreground/80">
                  {extraInstructions || "Nenhuma"}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-text-secondary">
                  Perfil de comunicação
                </dt>
                <dd className="mt-1">{profileName ?? "Padrão (neutro)"}</dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-text-secondary">Modelos de IA</dt>
                <dd className="mt-1">
                  Texto: {textModel}
                  <br />
                  Imagem (Portal): {imageModel}
                  {instagramImageModel && (
                    <>
                      <br />
                      Imagem (Instagram): {instagramImageModel}
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}

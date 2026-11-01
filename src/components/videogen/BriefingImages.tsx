"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Icon, Spinner, fieldClass, iconButton } from "./ui";
import { imageProblem, uploadImage, MAX_IMAGE_MB } from "@/lib/videogen/uploadImage";
import { MAX_BRIEFING_IMAGES, type BriefingImage } from "@/lib/videogen/types";

/**
 * Imagens do briefing: arrastar/escolher, ver miniatura, escrever uma observação e remover.
 * As imagens sobem na hora pro Vercel Blob; o pai só guarda a lista de URLs.
 */
export function BriefingImages({
  images,
  onChange,
  disabled,
  onBusyChange,
}: {
  images: BriefingImage[];
  onChange: (images: BriefingImage[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(images); // uploads paralelos somam na lista mais recente
  useEffect(() => {
    latest.current = images;
  });

  const room = MAX_BRIEFING_IMAGES - images.length - uploading;

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    setError(null);
    const problems = files.map(imageProblem).filter(Boolean) as string[];
    const ok = files.filter((f) => !imageProblem(f)).slice(0, Math.max(room, 0));
    if (files.length - problems.length > ok.length) problems.push(`Máximo de ${MAX_BRIEFING_IMAGES} imagens por vídeo.`);
    if (problems.length) setError(problems.join(" "));
    if (!ok.length) return;
    setUploading((n) => n + ok.length);
    onBusyChange?.(true);
    await Promise.all(
      ok.map(async (file) => {
        try {
          const url = await uploadImage(file, "briefing");
          latest.current = [...latest.current, { url }];
          onChange(latest.current);
        } catch (err) {
          setError(err instanceof Error ? err.message : `Falha ao enviar "${file.name}".`);
        } finally {
          setUploading((n) => {
            if (n - 1 === 0) onBusyChange?.(false);
            return n - 1;
          });
        }
      })
    );
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!disabled && e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  }

  return (
    <div>
      {images.length > 0 && (
        <ul className="mb-3 grid gap-3 sm:grid-cols-2">
          {images.map((img, i) => (
            <li key={img.url} className="flex gap-3 rounded-xl border border-border bg-background p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.note || `Imagem ${i + 1} do briefing`} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-text-secondary">Imagem {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => onChange(images.filter((x) => x.url !== img.url))}
                    disabled={disabled}
                    aria-label={`Remover imagem ${i + 1}`}
                    className={`-mr-1 -mt-1 h-8 w-8 ${iconButton}`}
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
                <label htmlFor={`briefing-note-${i}`} className="sr-only">
                  Observação da imagem {i + 1}
                </label>
                <input
                  id={`briefing-note-${i}`}
                  value={img.note ?? ""}
                  maxLength={300}
                  onChange={(e) => onChange(images.map((x) => (x.url === img.url ? { ...x, note: e.target.value } : x)))}
                  disabled={disabled}
                  placeholder="O que é? (opcional)"
                  className={`mt-1 !py-1.5 text-xs ${fieldClass}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {room > 0 || uploading > 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
            dragging ? "border-accent-yellow bg-accent-yellow/5" : "border-border"
          }`}
        >
          {uploading > 0 ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary" aria-live="polite">
              <Spinner className="h-4 w-4" /> Enviando {uploading} {uploading === 1 ? "imagem" : "imagens"}…
            </p>
          ) : (
            <>
              <Icon name="image" className="h-6 w-6 text-text-secondary" />
              <p className="text-sm">
                Arraste fotos aqui ou{" "}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled}
                  className="font-semibold text-accent-yellow underline-offset-2 hover:underline disabled:opacity-50"
                >
                  escolha do computador
                </button>
              </p>
              <p className="text-xs text-text-secondary">
                JPG, PNG ou WebP até {MAX_IMAGE_MB} MB · até {MAX_BRIEFING_IMAGES} imagens
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-text-secondary">Limite de {MAX_BRIEFING_IMAGES} imagens atingido.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-accent-red">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Icon, Spinner } from "./ui";
import { uploadImage } from "@/lib/videogen/uploadImage";
import { MAX_BRIEFING_IMAGES, type BriefingImage, type VideoScene } from "@/lib/videogen/types";

/** Imagem da cena: gerada pela IA (prompt) ou uma foto do briefing / enviada agora. */
export function SceneImage({
  index,
  scene,
  briefing,
  disabled,
  onPick,
  onAddImage,
}: {
  index: number;
  scene: VideoScene;
  briefing: BriefingImage[];
  disabled: boolean;
  onPick: (url: string | undefined) => void;
  onAddImage: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const n = index + 1;
  const full = briefing.length >= MAX_BRIEFING_IMAGES;

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file, "briefing");
      onAddImage(url);
      onPick(url);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        {scene.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.imageUrl} alt={`Foto usada na cena ${n}`} className="h-16 w-9 shrink-0 rounded-md object-cover ring-1 ring-border" />
        ) : (
          <span aria-hidden className="flex h-16 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-secondary">
            <Icon name="image" className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{scene.imageUrl ? "Sua foto" : "Imagem gerada pela IA"}</p>
          <p className="text-xs text-text-secondary">
            {scene.imageUrl ? "Entra na cena no lugar da imagem gerada." : "Criada no render a partir do prompt abaixo."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={disabled}
            aria-expanded={open}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-accent-yellow transition hover:bg-accent-yellow/10 disabled:opacity-50"
          >
            <Icon name="image" /> {scene.imageUrl ? "Trocar foto" : "Usar foto sua"}
          </button>
          {scene.imageUrl && (
            <button
              type="button"
              onClick={() => onPick(undefined)}
              disabled={disabled}
              className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-medium text-text-secondary transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            >
              Usar imagem da IA
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Escolher foto da cena ${n}`}>
          {briefing.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => {
                onPick(img.url);
                setOpen(false);
              }}
              disabled={disabled}
              aria-pressed={scene.imageUrl === img.url}
              title={img.note || `Imagem ${i + 1}`}
              className={`overflow-hidden rounded-md ring-2 transition ${scene.imageUrl === img.url ? "ring-accent-yellow" : "ring-transparent hover:ring-border-hover"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.note || `Imagem ${i + 1} do briefing`} className="h-20 w-[45px] object-cover" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading || full}
            title={full ? `Limite de ${MAX_BRIEFING_IMAGES} imagens` : "Enviar uma foto nova"}
            className="flex h-20 w-[45px] items-center justify-center rounded-md border-2 border-dashed border-border text-text-secondary transition hover:border-accent-yellow hover:text-accent-yellow disabled:opacity-50"
          >
            {uploading ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />}
            <span className="sr-only">Enviar foto nova</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-accent-red">
          {error}
        </p>
      )}
    </div>
  );
}


"use client";

import { useRef, useState, type ReactNode } from "react";
import { Icon, Spinner } from "./ui";
import { uploadImage } from "@/lib/videogen/uploadImage";
import { MAX_BRIEFING_IMAGES, type BriefingImage, type VideoScene } from "@/lib/videogen/types";

/**
 * Imagem da cena: "Gerar com IA" (mostra o prompt, passado em `prompt`) ou "Usar sua foto"
 * (fotos do briefing ou uma enviada agora).
 */
export function SceneImage({
  index,
  scene,
  briefing,
  disabled,
  onPick,
  onAddImage,
  prompt,
}: {
  index: number;
  scene: VideoScene;
  briefing: BriefingImage[];
  disabled: boolean;
  onPick: (url: string | undefined) => void;
  onAddImage: (url: string) => void;
  /** Campo do prompt da imagem, mostrado no modo "Gerar com IA". */
  prompt: ReactNode;
}) {
  // "photo" sem foto escolhida ainda = mostrando as opções de foto
  const [wantPhoto, setWantPhoto] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const n = index + 1;
  const full = briefing.length >= MAX_BRIEFING_IMAGES;
  const photoMode = Boolean(scene.imageUrl) || wantPhoto;

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file, "briefing");
      onAddImage(url);
      onPick(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  const segment = (active: boolean) =>
    `flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
      active ? "bg-[#2A2A31] text-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
    }`;

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">Imagem da cena</p>
      <div role="radiogroup" aria-label={`Imagem da cena ${n}`} className="mt-2 flex gap-1 rounded-xl border border-[#222228] bg-[#0C0C0E] p-1">
        <button
          type="button"
          role="radio"
          aria-checked={!photoMode}
          disabled={disabled}
          onClick={() => {
            setWantPhoto(false);
            if (scene.imageUrl) onPick(undefined);
          }}
          className={segment(!photoMode)}
        >
          <Icon name="sparkles" /> Gerar com IA
        </button>
        <button type="button" role="radio" aria-checked={photoMode} disabled={disabled} onClick={() => setWantPhoto(true)} className={segment(photoMode)}>
          <Icon name="image" /> Usar sua foto
        </button>
      </div>

      {!photoMode ? (
        <div className="mt-3">{prompt}</div>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-xs text-text-secondary">
            {scene.imageUrl ? "Esta foto entra na cena no lugar da imagem gerada." : "Escolha uma foto do briefing ou envie uma nova."}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Escolher foto da cena ${n}`}>
            {briefing.map((img, i) => (
              <button
                key={img.url}
                type="button"
                onClick={() => onPick(img.url)}
                disabled={disabled}
                aria-pressed={scene.imageUrl === img.url}
                title={img.note || `Imagem ${i + 1}`}
                className={`overflow-hidden rounded-lg ring-2 transition ${scene.imageUrl === img.url ? "ring-[#FF3B3B]" : "ring-transparent hover:ring-border-hover"}`}
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
              className="flex h-20 w-[45px] items-center justify-center rounded-lg border-2 border-dashed border-[#2A2A31] text-text-secondary transition hover:border-[#FF3B3B] hover:text-[#FF3B3B] disabled:opacity-50"
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

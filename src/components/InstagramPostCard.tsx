"use client";

import { useRef, useState } from "react";
import { EditableText } from "./EditableText";
import { RemovableImage } from "./RemovableImage";

export function InstagramPostCard({
  articleId,
  caption,
  imageUrls,
  alt,
}: {
  articleId: string;
  caption: string;
  imageUrls: string[];
  alt: string;
}) {
  const liveCaptionRef = useRef(caption);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(liveCaptionRef.current);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível (ex.: contexto não seguro) — sem ação
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <EditableText
        as="p"
        articleId={articleId}
        target={{ type: "instagramCaption" }}
        initialValue={caption}
        multiline
        className="text-sm leading-relaxed text-foreground/80"
        onLiveChange={(value) => {
          liveCaptionRef.current = value;
        }}
      />

      <button
        type="button"
        onClick={handleCopy}
        className="mt-3 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-accent-yellow hover:text-accent-yellow"
      >
        {copied ? "Legenda copiada!" : "Copiar legenda"}
      </button>

      {imageUrls.length > 0 && (
        <div className="mt-4">
          {imageUrls.length > 1 && (
            <p className="mb-2 text-xs text-text-secondary">
              Carrossel — {imageUrls.length} fotos
            </p>
          )}
          <div className="flex gap-3 overflow-x-auto pb-1">
            {imageUrls.map((url, index) => (
              <RemovableImage
                key={url}
                articleId={articleId}
                target={{ instagramImage: index }}
                src={url}
                alt={`${alt} — foto ${index + 1}`}
                sizes="160px"
                className="relative aspect-square w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

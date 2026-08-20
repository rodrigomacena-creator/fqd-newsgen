"use client";

import { useRef, useState } from "react";
import { EditableText } from "./EditableText";
import { RemovableImage } from "./RemovableImage";

export function InstagramPostCard({
  articleId,
  caption,
  imageUrl,
  alt,
}: {
  articleId: string;
  caption: string;
  imageUrl?: string;
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
    <div className="mt-12">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
        Post sugerido para Instagram
      </h3>

      <div className="mt-3 grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-[220px_1fr]">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface-2">
          {imageUrl && (
            <RemovableImage
              articleId={articleId}
              target="instagram"
              src={imageUrl}
              alt={alt}
              sizes="220px"
              className="absolute inset-0"
            />
          )}
        </div>

        <div className="flex flex-col">
          <EditableText
            as="p"
            articleId={articleId}
            target={{ type: "instagramCaption" }}
            initialValue={caption}
            multiline
            className="flex-1 text-sm leading-relaxed text-foreground/80"
            onLiveChange={(value) => {
              liveCaptionRef.current = value;
            }}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="mt-3 self-start rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-accent-yellow hover:text-accent-yellow"
          >
            {copied ? "Legenda copiada!" : "Copiar legenda"}
          </button>
        </div>
      </div>
    </div>
  );
}

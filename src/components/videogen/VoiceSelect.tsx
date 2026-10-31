"use client";

import { useRef } from "react";
import type { VoiceOption } from "@/lib/videogen/elevenlabs";

const GROUPS: { label: string; match: (v: VoiceOption) => boolean }[] = [
  { label: "Suas vozes clonadas", match: (v) => v.category === "cloned" },
  { label: "Português", match: (v) => v.category !== "cloned" && v.language === "pt" },
  { label: "Outros idiomas", match: (v) => v.category !== "cloned" && v.language !== "pt" },
];

export function VoiceSelect({
  id,
  voices,
  value,
  onChange,
  disabled,
  loading,
  error,
}: {
  id: string;
  voices: VoiceOption[];
  value: string;
  onChange: (voice: VoiceOption) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selected = voices.find((v) => v.id === value);

  function preview() {
    if (!selected?.previewUrl) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(selected.previewUrl);
    void audioRef.current.play();
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const voice = voices.find((v) => v.id === e.target.value);
            if (voice) onChange(voice);
          }}
          disabled={disabled || loading || voices.length === 0}
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-yellow disabled:opacity-50"
        >
          {loading && <option className="bg-background text-foreground">Carregando vozes…</option>}
          {!loading && !selected && value && (
            <option value={value} className="bg-background text-foreground">
              {value}
            </option>
          )}
          {GROUPS.map((group) => {
            const items = voices.filter(group.match);
            if (items.length === 0) return null;
            return (
              <optgroup key={group.label} label={group.label} className="bg-background text-foreground">
                {items.map((v) => (
                  <option key={v.id} value={v.id} className="bg-background text-foreground">
                    {v.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        {selected?.previewUrl && (
          <button
            type="button"
            onClick={preview}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-border px-3 text-sm text-text-secondary transition hover:border-accent-yellow hover:text-accent-yellow disabled:opacity-50"
          >
            Ouvir
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-accent-red">{error}</p>}
    </div>
  );
}

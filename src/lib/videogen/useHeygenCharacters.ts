"use client";

import { useEffect, useState } from "react";
import type { AvatarCharacter, HeygenVoice } from "./types";

/** Avatares, fotos animadas e vozes da conta do HeyGen (GET /api/videogen/avatars). */
export function useHeygenCharacters(enabled = true) {
  const [characters, setCharacters] = useState<AvatarCharacter[]>([]);
  const [voices, setVoices] = useState<HeygenVoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/videogen/avatars")
      .then((res) => res.json())
      .then((data: { characters?: AvatarCharacter[]; voices?: HeygenVoice[]; error?: string }) => {
        if (cancelled) return;
        setCharacters(data.characters ?? []);
        setVoices(data.voices ?? []);
        if (data.error) throw new Error(data.error);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Erro ao carregar os avatares."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { characters, voices, error, loading };
}

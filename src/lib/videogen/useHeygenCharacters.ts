"use client";

import { useEffect, useState } from "react";
import type { AvatarCharacter } from "./types";

/** Avatares e fotos animadas da conta do HeyGen (GET /api/videogen/avatars). */
export function useHeygenCharacters(enabled = true) {
  const [characters, setCharacters] = useState<AvatarCharacter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/videogen/avatars")
      .then((res) => res.json())
      .then((data: { characters?: AvatarCharacter[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setCharacters(data.characters ?? []);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Erro ao carregar os avatares."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { characters, error, loading };
}

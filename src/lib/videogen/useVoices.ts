"use client";

import { useEffect, useState } from "react";
import type { VoiceOption } from "./elevenlabs";

export function useVoices() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/videogen/voices")
      .then((res) => res.json())
      .then((data: { voices?: VoiceOption[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setVoices(data.voices ?? []);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Erro ao carregar vozes."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Põe na lista uma voz recém-criada (a listagem do ElevenLabs pode demorar a mostrar). */
  const addVoice = (v: VoiceOption) => setVoices((list) => (list.some((x) => x.id === v.id) ? list : [v, ...list]));

  return { voices, error, loading, addVoice };
}

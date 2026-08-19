"use client";

import { useCallback, useEffect, useState } from "react";

export interface InstructionProfile {
  id: string;
  name: string;
  prompt: string;
  styleguideFileName?: string | null;
  styleguidePath?: string | null;
  styleguideColors?: string | null;
  styleguideSummary?: string | null;
}

export function useInstructionProfiles() {
  const [profiles, setProfiles] = useState<InstructionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return fetch("/api/profiles")
      .then((res) => res.json())
      .then((data: { profiles?: InstructionProfile[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setProfiles(data.profiles ?? []);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar perfis."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profiles, loading, error, reload };
}

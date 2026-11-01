"use client";

import { useCallback, useEffect, useState } from "react";
import type { VideoProfileDTO } from "./types";

/** Perfis de comunicação (pessoas e empresas) para os seletores do VideoGen. */
export function useProfiles() {
  const [profiles, setProfiles] = useState<VideoProfileDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/videogen/profiles");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar os perfis.");
      setProfiles(data.profiles ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar os perfis.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/videogen/profiles")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setProfiles(data.profiles ?? []);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Erro ao carregar os perfis."))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const people = profiles.filter((p) => p.kind === "person");
  const companies = profiles.filter((p) => p.kind === "company");
  return { profiles, setProfiles, people, companies, loaded, error, reload };
}

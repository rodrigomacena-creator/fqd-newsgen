"use client";

import { useEffect, useState } from "react";
import { VIDEO_PATTERNS, type VideoPattern } from "./patterns";

/**
 * Estilos que geram mp4 (embutidos + templates prontos). Começa com os embutidos, que já vêm
 * no bundle, e completa com os templates quando a API responde.
 */
export function useStyles() {
  const [styles, setStyles] = useState<VideoPattern[]>(VIDEO_PATTERNS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/videogen/styles")
      .then((res) => res.json())
      .then((data: { styles?: VideoPattern[] }) => {
        if (!cancelled && data.styles?.length) setStyles(data.styles);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    styles,
    loaded,
    getStyle: (id: string) => styles.find((s) => s.id === id),
    /** Tira da lista um estilo excluído (template), sem recarregar. */
    removeStyle: (id: string) => setStyles((list) => list.filter((s) => s.id !== id)),
  };
}

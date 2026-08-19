"use client";

import { useEffect, useState } from "react";
import type { ModelPickerOption } from "@/components/ModelPicker";

interface TextModelOption {
  id: string;
  name: string;
  promptPricePerMTok: number;
  completionPricePerMTok: number;
}

interface ImageModelOption {
  id: string;
  name: string;
  description: string;
}

function formatPrice(value: number): string {
  if (value < 0) return "preço variável";
  if (value === 0) return "grátis";
  return `$${value.toFixed(2)}/1M tok`;
}

export function useModelOptions() {
  const [textOptions, setTextOptions] = useState<ModelPickerOption[]>([]);
  const [imageOptions, setImageOptions] = useState<ModelPickerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/models")
      .then((res) => res.json())
      .then((data: { textModels?: TextModelOption[]; imageModels?: ImageModelOption[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);

        setTextOptions(
          (data.textModels ?? []).map((m) => ({
            id: m.id,
            label: `${m.name} — ${formatPrice(m.promptPricePerMTok)} entrada / ${formatPrice(m.completionPricePerMTok)} saída`,
          }))
        );
        setImageOptions(
          (data.imageModels ?? []).map((m) => ({
            id: m.id,
            label: m.name,
          }))
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar modelos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { textOptions, imageOptions, loading, error };
}

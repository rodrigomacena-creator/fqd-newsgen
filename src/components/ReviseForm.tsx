"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ModelPicker } from "./ModelPicker";
import { useModelOptions } from "@/lib/useModelOptions";

export function ReviseForm({
  articleId,
  currentTextModel,
  currentImageModel,
}: {
  articleId: string;
  currentTextModel: string;
  currentImageModel: string;
}) {
  const router = useRouter();
  const { textOptions, imageOptions } = useModelOptions();

  const [instruction, setInstruction] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [textModel, setTextModel] = useState(currentTextModel);
  const [imageModel, setImageModel] = useState(currentImageModel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!instruction.trim() || loading) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/articles/${articleId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, textModel, imageModel }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Não foi possível aplicar o ajuste.");
      }

      setInstruction("");
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-12 rounded-xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
        Pedir ajuste à IA
      </h3>
      <p className="mt-1 text-sm text-text-secondary">
        Ex.: &quot;substitua a imagem da segunda seção por uma estátua de leão&quot;,
        &quot;deixe o título mais curto&quot; ou &quot;refaça a legenda do
        Instagram com mais emojis&quot;.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          required
          placeholder="Descreva o ajuste que deseja fazer…"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={loading}
          className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent-yellow px-6 py-3 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Aplicando…" : "Ajustar"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setShowModelPicker((v) => !v)}
        className="mt-3 text-xs font-medium text-text-secondary hover:text-accent-yellow hover:underline"
      >
        {showModelPicker ? "Ocultar" : "Trocar modelo de IA para este ajuste"}
      </button>

      {showModelPicker && (
        <div className="mt-3 space-y-4 rounded-lg border border-border bg-background p-4">
          <ModelPicker
            id={`revise-text-model-${articleId}`}
            label="Modelo de texto"
            value={textModel}
            onChange={setTextModel}
            options={textOptions}
            disabled={loading}
          />
          <ModelPicker
            id={`revise-image-model-${articleId}`}
            label="Modelo de imagem"
            value={imageModel}
            onChange={setImageModel}
            options={imageOptions}
            disabled={loading}
          />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          {error}
        </p>
      )}
      {success && !error && (
        <p className="mt-4 text-sm text-emerald-400">
          Ajuste aplicado com sucesso.
        </p>
      )}
    </div>
  );
}

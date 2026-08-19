"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Header } from "@/components/Header";
import { ModelPicker } from "@/components/ModelPicker";
import { ProfileManager } from "@/components/ProfileManager";
import { useModelOptions } from "@/lib/useModelOptions";

export default function SettingsPage() {
  const { textOptions, imageOptions, loading: loadingModels, error: modelsError } = useModelOptions();

  const [textModel, setTextModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setTextModel(data.defaultTextModel ?? "");
        setImageModel(data.defaultImageModel ?? "");
      })
      .catch(() => setError("Não foi possível carregar as configurações atuais."))
      .finally(() => setLoadingSettings(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultTextModel: textModel, defaultImageModel: imageModel }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Escolha os modelos padrão da OpenRouter usados para gerar o texto e as
          imagens das notícias. Modelos mais avançados custam mais, mas tendem a
          produzir resultados melhores — modelos mais baratos são ótimos para
          testes ou notícias mais simples. Você também pode escolher um modelo
          diferente para cada notícia na hora de gerar.
        </p>

        {modelsError && (
          <p className="mt-6 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {modelsError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <ModelPicker
            id="default-text-model"
            label="Modelo de texto"
            hint="Usado para redigir título, subtítulos e o corpo da notícia."
            value={textModel}
            onChange={setTextModel}
            options={textOptions}
            disabled={loadingSettings || loadingModels}
          />

          <ModelPicker
            id="default-image-model"
            label="Modelo de imagem"
            hint="Usado para gerar a capa e as imagens de cada seção."
            value={imageModel}
            onChange={setImageModel}
            options={imageOptions}
            disabled={loadingSettings || loadingModels}
          />

          <button
            type="submit"
            disabled={saving || loadingSettings}
            className="rounded-lg bg-accent-yellow px-6 py-3 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar configurações"}
          </button>

          {error && (
            <p className="rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
              {error}
            </p>
          )}
          {success && !error && (
            <p className="text-sm text-emerald-400">
              Configurações salvas com sucesso.
            </p>
          )}
        </form>

        <div className="mt-12 border-t border-border pt-8">
          <ProfileManager />
        </div>
      </main>
    </div>
  );
}

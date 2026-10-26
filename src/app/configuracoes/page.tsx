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
  const [instagramImageModel, setInstagramImageModel] = useState("");
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
        setInstagramImageModel(data.defaultInstagramImageModel ?? "");
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
        body: JSON.stringify({
          defaultTextModel: textModel,
          defaultImageModel: imageModel,
          defaultInstagramImageModel: instagramImageModel,
        }),
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Configurações</h1>
        <p className="mt-3 text-text-secondary">
          Modelos padrão de IA e perfis de tom de voz. Cada notícia também deixa
          escolher um modelo diferente na hora de gerar.
        </p>

        {modelsError && (
          <p className="mt-6 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {modelsError}
          </p>
        )}

        <section className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
            Modelos padrão
          </h2>

          <form onSubmit={handleSubmit} className="mt-4 space-y-5">
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
              hint="Usado para gerar a capa e as imagens de cada seção do Portal — fotografia, sem texto."
              value={imageModel}
              onChange={setImageModel}
              options={imageOptions}
              disabled={loadingSettings || loadingModels}
            />

            <ModelPicker
              id="default-instagram-image-model"
              label="Modelo de imagem do Instagram"
              hint="Usado nos cards do Instagram, que levam texto embutido — precisa de um modelo bom em renderizar texto."
              value={instagramImageModel}
              onChange={setInstagramImageModel}
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
              <p className="text-sm text-emerald-400">Configurações salvas com sucesso.</p>
            )}
          </form>
        </section>

        <div className="mt-8">
          <ProfileManager />
        </div>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { ModelPicker } from "@/components/ModelPicker";
import { useModelOptions } from "@/lib/useModelOptions";
import { useInstructionProfiles } from "@/lib/useInstructionProfiles";

const STAGES = [
  "Lendo as fontes…",
  "Extraindo o conteúdo…",
  "Redigindo a matéria com IA…",
  "Gerando imagens…",
  "Quase lá…",
];

const MAX_SOURCES = 5;

function isYoutubeUrl(value: string): boolean {
  return /youtube\.com|youtu\.be/i.test(value);
}

export default function Home() {
  const router = useRouter();
  const { textOptions, imageOptions } = useModelOptions();
  const { profiles } = useInstructionProfiles();

  const [urls, setUrls] = useState<string[]>([""]);
  const [profileId, setProfileId] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [textModel, setTextModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setTextModel(data.defaultTextModel ?? "");
        setImageModel(data.defaultImageModel ?? "");
      })
      .catch(() => {});
  }, []);

  function updateUrl(index: number, value: string) {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function addUrlField() {
    setUrls((prev) => (prev.length >= MAX_SOURCES ? prev : [...prev, ""]));
  }

  function removeUrlField(index: number) {
    setUrls((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
    if (cleanUrls.length === 0 || loading) return;

    setLoading(true);
    setError(null);
    setStageIndex(0);

    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 4000);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: cleanUrls,
          textModel,
          imageModel,
          profileId: profileId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Não foi possível gerar a notícia.");
      }

      router.push(`/noticia/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    } finally {
      clearInterval(interval);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Transforme vídeos e páginas em notícia
        </h1>
        <p className="mt-3 text-text-secondary">
          Cole links de vídeos do YouTube e/ou páginas com texto (ex.: outras
          notícias). Nossa IA lê todas as fontes e escreve uma matéria única,
          mesclando o conteúdo, com título, subtítulos, texto e imagens.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          {urls.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="url"
                  required={index === 0}
                  placeholder="Link do YouTube ou de uma página com notícia…"
                  value={value}
                  onChange={(e) => updateUrl(index, e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-border bg-transparent py-3 pl-4 pr-20 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
                />
                {value.trim() && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                    {isYoutubeUrl(value) ? "YouTube" : "Página"}
                  </span>
                )}
              </div>
              {urls.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeUrlField(index)}
                  disabled={loading}
                  aria-label="Remover fonte"
                  className="shrink-0 rounded-lg border border-border px-3 py-3 text-text-secondary transition hover:border-accent-red hover:text-accent-red disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addUrlField}
              disabled={loading || urls.length >= MAX_SOURCES}
              className="text-xs font-medium text-text-secondary hover:text-accent-yellow hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Adicionar fonte {urls.length >= MAX_SOURCES && `(máx. ${MAX_SOURCES})`}
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent-yellow px-6 py-3 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Gerando…" : "Gerar notícia"}
            </button>
          </div>
        </form>

        <div className="mt-4">
          <label htmlFor="profile" className="text-sm font-medium">
            Destino
          </label>
          <select
            id="profile"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            disabled={loading}
            className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-yellow disabled:opacity-50"
          >
            <option value="" className="bg-background text-foreground">
              Padrão (neutro)
            </option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id} className="bg-background text-foreground">
                {profile.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-secondary">
            Escolha o perfil de instrução usado para redigir esta notícia.{" "}
            <a href="/configuracoes" className="underline hover:text-accent-yellow">
              Gerenciar perfis
            </a>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModelPicker((v) => !v)}
          className="mt-4 self-start text-xs font-medium text-text-secondary hover:text-accent-yellow hover:underline"
        >
          {showModelPicker ? "Ocultar" : "Escolher modelos de IA para esta notícia"}
        </button>

        {showModelPicker && (
          <div className="mt-4 space-y-4 rounded-xl border border-border bg-surface p-4">
            <ModelPicker
              id="gen-text-model"
              label="Modelo de texto"
              value={textModel}
              onChange={setTextModel}
              options={textOptions}
              disabled={loading}
            />
            <ModelPicker
              id="gen-image-model"
              label="Modelo de imagem"
              value={imageModel}
              onChange={setImageModel}
              options={imageOptions}
              disabled={loading}
            />
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-3 text-sm text-text-secondary">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-yellow border-t-transparent" />
            {STAGES[stageIndex]}
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}

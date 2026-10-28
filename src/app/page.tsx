"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { ModelPicker } from "@/components/ModelPicker";
import { useModelOptions } from "@/lib/useModelOptions";
import { useInstructionProfiles } from "@/lib/useInstructionProfiles";
import { RICH_BLOCK_OPTIONS, type RichBlockType } from "@/lib/richBlocks";

const STAGES = [
  "Lendo as fontes…",
  "Extraindo o conteúdo…",
  "Redigindo a matéria com IA…",
  "Gerando imagens…",
  "Quase lá…",
];

const MAX_SOURCES = 5;
// Estimativa inicial (ms por notícia) até termos medições reais da própria geração em lote.
const DEFAULT_ARTICLE_MS = 40_000;

type ChannelVideo = { id: string; url: string; title: string };
type BatchState = {
  total: number;
  done: number;
  currentStartedAt: number;
  durations: number[];
  failures: { label: string; message: string }[];
  finished: boolean;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes} min ${String(seconds).padStart(2, "0")}s`;
}
const SUBTITLE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1); // 1–10
const PARAGRAPH_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1); // 1–15
const INSTAGRAM_PHOTO_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1); // 1–10

function isYoutubeUrl(value: string): boolean {
  return /youtube\.com|youtu\.be/i.test(value);
}

export default function Home() {
  const router = useRouter();
  const { textOptions, imageOptions } = useModelOptions();
  const { profiles } = useInstructionProfiles();

  const [urls, setUrls] = useState<string[]>([""]);
  const [channelUrl, setChannelUrl] = useState("");
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelResult, setChannelResult] = useState<{ title: string; videos: ChannelVideo[] } | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wantInstagram, setWantInstagram] = useState(true);
  const [wantPortal, setWantPortal] = useState(true);
  const [instagramPhotoCount, setInstagramPhotoCount] = useState(1);
  const [profileId, setProfileId] = useState("");
  const [subtitleCount, setSubtitleCount] = useState(2);
  const [paragraphCount, setParagraphCount] = useState(5);
  const [photoCount, setPhotoCount] = useState(2);
  const [embedVideo, setEmbedVideo] = useState(true);
  const [richBlocks, setRichBlocks] = useState<RichBlockType[]>([]);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [textModel, setTextModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [instagramImageModel, setInstagramImageModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setTextModel(data.defaultTextModel ?? "");
        setImageModel(data.defaultImageModel ?? "");
        setInstagramImageModel(data.defaultInstagramImageModel ?? "");
      })
      .catch(() => {});
  }, []);

  // Atualiza o relógio da barra de progresso enquanto o lote está rodando.
  useEffect(() => {
    if (!batch || batch.finished) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [batch]);

  // Não faz sentido ter mais fotos ou menos parágrafos do que seções.
  function handleSubtitleCountChange(next: number) {
    setSubtitleCount(next);
    setPhotoCount((v) => Math.min(v, next));
    setParagraphCount((v) => Math.max(v, next));
  }

  function updateUrl(index: number, value: string) {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function addUrlField() {
    setUrls((prev) => (prev.length >= MAX_SOURCES ? prev : [...prev, ""]));
  }

  function removeUrlField(index: number) {
    setUrls((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function fetchChannelVideos() {
    if (!channelUrl.trim() || channelLoading) return;
    setChannelLoading(true);
    setChannelError(null);
    setChannelResult(null);
    setSelectedVideos(new Set());

    try {
      const res = await fetch("/api/youtube/channel-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível listar os vídeos.");
      setChannelResult({ title: data.channelTitle, videos: data.videos });
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setChannelLoading(false);
    }
  }

  function toggleRichBlock(type: RichBlockType) {
    setRichBlocks((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function toggleVideo(url: string) {
    setSelectedVideos((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleAllVideos() {
    if (!channelResult) return;
    setSelectedVideos((prev) =>
      prev.size === channelResult.videos.length
        ? new Set()
        : new Set(channelResult.videos.map((v) => v.url))
    );
  }

  async function generateOne(sourceUrls: string[]): Promise<string> {
    const destinations = [
      ...(wantInstagram ? ["instagram"] : []),
      ...(wantPortal ? ["portal"] : []),
    ];

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: sourceUrls,
        textModel,
        imageModel,
        instagramImageModel,
        profileId: profileId || undefined,
        destinations,
        subtitleCount,
        paragraphCount,
        photoCount,
        instagramPhotoCount,
        richBlocks: wantPortal ? richBlocks : [],
        embedVideo,
        extraInstructions: extraInstructions.trim() || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Não foi possível gerar a notícia.");
    }
    return data.id as string;
  }

  // Uma notícia por vídeo selecionado (mais uma com o conteúdo do campo Fontes, se preenchido),
  // geradas em sequência pra não estourar limites/custo da IA de uma vez.
  async function runBatch(sourceUrls: string[], videoUrls: string[]) {
    const jobs: { label: string; urls: string[] }[] = [
      ...(sourceUrls.length > 0 ? [{ label: "Fontes", urls: sourceUrls }] : []),
      ...videoUrls.map((url) => ({
        label: channelResult?.videos.find((v) => v.url === url)?.title ?? url,
        urls: [url],
      })),
    ];

    setLoading(true);
    setError(null);

    const durations: number[] = [];
    const failures: BatchState["failures"] = [];
    const failedVideoUrls: string[] = [];
    setBatch({ total: jobs.length, done: 0, currentStartedAt: Date.now(), durations, failures, finished: false });

    for (let i = 0; i < jobs.length; i++) {
      const startedAt = Date.now();
      setBatch({ total: jobs.length, done: i, currentStartedAt: startedAt, durations: [...durations], failures: [...failures], finished: false });
      try {
        await generateOne(jobs[i].urls);
      } catch (err) {
        failures.push({ label: jobs[i].label, message: err instanceof Error ? err.message : "Erro inesperado." });
        if (jobs[i].label !== "Fontes") failedVideoUrls.push(jobs[i].urls[0]);
      }
      durations.push(Date.now() - startedAt);
    }

    setBatch({ total: jobs.length, done: jobs.length, currentStartedAt: Date.now(), durations, failures, finished: true });
    // Mantém marcados só os que falharam, pra tentar de novo sem refazer os que deram certo.
    setSelectedVideos(new Set(failedVideoUrls));
    setLoading(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
    const videoUrls = channelResult
      ? channelResult.videos.map((v) => v.url).filter((u) => selectedVideos.has(u))
      : [];
    if ((cleanUrls.length === 0 && videoUrls.length === 0) || loading || (!wantInstagram && !wantPortal)) {
      return;
    }

    setBatch(null);

    if (videoUrls.length > 0) {
      await runBatch(cleanUrls, videoUrls);
      return;
    }

    setLoading(true);
    setError(null);
    setStageIndex(0);

    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 4000);

    try {
      const id = await generateOne(cleanUrls);
      router.push(`/noticia/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    } finally {
      clearInterval(interval);
    }
  }

  const selectedCount = selectedVideos.size;
  const hasSourceUrls = urls.some((u) => u.trim());
  const batchTotal = selectedCount + (selectedCount > 0 && hasSourceUrls ? 1 : 0);

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Transforme vídeos e páginas em notícia
        </h1>
        <p className="mt-3 text-text-secondary">
          Cole links de vídeos do YouTube e/ou páginas com texto. Nossa IA lê todas
          as fontes e escreve uma matéria única, mesclando o conteúdo — do jeito
          que você configurar abaixo.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
              Fontes
            </h2>

            <div className="mt-4 space-y-3">
              {urls.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="url"
                      required={index === 0 && selectedCount === 0}
                      placeholder="Link do YouTube ou de uma página com notícia…"
                      value={value}
                      onChange={(e) => updateUrl(index, e.target.value)}
                      disabled={loading}
                      className="w-full rounded-lg border border-border bg-background px-4 py-3 pr-20 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
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
            </div>

            <button
              type="button"
              onClick={addUrlField}
              disabled={loading || urls.length >= MAX_SOURCES}
              className="mt-3 text-xs font-medium text-text-secondary hover:text-accent-yellow hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Adicionar fonte {urls.length >= MAX_SOURCES && `(máx. ${MAX_SOURCES})`}
            </button>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
              Vídeos de um canal ou playlist
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Cole a URL de um canal (lista os vídeos principais, sem Shorts) ou de uma playlist do YouTube (lista todos os vídeos dela).
            </p>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="text"
                placeholder="youtube.com/@canal ou youtube.com/playlist?list=…"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    fetchChannelVideos();
                  }
                }}
                disabled={channelLoading}
                className="w-full flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
              />
              <button
                type="button"
                onClick={fetchChannelVideos}
                disabled={channelLoading || !channelUrl.trim()}
                className="shrink-0 rounded-lg border border-border px-4 py-3 text-sm font-medium transition hover:border-accent-yellow hover:text-accent-yellow disabled:cursor-not-allowed disabled:opacity-50"
              >
                {channelLoading ? "Buscando…" : "Buscar vídeos"}
              </button>
            </div>

            {channelError && <p className="mt-3 text-xs text-accent-red">{channelError}</p>}

            {channelResult && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-text-secondary">
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={selectedCount === channelResult.videos.length && selectedCount > 0}
                      onChange={toggleAllVideos}
                      disabled={loading || channelResult.videos.length === 0}
                      className="h-4 w-4 accent-accent-yellow"
                    />
                    Selecionar todos
                  </label>
                  <span>
                    {selectedCount} de {channelResult.videos.length} selecionado(s)
                    {channelResult.title && ` · ${channelResult.title}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(channelResult.videos.map((v) => v.url).join("\n"))
                    }
                    className="shrink-0 font-medium hover:text-accent-yellow hover:underline"
                  >
                    Copiar links
                  </button>
                </div>
                <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background">
                  {channelResult.videos.map((video) => (
                    <li key={video.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
                        <input
                          type="checkbox"
                          checked={selectedVideos.has(video.url)}
                          onChange={() => toggleVideo(video.url)}
                          disabled={loading}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-accent-yellow"
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{video.title}</span>
                          <span className="block truncate font-mono text-[11px] text-text-secondary">
                            {video.url}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
              Destinos
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Escolha onde essa notícia vai ser publicada — pode marcar os dois.
            </p>

            <div className="mt-4 space-y-2">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                  wantInstagram ? "border-accent-yellow/60 bg-accent-yellow/5" : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  checked={wantInstagram}
                  onChange={(e) => setWantInstagram(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 accent-accent-yellow"
                />
                <span className="text-sm font-medium">
                  Instagram <span className="font-normal text-text-secondary">(reels e shorts)</span>
                </span>
              </label>

              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                  wantPortal ? "border-accent-yellow/60 bg-accent-yellow/5" : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  checked={wantPortal}
                  onChange={(e) => setWantPortal(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 accent-accent-yellow"
                />
                <span className="text-sm font-medium">Portal</span>
              </label>
            </div>

            {!wantInstagram && !wantPortal && (
              <p className="mt-2 text-xs text-accent-red">Escolha ao menos um destino.</p>
            )}
          </section>

          {wantInstagram && (
            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
                Instagram
              </h2>

              <div className="mt-4">
                <label htmlFor="instagram-photo-count" className="block text-sm font-medium">
                  Fotos do carrossel
                </label>
                <select
                  id="instagram-photo-count"
                  value={instagramPhotoCount}
                  onChange={(e) => setInstagramPhotoCount(Number(e.target.value))}
                  disabled={loading}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-yellow disabled:opacity-50 sm:w-40"
                >
                  {INSTAGRAM_PHOTO_OPTIONS.map((n) => (
                    <option key={n} value={n} className="bg-background text-foreground">
                      {n}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-secondary">
                  1 foto = post normal; mais de uma vira um carrossel.
                </p>
              </div>
            </section>
          )}

          {wantPortal && (
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
              Portal - Estrutura da matéria
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="subtitle-count" className="text-sm font-medium">
                  Subtítulos
                </label>
                <select
                  id="subtitle-count"
                  value={subtitleCount}
                  onChange={(e) => handleSubtitleCountChange(Number(e.target.value))}
                  disabled={loading}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-yellow disabled:opacity-50"
                >
                  {SUBTITLE_OPTIONS.map((n) => (
                    <option key={n} value={n} className="bg-background text-foreground">
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="paragraph-count" className="text-sm font-medium">
                  Parágrafos
                </label>
                <select
                  id="paragraph-count"
                  value={paragraphCount}
                  onChange={(e) => setParagraphCount(Number(e.target.value))}
                  disabled={loading}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-yellow disabled:opacity-50"
                >
                  {PARAGRAPH_OPTIONS.filter((n) => n >= subtitleCount).map((n) => (
                    <option key={n} value={n} className="bg-background text-foreground">
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="photo-count" className="text-sm font-medium">
                  Fotos
                </label>
                <select
                  id="photo-count"
                  value={photoCount}
                  onChange={(e) => setPhotoCount(Number(e.target.value))}
                  disabled={loading}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-yellow disabled:opacity-50"
                >
                  {Array.from({ length: subtitleCount + 1 }, (_, n) => n).map((n) => (
                    <option key={n} value={n} className="bg-background text-foreground">
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label
              className={`mt-6 flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                embedVideo ? "border-accent-yellow/60 bg-accent-yellow/5" : "border-border"
              }`}
            >
              <input
                type="checkbox"
                checked={embedVideo}
                onChange={(e) => setEmbedVideo(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent-yellow"
              />
              <span>
                <span className="block text-sm font-medium">Incorporar o vídeo de referência na matéria</span>
                <span className="block text-xs text-text-secondary">
                  Insere o player do YouTube (até 770px, responsivo) no topo da matéria, usando o primeiro vídeo das fontes.
                </span>
              </span>
            </label>

            <div className="mt-6">
              <p className="text-sm font-medium">Elementos para enriquecer a matéria</p>
              <p className="mt-1 text-xs text-text-secondary">
                Só são criados quando as fontes trazem dados reais para isso — a IA não inventa números.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {RICH_BLOCK_OPTIONS.map((option) => {
                  const checked = richBlocks.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                        checked ? "border-accent-yellow/60 bg-accent-yellow/5" : "border-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRichBlock(option.id)}
                        disabled={loading}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-accent-yellow"
                      />
                      <span>
                        <span className="block text-sm font-medium">{option.label}</span>
                        <span className="block text-xs text-text-secondary">{option.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
              Instruções adicionais <span className="font-normal text-text-secondary">(opcional)</span>
            </h2>
            <textarea
              id="extra-instructions"
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              disabled={loading}
              rows={2}
              placeholder='Ex.: "foque na parte financeira", "evite spoilers", "cite o nome do canal"…'
              className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
            />
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">
              Estilo
            </h2>

            <div className="mt-4">
              <label htmlFor="profile" className="block text-sm font-medium">
                Perfil de comunicação
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
                Define o tom da escrita (técnico, humor, etc.).{" "}
                <a href="/configuracoes" className="underline hover:text-accent-yellow">
                  Gerenciar perfis
                </a>
                .
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowModelPicker((v) => !v)}
              className="mt-4 text-xs font-medium text-text-secondary hover:text-accent-yellow hover:underline"
            >
              {showModelPicker ? "Ocultar modelos de IA" : "Escolher modelos de IA para esta notícia"}
            </button>

            {showModelPicker && (
              <div className="mt-4 space-y-4 rounded-lg border border-border bg-background p-4">
                <ModelPicker
                  id="gen-text-model"
                  label="Modelo de texto"
                  value={textModel}
                  onChange={setTextModel}
                  options={textOptions}
                  disabled={loading}
                />
                {wantPortal && (
                  <ModelPicker
                    id="gen-image-model"
                    label="Modelo de imagem (Portal)"
                    value={imageModel}
                    onChange={setImageModel}
                    options={imageOptions}
                    disabled={loading}
                  />
                )}
                {wantInstagram && (
                  <ModelPicker
                    id="gen-instagram-image-model"
                    label="Modelo de imagem (Instagram)"
                    hint="Card com texto embutido — precisa de um modelo bom em renderizar texto."
                    value={instagramImageModel}
                    onChange={setInstagramImageModel}
                    options={imageOptions}
                    disabled={loading}
                  />
                )}
              </div>
            )}
          </section>

          <button
            type="submit"
            disabled={loading || (!wantInstagram && !wantPortal)}
            className="w-full rounded-lg bg-accent-yellow px-6 py-3.5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Gerando…"
              : batchTotal > 1
                ? `Gerar ${batchTotal} notícias`
                : "Gerar notícia"}
          </button>
        </form>

        {batch && <BatchProgress batch={batch} now={now} />}

        {loading && !batch && (
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

function BatchProgress({ batch, now }: { batch: BatchState; now: number }) {
  const { total, done, durations, failures, finished } = batch;
  const avgMs = durations.length
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length
    : DEFAULT_ARTICLE_MS;

  if (finished) {
    const succeeded = total - failures.length;
    return (
      <div className="mt-6 space-y-3">
        {succeeded > 0 && (
          <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            <p className="font-semibold">Notícias geradas com sucesso!</p>
            <p className="mt-1">
              {succeeded} de {total} notícia(s) gerada(s) em {formatDuration(durations.reduce((sum, d) => sum + d, 0))}.{" "}
              <Link href="/noticias" className="font-medium underline">
                Ver no histórico
              </Link>
            </p>
          </div>
        )}
        {failures.length > 0 && (
          <div className="rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            <p className="font-semibold">{failures.length} notícia(s) não puderam ser geradas:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {failures.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.label}</span> — {f.message}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Os vídeos que falharam continuam marcados para você tentar de novo.</p>
          </div>
        )}
      </div>
    );
  }

  const elapsedCurrent = now - batch.currentStartedAt;
  const currentFraction = Math.min(elapsedCurrent / avgMs, 0.95);
  const percent = Math.round(((done + currentFraction) / total) * 100);
  const remainingMs = Math.max(avgMs - elapsedCurrent, 0) + avgMs * (total - done - 1);

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">
          Gerando notícia {Math.min(done + 1, total)} de {total}…
        </span>
        <span className="text-text-secondary">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-accent-yellow transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-text-secondary">
        Tempo estimado restante: ~{formatDuration(remainingMs)}
        {durations.length === 0 && " (estimativa inicial, ajustada conforme as notícias forem geradas)"}
      </p>
    </div>
  );
}

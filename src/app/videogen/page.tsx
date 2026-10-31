"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { VoiceSelect } from "@/components/videogen/VoiceSelect";
import { formatUsd } from "@/components/videogen/CostPanel";
import { FlowSteps, Icon, Spinner, StatusBadge, cardClass, fieldClass, iconButton, primaryButton, sectionTitle } from "@/components/videogen/ui";
import { useVoices } from "@/lib/videogen/useVoices";
import { VIDEO_PATTERNS, getVideoPattern } from "@/lib/videogen/patterns";
import { DEFAULT_VOICE_ID, DURATION_OPTIONS, RENDERABLE_PATTERNS, WORDS_PER_SECOND } from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";

const STAGES = ["Lendo o guia do padrão…", "Escrevendo o roteiro…", "Desenhando as cenas…", "Quase lá…"];
const MAX_TOPIC = 2000;

export default function VideoGenPage() {
  const router = useRouter();
  const { voices, loading: loadingVoices, error: voicesError } = useVoices();

  const [topic, setTopic] = useState("");
  const [patternId, setPatternId] = useState(RENDERABLE_PATTERNS[0] ?? VIDEO_PATTERNS[0]?.id ?? "");
  const [onlyRenderable, setOnlyRenderable] = useState(true);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [voiceName, setVoiceName] = useState("Macena");
  const [durationS, setDurationS] = useState(15);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<VideoJobDTO[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/videogen/jobs")
      .then((res) => res.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setJobs([]));
  }, []);

  // atualiza a lista enquanto algum vídeo está na fila/renderizando
  const anyRendering = Boolean(jobs?.some((j) => j.status === "queued" || j.status === "rendering"));
  useEffect(() => {
    if (!anyRendering) return;
    const t = setInterval(() => {
      fetch("/api/videogen/jobs")
        .then((res) => res.json())
        .then((data) => data.jobs && setJobs(data.jobs))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [anyRendering]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000);
    return () => clearInterval(id);
  }, [loading]);

  const pattern = getVideoPattern(patternId);
  const visiblePatterns = onlyRenderable ? VIDEO_PATTERNS.filter((p) => RENDERABLE_PATTERNS.includes(p.id)) : VIDEO_PATTERNS;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim()) {
      setError("Escreva o tema do vídeo.");
      document.getElementById("topic")?.focus();
      return;
    }
    setLoading(true);
    setStage(0);
    setError(null);
    try {
      const res = await fetch("/api/videogen/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, patternId, voiceId, voiceName, durationS, extraInstructions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível gerar o roteiro. Tente de novo.");
      router.push(`/videogen/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado. Tente de novo.");
      setLoading(false);
    }
  }

  async function removeJob(job: VideoJobDTO) {
    const what = job.videoUrl ? "o vídeo, o roteiro e a narração" : "o roteiro e a narração";
    if (!window.confirm(`Excluir "${job.script?.title || job.topic}"? Isso apaga ${what} de vez.`)) return;
    setDeleting(job.id);
    setError(null);
    try {
      const res = await fetch(`/api/videogen/jobs/${job.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir.");
      setJobs((list) => (list ?? []).filter((j) => j.id !== job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header wide />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">VideoGen</h1>
            <p className="mt-2 text-text-secondary">
              Cada vídeo passa por 5 etapas. Aqui você faz a primeira; nada é cobrado de narração ou render antes de você revisar o roteiro.
            </p>
          </div>
          {jobs && jobs.length > 0 && (
            <a href="#seus-videos" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-yellow lg:hidden">
              Seus vídeos ({jobs.length}) <Icon name="down" className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="mt-6">
          <FlowSteps current={0} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <form onSubmit={handleSubmit} noValidate className="min-w-0 space-y-5" aria-busy={loading}>
            <section className={cardClass}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="topic" className={sectionTitle}>
                  Tema <span aria-hidden>*</span>
                  <span className="sr-only"> (obrigatório)</span>
                </label>
                <span className="text-xs tabular-nums text-text-secondary">
                  {topic.length}/{MAX_TOPIC}
                </span>
              </div>
              <textarea
                id="topic"
                rows={3}
                required
                maxLength={MAX_TOPIC}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={loading}
                aria-describedby="topic-help"
                placeholder="Ex.: Por que o GEO vai importar mais que o SEO em 2027"
                className={`mt-3 resize-y ${fieldClass}`}
              />
              <p id="topic-help" className="mt-1.5 text-xs text-text-secondary">
                Uma frase basta. Quanto mais específico (público, ângulo, exemplo), melhor o roteiro.
              </p>
            </section>

            <fieldset className={cardClass} disabled={loading}>
              <legend className="sr-only">Estilo visual</legend>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={sectionTitle} aria-hidden>
                  Estilo visual
                </h2>
                <div role="group" aria-label="Filtrar estilos" className="inline-flex rounded-lg border border-border p-0.5 text-xs font-medium">
                  {[
                    { v: true, label: `Geram mp4 (${RENDERABLE_PATTERNS.length})` },
                    { v: false, label: `Todos (${VIDEO_PATTERNS.length})` },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      aria-pressed={onlyRenderable === o.v}
                      onClick={() => setOnlyRenderable(o.v)}
                      className={`min-h-9 rounded-md px-3 transition ${
                        onlyRenderable === o.v ? "bg-accent-yellow text-accent-yellow-ink" : "text-text-secondary hover:text-foreground"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {!onlyRenderable && (
                <p className="mt-2 text-xs text-text-secondary">
                  Os estilos sem a marca &quot;gera mp4&quot; ainda não têm render automático: por enquanto geram só roteiro e
                  narração.
                </p>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {visiblePatterns.map((p) => {
                  const active = p.id === patternId;
                  const renderable = RENDERABLE_PATTERNS.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-yellow/40 ${
                        active ? "border-accent-yellow bg-accent-yellow/5" : "border-border hover:border-border-hover"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pattern"
                        value={p.id}
                        checked={active}
                        onChange={() => setPatternId(p.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-accent-yellow"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {p.numero}. {p.nome}
                        </span>
                        <span className="block text-xs text-text-secondary">{p.tom}</span>
                        {(renderable || p.semNarracao) && (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {renderable && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                                <Icon name="check" className="h-3 w-3" /> gera mp4
                              </span>
                            )}
                            {p.semNarracao && (
                              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                                sem narração
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {pattern && (
                <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-text-secondary">
                  <strong className="font-semibold text-foreground">{pattern.nome}:</strong> {pattern.ritmo}. CTA: {pattern.cta}
                </p>
              )}
            </fieldset>

            <fieldset className={cardClass} disabled={loading}>
              <legend className="sr-only">Voz e duração</legend>
              <h2 className={sectionTitle} aria-hidden>
                Voz e duração
              </h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="voice" className="block text-sm font-medium">
                    Voz
                  </label>
                  <div className="mt-2">
                    <VoiceSelect
                      id="voice"
                      voices={voices}
                      value={voiceId}
                      onChange={(v) => {
                        setVoiceId(v.id);
                        setVoiceName(v.name);
                      }}
                      disabled={loading || pattern?.semNarracao}
                      loading={loadingVoices}
                      error={voicesError}
                    />
                  </div>
                  {pattern?.semNarracao && <p className="mt-1 text-xs text-text-secondary">Este estilo não usa narração.</p>}
                </div>
                <div>
                  <span id="duration-label" className="block text-sm font-medium">
                    Duração
                  </span>
                  <div role="radiogroup" aria-labelledby="duration-label" className="mt-2 flex flex-wrap gap-1.5">
                    {DURATION_OPTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={d === durationS}
                        onClick={() => setDurationS(d)}
                        className={`min-h-11 min-w-12 rounded-lg border px-3 text-sm tabular-nums transition ${
                          d === durationS
                            ? "border-accent-yellow bg-accent-yellow/10 font-semibold text-accent-yellow"
                            : "border-border text-text-secondary hover:border-border-hover"
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                  {!pattern?.semNarracao && (
                    <p className="mt-1.5 text-xs text-text-secondary">≈ {Math.round(durationS * WORDS_PER_SECOND)} palavras de narração.</p>
                  )}
                </div>
              </div>
            </fieldset>

            <details className={`group ${cardClass}`}>
              <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-2">
                <span className={sectionTitle}>Instruções extras</span>
                <span className="text-xs text-text-secondary">
                  {extraInstructions.trim() ? "preenchido" : "opcional"}
                  <span aria-hidden className="ml-2 inline-block transition group-open:rotate-90">
                    ›
                  </span>
                </span>
              </summary>
              <label htmlFor="extra" className="sr-only">
                Instruções extras
              </label>
              <textarea
                id="extra"
                rows={2}
                maxLength={2000}
                value={extraInstructions}
                onChange={(e) => setExtraInstructions(e.target.value)}
                disabled={loading}
                placeholder="Ex.: tom mais provocador, terminar com 'comenta GEO'"
                className={`mt-3 resize-y ${fieldClass}`}
              />
            </details>

            {error && (
              <div role="alert" className="flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className={`w-full py-3.5 ${primaryButton}`}>
              {loading && <Spinner className="h-4 w-4" />}
              {loading ? STAGES[stage] : (
                <>
                  Gerar roteiro <Icon name="arrow" className="h-4 w-4" />
                </>
              )}
            </button>
            {!loading && (
              <p className="text-center text-xs text-text-secondary">
                Próximo: você revisa o roteiro, depois gera a narração e manda para o render.
              </p>
            )}
            {loading && (
              <p className="text-center text-xs text-text-secondary" aria-live="polite">
                Leva cerca de 20 a 40 segundos. Depois você revisa tudo antes de gastar com narração e render.
              </p>
            )}
          </form>

          <aside id="seus-videos" className="min-w-0 scroll-mt-24" aria-labelledby="seus-videos-title">
            <h2 id="seus-videos-title" className={sectionTitle}>
              Seus vídeos
            </h2>
            {jobs === null ? (
              <div className="mt-3 space-y-2" aria-label="Carregando">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className={`mt-3 text-center ${cardClass}`}>
                <Icon name="film" className="mx-auto h-8 w-8 text-text-secondary" />
                <p className="mt-2 text-sm font-medium">Nenhum vídeo ainda</p>
                <p className="mt-1 text-xs text-text-secondary">Preencha o tema e gere o primeiro roteiro.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {jobs.map((job) => {
                  const title = job.script?.title || job.topic;
                  return (
                    <li key={job.id} className="flex items-center transition hover:bg-surface-2">
                      <Link
                        href={`/videogen/${job.id}`}
                        className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 pl-4 pr-1 outline-none focus-visible:bg-surface-2"
                      >
                        <span className="line-clamp-2 text-sm font-medium" title={title}>
                          {title}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
                          <StatusBadge
                            status={job.status}
                            progress={job.progress}
                            label={job.error && job.status === "draft" ? "Erro no roteiro" : undefined}
                          />
                          <span>
                            {getVideoPattern(job.patternId)?.nome ?? job.patternId} · {job.durationS}s
                          </span>
                          <span>
                            {new Date(job.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                            {job.costSummary && job.costSummary.totalUsd > 0 && ` · ≈ ${formatUsd(job.costSummary.totalUsd)}`}
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeJob(job)}
                        disabled={deleting !== null || job.status === "rendering"}
                        title={job.status === "rendering" ? "Aguarde o render terminar para excluir" : "Excluir"}
                        aria-label={`Excluir "${title}"`}
                        className={`mr-2 shrink-0 hover:bg-accent-red/10 hover:text-accent-red ${iconButton}`}
                      >
                        {deleting === job.id ? <Spinner className="h-4 w-4" /> : <Icon name="trash" className="h-4 w-4" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

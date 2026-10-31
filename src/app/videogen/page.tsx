"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { VoiceSelect } from "@/components/videogen/VoiceSelect";
import { useVoices } from "@/lib/videogen/useVoices";
import { VIDEO_PATTERNS, getVideoPattern } from "@/lib/videogen/patterns";
import { DEFAULT_VOICE_ID, DURATION_OPTIONS, RENDERABLE_PATTERNS, VIDEO_STATUS_LABEL } from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";
import { formatUsd } from "@/components/videogen/CostPanel";

const STAGES = ["Lendo o guia do padrão…", "Escrevendo o roteiro…", "Desenhando as cenas…", "Quase lá…"];

export default function VideoGenPage() {
  const router = useRouter();
  const { voices, loading: loadingVoices, error: voicesError } = useVoices();

  const [topic, setTopic] = useState("");
  const [patternId, setPatternId] = useState(VIDEO_PATTERNS[0]?.id ?? "");
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [voiceName, setVoiceName] = useState("Marco Narração");
  const [durationS, setDurationS] = useState(15);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<VideoJobDTO[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/videogen/jobs")
      .then((res) => res.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000);
    return () => clearInterval(id);
  }, [loading]);

  const pattern = getVideoPattern(patternId);

  async function removeJob(job: VideoJobDTO) {
    const what = job.videoUrl ? "o vídeo, o roteiro e a narração" : "o roteiro e a narração";
    if (!window.confirm(`Excluir "${job.script?.title || job.topic}"? Isso apaga ${what} de vez.`)) return;
    setDeleting(job.id);
    setError(null);
    try {
      const res = await fetch(`/api/videogen/jobs/${job.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir.");
      setJobs((list) => list.filter((j) => j.id !== job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
      if (!res.ok) throw new Error(data.error || "Não foi possível gerar o roteiro.");
      router.push(`/videogen/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">VideoGen</h1>
        <p className="mt-3 text-text-secondary">
          Escolha um padrão visual, a voz e a duração, e diga o tema. A IA escreve o roteiro e o plano de cenas; você
          revisa, gera a narração e manda para o render.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">Tema</h2>
            <textarea
              rows={3}
              required
              maxLength={2000}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              placeholder="Ex.: Por que o GEO vai importar mais que o SEO em 2027"
              className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
            />
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">Padrão visual</h2>
            <p className="mt-1 text-xs text-text-secondary">
              Os {VIDEO_PATTERNS.length} estilos do catálogo. O roteiro segue o ritmo, o texto na tela e o CTA do padrão.
              Os marcados com &quot;gera mp4&quot; já têm render automático; os outros, por enquanto, geram roteiro e narração.
            </p>
            <div className="mt-4 grid max-h-[420px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {VIDEO_PATTERNS.map((p) => {
                const active = p.id === patternId;
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition ${
                      active ? "border-accent-yellow/60 bg-accent-yellow/5" : "border-border hover:border-border-hover"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pattern"
                      value={p.id}
                      checked={active}
                      onChange={() => setPatternId(p.id)}
                      disabled={loading}
                      className="mt-1 h-4 w-4 shrink-0 accent-accent-yellow"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {p.numero}. {p.nome}
                      </span>
                      <span className="block text-xs text-text-secondary">{p.tom}</span>
                      {RENDERABLE_PATTERNS.includes(p.id) && (
                        <span className="mr-1 mt-1 inline-block rounded-full bg-accent-yellow/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-yellow">
                          gera mp4
                        </span>
                      )}
                      {p.semNarracao && (
                        <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                          sem narração
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {pattern && (
              <p className="mt-3 text-xs text-text-secondary">
                <strong className="font-medium text-foreground">Ritmo:</strong> {pattern.ritmo} ·{" "}
                <strong className="font-medium text-foreground">CTA:</strong> {pattern.cta}
              </p>
            )}
          </section>

          <section className="grid gap-5 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2 sm:p-6">
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
              {pattern?.semNarracao && (
                <p className="mt-1 text-xs text-text-secondary">Este padrão não usa narração.</p>
              )}
            </div>
            <div>
              <span className="block text-sm font-medium">Duração</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationS(d)}
                    disabled={loading}
                    className={`rounded-lg border px-3 py-2 text-sm transition disabled:opacity-50 ${
                      d === durationS
                        ? "border-accent-yellow bg-accent-yellow/10 font-semibold text-accent-yellow"
                        : "border-border text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">Instruções extras</h2>
            <textarea
              rows={2}
              maxLength={2000}
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              disabled={loading}
              placeholder="Opcional. Ex.: tom mais provocador, terminar com 'comenta GEO'"
              className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
            />
          </section>

          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="w-full rounded-lg bg-accent-yellow px-6 py-3.5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? STAGES[stage] : "Gerar roteiro"}
          </button>
        </form>

        {error && <p className="mt-6 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</p>}

        {jobs.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">Vídeos recentes</h2>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center hover:bg-surface-2">
                  <Link href={`/videogen/${job.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 pr-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{job.script?.title || job.topic}</span>
                      <span className="block truncate text-xs text-text-secondary">
                        {getVideoPattern(job.patternId)?.nome ?? job.patternId} · {job.durationS}s ·{" "}
                        {new Date(job.createdAt).toLocaleString("pt-BR")}
                        {job.costSummary && ` · ≈ ${formatUsd(job.costSummary.totalUsd)}`}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                      {job.error && job.status === "draft" ? "Erro no roteiro" : VIDEO_STATUS_LABEL[job.status]}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeJob(job)}
                    disabled={deleting !== null || job.status === "rendering"}
                    title={job.status === "rendering" ? "Aguarde o render terminar para excluir" : "Excluir"}
                    aria-label="Excluir"
                    className="mr-3 shrink-0 rounded-lg p-2 text-text-secondary transition hover:bg-accent-red/10 hover:text-accent-red disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {deleting === job.id ? (
                      <span className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { VoiceSelect } from "@/components/videogen/VoiceSelect";
import { useVoices } from "@/lib/videogen/useVoices";
import { getVideoPattern } from "@/lib/videogen/patterns";
import { DEFAULT_PRONUNCIATIONS } from "@/lib/videogen/pronunciation";
import {
  RENDERABLE_PATTERNS,
  VIDEO_STATUS_LABEL,
  WORDS_PER_SECOND,
  fullNarration,
  type VideoScene,
  type VideoScript,
} from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";
import { CostPanel } from "@/components/videogen/CostPanel";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent-yellow disabled:opacity-50";
const sectionTitle = "text-[15px] font-bold uppercase tracking-wide text-accent-yellow";
const secondaryButton =
  "rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:border-accent-yellow hover:text-accent-yellow disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "rounded-lg bg-accent-yellow px-5 py-2.5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-60";

const EMPTY_SCENE: VideoScene = { narration: "", onScreen: "", visual: "", imagePrompt: "", durationS: 2 };

type Busy = null | "save" | "script" | "narration" | "queue" | "delete";

export function VideoJobEditor({ id }: { id: string }) {
  const router = useRouter();
  const { voices, loading: loadingVoices, error: voicesError } = useVoices();
  const [job, setJob] = useState<VideoJobDTO | null>(null);
  const [script, setScript] = useState<VideoScript | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const applyJob = useCallback((next: VideoJobDTO) => {
    setJob(next);
    setScript(next.script);
    setDirty(false);
  }, []);

  useEffect(() => {
    fetch(`/api/videogen/jobs/${id}`)
      .then(async (res) => {
        if (res.status === 404) return setNotFound(true);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        applyJob(data.job);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar o vídeo."));
  }, [id, applyJob]);

  // Enquanto está na fila/renderizando, acompanha o status do worker.
  const polling = job?.status === "queued" || job?.status === "rendering";
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/videogen/jobs/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setJob(data.job);
    }, 5000);
    return () => clearInterval(timer);
  }, [polling, id]);

  async function call(kind: Exclude<Busy, null>, url: string, init?: RequestInit) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Algo deu errado.");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<boolean> {
    if (!script) return false;
    const data = await call("save", `/api/videogen/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script }),
    });
    if (data) applyJob(data.job);
    return Boolean(data);
  }

  async function changeVoice(voiceId: string, voiceName: string) {
    const data = await call("save", `/api/videogen/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId, voiceName, ...(dirty && script ? { script } : {}) }),
    });
    if (data) applyJob(data.job);
  }

  async function regenerateScript() {
    if (dirty && !window.confirm("Gerar de novo descarta suas edições no roteiro. Continuar?")) return;
    const data = await call("script", `/api/videogen/jobs/${id}/script`, { method: "POST" });
    if (data) applyJob(data.job);
  }

  async function generateNarration() {
    if (dirty && !(await save())) return;
    const data = await call("narration", `/api/videogen/jobs/${id}/narration`, { method: "POST" });
    if (data) applyJob(data.job);
  }

  async function queue(remove = false) {
    if (!remove && dirty && !(await save())) return;
    const data = await call("queue", `/api/videogen/jobs/${id}/queue`, { method: remove ? "DELETE" : "POST" });
    if (data?.job) applyJob(data.job);
  }

  async function remove() {
    if (!window.confirm("Excluir este vídeo e os arquivos dele?")) return;
    const data = await call("delete", `/api/videogen/jobs/${id}`, { method: "DELETE" });
    if (data) router.push("/videogen");
  }

  function update(patch: Partial<VideoScript>) {
    setScript((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
  }

  function updateScene(index: number, patch: Partial<VideoScene>) {
    setScript((s) => (s ? { ...s, scenes: s.scenes.map((sc, i) => (i === index ? { ...sc, ...patch } : sc)) } : s));
    setDirty(true);
  }

  function moveScene(index: number, delta: number) {
    setScript((s) => {
      if (!s) return s;
      const target = index + delta;
      if (target < 0 || target >= s.scenes.length) return s;
      const scenes = [...s.scenes];
      [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
      return { ...s, scenes };
    });
    setDirty(true);
  }

  if (notFound) {
    return (
      <Shell>
        <p className="text-text-secondary">
          Vídeo não encontrado. <Link href="/videogen" className="text-accent-yellow hover:underline">Voltar</Link>
        </p>
      </Shell>
    );
  }
  if (!job) {
    return (
      <Shell>
        {error ? <p className="text-accent-red">{error}</p> : <p className="text-text-secondary">Carregando…</p>}
      </Shell>
    );
  }

  const pattern = getVideoPattern(job.patternId);
  const locked = job.status === "queued" || job.status === "rendering";
  const disabled = locked || busy !== null;
  const renderable = RENDERABLE_PATTERNS.includes(job.patternId);
  const narration = script ? fullNarration(script) : "";
  const wordCount = narration ? narration.split(/\s+/).length : 0;
  const estimate = pattern?.semNarracao
    ? script?.scenes.reduce((sum, s) => sum + s.durationS, 0) ?? 0
    : wordCount / WORDS_PER_SECOND;

  return (
    <Shell>
      <Link href="/videogen" className="text-sm text-text-secondary hover:text-accent-yellow">
        ← VideoGen
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{script?.title || job.topic}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {pattern ? `${pattern.numero}. ${pattern.nome}` : job.patternId} · alvo {job.durationS}s · {job.topic}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-text-secondary">
          {VIDEO_STATUS_LABEL[job.status]}
          {job.status === "rendering" && job.progress != null && ` · ${job.progress}%`}
        </span>
      </div>

      {error && <p className="mt-5 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</p>}
      {job.error && !error && (
        <p className="mt-5 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{job.error}</p>
      )}

      {!script ? (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <p className="text-sm text-text-secondary">O roteiro ainda não foi gerado.</p>
          <button type="button" onClick={regenerateScript} disabled={disabled} className={`mt-4 ${primaryButton}`}>
            {busy === "script" ? "Gerando roteiro…" : "Gerar roteiro"}
          </button>
        </section>
      ) : (
        <div className="mt-6 space-y-5">
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={sectionTitle}>Roteiro</h2>
              <span className="text-xs text-text-secondary">
                {pattern?.semNarracao
                  ? `${script.scenes.length} cenas · ≈${Math.round(estimate)}s`
                  : `${wordCount} palavras · ≈${Math.round(estimate)}s de narração · ${script.scenes.length} cenas`}
              </span>
            </div>
            <label className="mt-4 block text-xs font-medium text-text-secondary">Título interno</label>
            <input
              value={script.title}
              onChange={(e) => update({ title: e.target.value })}
              disabled={disabled}
              className={`mt-1 ${input}`}
            />

            <ol className="mt-5 space-y-4">
              {script.scenes.map((scene, i) => (
                <li key={i} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Cena {i + 1}
                    </span>
                    <div className="flex items-center gap-1 text-text-secondary">
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="number"
                          min={0.5}
                          max={60}
                          step={0.5}
                          value={scene.durationS}
                          onChange={(e) => updateScene(i, { durationS: Number(e.target.value) })}
                          disabled={disabled}
                          className="w-16 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent-yellow"
                        />
                        s
                      </label>
                      <IconButton label="Subir" onClick={() => moveScene(i, -1)} disabled={disabled || i === 0}>↑</IconButton>
                      <IconButton
                        label="Descer"
                        onClick={() => moveScene(i, 1)}
                        disabled={disabled || i === script.scenes.length - 1}
                      >
                        ↓
                      </IconButton>
                      <IconButton
                        label="Remover cena"
                        onClick={() => update({ scenes: script.scenes.filter((_, j) => j !== i) })}
                        disabled={disabled || script.scenes.length <= 1}
                      >
                        ×
                      </IconButton>
                    </div>
                  </div>
                  {!pattern?.semNarracao && (
                    <>
                      <label className="mt-3 block text-xs font-medium text-text-secondary">Narração (legenda)</label>
                      <textarea
                        rows={2}
                        value={scene.narration}
                        onChange={(e) => updateScene(i, { narration: e.target.value })}
                        disabled={disabled}
                        className={`mt-1 resize-y ${input}`}
                      />
                    </>
                  )}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary">Texto na tela</label>
                      <input
                        value={scene.onScreen}
                        onChange={(e) => updateScene(i, { onScreen: e.target.value })}
                        disabled={disabled}
                        className={`mt-1 ${input}`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary">Visual</label>
                      <input
                        value={scene.visual}
                        onChange={(e) => updateScene(i, { visual: e.target.value })}
                        disabled={disabled}
                        className={`mt-1 ${input}`}
                      />
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-foreground">
                      Prompt da imagem (inglês)
                    </summary>
                    <textarea
                      rows={3}
                      value={scene.imagePrompt}
                      onChange={(e) => updateScene(i, { imagePrompt: e.target.value })}
                      disabled={disabled}
                      className={`mt-2 resize-y font-mono text-xs ${input}`}
                    />
                  </details>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => update({ scenes: [...script.scenes, { ...EMPTY_SCENE }] })}
              disabled={disabled}
              className="mt-3 text-sm font-medium text-accent-yellow hover:underline disabled:opacity-50"
            >
              + Adicionar cena
            </button>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {!pattern?.semNarracao && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary">CTA falado</label>
                  <input
                    value={script.cta.narration}
                    onChange={(e) => update({ cta: { ...script.cta, narration: e.target.value } })}
                    disabled={disabled}
                    className={`mt-1 ${input}`}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-text-secondary">CTA na tela</label>
                <input
                  value={script.cta.onScreen}
                  onChange={(e) => update({ cta: { ...script.cta, onScreen: e.target.value } })}
                  disabled={disabled}
                  className={`mt-1 ${input}`}
                />
              </div>
            </div>

            <label className="mt-4 block text-xs font-medium text-text-secondary">
              Palavras em destaque (separadas por vírgula)
            </label>
            <input
              value={script.keywords.join(", ")}
              onChange={(e) =>
                update({ keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })
              }
              disabled={disabled}
              className={`mt-1 ${input}`}
            />

            <label className="mt-4 block text-xs font-medium text-text-secondary">Trilha (prompt em inglês)</label>
            <input
              value={script.musicPrompt}
              onChange={(e) => update({ musicPrompt: e.target.value })}
              disabled={disabled}
              className={`mt-1 ${input}`}
            />

            <label className="mt-4 block text-xs font-medium text-text-secondary">Legenda do post</label>
            <textarea
              rows={4}
              value={script.postCaption}
              onChange={(e) => update({ postCaption: e.target.value })}
              disabled={disabled}
              className={`mt-1 resize-y ${input}`}
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={save} disabled={disabled || !dirty} className={primaryButton}>
                {busy === "save" ? "Salvando…" : dirty ? "Salvar alterações" : "Salvo"}
              </button>
              <button type="button" onClick={regenerateScript} disabled={disabled} className={secondaryButton}>
                {busy === "script" ? "Gerando roteiro…" : "Gerar roteiro de novo"}
              </button>
            </div>
          </section>

          {!pattern?.semNarracao && (
            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <h2 className={sectionTitle}>Narração</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label htmlFor="voice" className="block text-xs font-medium text-text-secondary">
                    Voz (ElevenLabs)
                  </label>
                  <div className="mt-1">
                    <VoiceSelect
                      id="voice"
                      voices={voices}
                      value={job.voiceId}
                      onChange={(v) => changeVoice(v.id, v.name)}
                      disabled={disabled}
                      loading={loadingVoices}
                      error={voicesError}
                    />
                  </div>
                </div>
                <button type="button" onClick={generateNarration} disabled={disabled} className={primaryButton}>
                  {busy === "narration"
                    ? "Gerando narração…"
                    : job.narrationUrl
                      ? "Gerar narração de novo"
                      : "Gerar narração"}
                </button>
              </div>

              {job.narrationUrl ? (
                <div className="mt-4">
                  <audio key={job.narrationUrl} controls src={job.narrationUrl} className="w-full" />
                  <p className="mt-1 text-xs text-text-secondary">
                    {job.narrationDurationS?.toFixed(1)}s · {job.narrationWords?.length ?? 0} palavras sincronizadas
                    {job.narrationDurationS && job.narrationDurationS > job.durationS * 1.15 &&
                      " · ficou mais longa que o alvo; encurte o roteiro se precisar"}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-text-secondary">
                  {dirty ? "As edições serão salvas antes de gerar. " : ""}
                  Siglas em inglês e o site são convertidos para a pronúncia certa automaticamente.
                </p>
              )}

              <PronunciationEditor script={script} disabled={disabled} onChange={(p) => update({ pronunciations: p })} />
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className={sectionTitle}>Render</h2>
            {job.status === "done" && job.videoUrl ? (
              <div className="mt-4">
                <video controls src={job.videoUrl} className="mx-auto max-h-[640px] rounded-xl bg-black" />
                <a
                  href={job.videoUrl}
                  download
                  className={`mt-4 inline-block ${primaryButton}`}
                >
                  Baixar mp4
                </a>
              </div>
            ) : locked ? (
              <p className="mt-3 text-sm text-text-secondary">
                {job.status === "queued"
                  ? "Na fila. O worker de render pega o vídeo em instantes."
                  : `Renderizando${job.progress != null ? ` (${job.progress}%)` : ""}…`}
              </p>
            ) : (
              <p className="mt-3 text-sm text-text-secondary">
                {job.status === "failed" && "O último render falhou (veja o erro acima). "}
                O worker gera as imagens das cenas, a trilha, monta o vídeo no estilo do padrão e devolve o mp4 aqui.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {job.status === "queued" ? (
                <button type="button" onClick={() => queue(true)} disabled={busy !== null} className={secondaryButton}>
                  Tirar da fila
                </button>
              ) : (
                !locked && (
                  <button
                    type="button"
                    onClick={() => queue()}
                    disabled={disabled || !renderable || (!pattern?.semNarracao && !job.narrationUrl)}
                    className={primaryButton}
                  >
                    {busy === "queue" ? "Enviando…" : job.status === "done" ? "Renderizar de novo" : "Enviar para render"}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={remove}
                disabled={busy !== null || job.status === "rendering"}
                title={job.status === "rendering" ? "Aguarde o render terminar para excluir" : undefined}
                className={secondaryButton}
              >
                Excluir vídeo
              </button>
            </div>
            {!renderable && !locked && (
              <p className="mt-2 text-xs text-text-secondary">
                O render automático deste padrão ainda está em desenvolvimento. Na página do VideoGen, os padrões
                marcados com &quot;gera mp4&quot; já vão para a fila.
              </p>
            )}
            {renderable && !pattern?.semNarracao && !job.narrationUrl && !locked && (
              <p className="mt-2 text-xs text-text-secondary">Gere a narração antes de mandar para o render.</p>
            )}
          </section>

          <CostPanel job={job} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:py-14">{children}</main>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded px-2 py-1 text-sm transition hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function PronunciationEditor({
  script,
  disabled,
  onChange,
}: {
  script: VideoScript;
  disabled: boolean;
  onChange: (p: VideoScript["pronunciations"]) => void;
}) {
  const list = script.pronunciations;
  return (
    <details className="mt-5">
      <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-foreground">
        Pronúncias ({DEFAULT_PRONUNCIATIONS.length} fixas + {list.length} deste vídeo)
      </summary>
      <p className="mt-2 text-xs text-text-secondary">
        Fixas: {DEFAULT_PRONUNCIATIONS.map((p) => `${p.display} → ${p.spoken}`).join(" · ")}
      </p>
      <div className="mt-3 space-y-2">
        {list.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={p.display}
              placeholder="Como aparece"
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, display: e.target.value } : x)))}
              disabled={disabled}
              className={input}
            />
            <input
              value={p.spoken}
              placeholder="Como falar"
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, spoken: e.target.value } : x)))}
              disabled={disabled}
              className={input}
            />
            <IconButton label="Remover" onClick={() => onChange(list.filter((_, j) => j !== i))} disabled={disabled}>
              ×
            </IconButton>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...list, { display: "", spoken: "" }])}
          disabled={disabled}
          className="text-xs font-medium text-accent-yellow hover:underline disabled:opacity-50"
        >
          + Adicionar pronúncia
        </button>
      </div>
    </details>
  );
}

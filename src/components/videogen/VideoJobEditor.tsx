"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { VoiceSelect } from "@/components/videogen/VoiceSelect";
import { CostPanel } from "@/components/videogen/CostPanel";
import { BriefingImages } from "@/components/videogen/BriefingImages";
import { SceneStudio } from "@/components/videogen/SceneStudio";
import {
  FlowSteps,
  FLOW_STEPS,
  AutoTextarea,
  CopyButton,
  Icon,
  Spinner,
  StatusBadge,
  cardClass,
  dangerButton,
  fieldClass,
  iconButton,
  labelClass,
  primaryButton,
  secondaryButton,
  sectionTitle,
} from "@/components/videogen/ui";
import { useVoices } from "@/lib/videogen/useVoices";
import { useStyles } from "@/lib/videogen/useStyles";
import { useProfiles } from "@/lib/videogen/useProfiles";
import { mergePronunciations } from "@/lib/videogen/pronunciation";
import {
  WORDS_PER_SECOND,
  fullNarration,
  type BriefingImage,
  type Pronunciation,
  type VideoScene,
  type VideoScript,
} from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";

type Busy = null | "save" | "script" | "narration" | "queue" | "delete";

export function VideoJobEditor({ id }: { id: string }) {
  const router = useRouter();
  const { voices, loading: loadingVoices, error: voicesError } = useVoices();
  const { loaded: stylesLoaded, getStyle } = useStyles();
  const { profiles, loaded: profilesLoaded } = useProfiles();
  const [job, setJob] = useState<VideoJobDTO | null>(null);
  const [script, setScript] = useState<VideoScript | null>(null);
  const [briefing, setBriefing] = useState<BriefingImage[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const applyJob = useCallback((next: VideoJobDTO) => {
    setJob(next);
    setScript(next.script);
    setBriefing(next.briefingImages ?? []);
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

  // Avisa antes de sair da página com edições não salvas.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

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
      body: JSON.stringify({ script, briefingImages: briefing }),
    });
    if (data) {
      applyJob(data.job);
      setToast("Alterações salvas");
    }
    return Boolean(data);
  }

  async function changeVoice(voiceId: string, voiceName: string) {
    const data = await call("save", `/api/videogen/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId, voiceName, ...(dirty && script ? { script, briefingImages: briefing } : {}) }),
    });
    if (data) applyJob(data.job);
  }

  async function regenerateScript() {
    const msg = dirty
      ? "Gerar o roteiro de novo descarta suas edições e a narração atual. Continuar?"
      : "Gerar o roteiro de novo substitui o atual e descarta a narração. Continuar?";
    if (script && !window.confirm(msg)) return;
    // imagens do briefing mudadas entram no roteiro novo (as edições do roteiro são descartadas)
    if (dirty && JSON.stringify(briefing) !== JSON.stringify(job?.briefingImages ?? [])) {
      const saved = await call("save", `/api/videogen/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefingImages: briefing }),
      });
      if (!saved) return;
    }
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
    if (!window.confirm("Excluir este vídeo? O roteiro, a narração e o mp4 são apagados de vez.")) return;
    const data = await call("delete", `/api/videogen/jobs/${id}`, { method: "DELETE" });
    if (data) router.push("/videogen");
  }

  function discard() {
    if (!job) return;
    setScript(job.script);
    setBriefing(job.briefingImages ?? []);
    setDirty(false);
  }

  function update(patch: Partial<VideoScript>) {
    setScript((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
  }

  function updateScene(index: number, patch: Partial<VideoScene>) {
    setScript((s) => (s ? { ...s, scenes: s.scenes.map((sc, i) => (i === index ? { ...sc, ...patch } : sc)) } : s));
    setDirty(true);
  }

  /** Tira a cena de `from` e coloca na posição `to` (índices da lista final). */
  function reorderScene(from: number, to: number) {
    setScript((s) => {
      if (!s || from === to || to < 0 || to >= s.scenes.length) return s;
      const scenes = [...s.scenes];
      const [moved] = scenes.splice(from, 1);
      scenes.splice(to, 0, moved);
      return { ...s, scenes };
    });
    setDirty(true);
  }

  function insertScene(at: number, scene: VideoScene) {
    setScript((s) => {
      if (!s) return s;
      const scenes = [...s.scenes];
      scenes.splice(at, 0, scene);
      return { ...s, scenes };
    });
    setDirty(true);
  }

  /** Atualiza as imagens do briefing; cena que usava uma imagem removida volta para a imagem da IA. */
  function changeBriefing(next: BriefingImage[]) {
    setBriefing(next);
    const keep = new Set(next.map((i) => i.url));
    setScript((s) =>
      s && s.scenes.some((sc) => sc.imageUrl && !keep.has(sc.imageUrl))
        ? { ...s, scenes: s.scenes.map((sc) => (sc.imageUrl && !keep.has(sc.imageUrl) ? { ...sc, imageUrl: undefined } : sc)) }
        : s
    );
    setDirty(true);
  }

  function removeScene(index: number) {
    if (!script) return;
    const sc = script.scenes[index];
    const hasText = [sc.narration, sc.onScreen, sc.visual, sc.imagePrompt].some((t) => t.trim());
    if (hasText && !window.confirm(`Remover a cena ${index + 1}?`)) return;
    update({ scenes: script.scenes.filter((_, j) => j !== index) });
  }

  if (notFound) {
    return (
      <Shell>
        <div className={`${cardClass} text-center`}>
          <p className="text-text-secondary">Este vídeo não existe mais (pode ter sido excluído).</p>
          <Link href="/videogen" className={`mt-4 ${secondaryButton}`}>
            Voltar ao VideoGen
          </Link>
        </div>
      </Shell>
    );
  }
  if (!job) {
    return (
      <Shell>
        {error ? (
          <p role="alert" className="rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {error}
          </p>
        ) : (
          <div className="animate-pulse space-y-4 motion-reduce:animate-none" aria-label="Carregando">
            <div className="h-4 w-24 rounded bg-surface-2" />
            <div className="h-8 w-2/3 rounded bg-surface-2" />
            <div className="h-64 rounded-2xl bg-surface-2" />
          </div>
        )}
      </Shell>
    );
  }

  const pattern = getStyle(job.patternId);
  const person = profiles.find((p) => p.id === job.personId);
  const company = profiles.find((p) => p.id === job.companyId);
  const profileLine = profilesLoaded
    ? `${person?.name ?? (job.personId ? "Pessoa removida" : "Narrador neutro")} para ${company?.name ?? (job.companyId ? "empresa removida" : "nenhuma empresa")}`
    : "…";
  const fixedPronunciations = mergePronunciations(person?.pronunciations ?? [], company?.pronunciations ?? []);
  const noNarration = Boolean(pattern?.semNarracao);
  const locked = job.status === "queued" || job.status === "rendering";
  const disabled = locked || busy !== null;
  const renderable = !stylesLoaded || Boolean(pattern); // estilo removido não vai mais pro render
  const narration = script ? fullNarration(script) : "";
  const wordCount = narration ? narration.split(/\s+/).length : 0;
  const estimate = noNarration ? script?.scenes.reduce((sum, s) => sum + s.durationS, 0) ?? 0 : wordCount / WORDS_PER_SECOND;

  const hasNarrationNow = noNarration || Boolean(job.narrationUrl);
  const flowDone = job.status === "done" && Boolean(job.videoUrl);
  // 1 = revisar roteiro, 2 = ouvir narração/enviar, 3 = render, 4 = pronto
  const flowCurrent = flowDone ? 4 : locked ? 3 : script && hasNarrationNow ? (noNarration ? 3 : 2) : 1;

  const nextStep = (
    <NextStep
      step={flowCurrent}
      job={job}
      hasScript={Boolean(script)}
      noNarration={noNarration}
      renderable={renderable}
      busy={busy}
      dirty={dirty}
      onGenerateScript={regenerateScript}
      onNarration={generateNarration}
      onQueue={() => queue()}
      onUnqueue={() => queue(true)}
    />
  );

  return (
    <Shell padBottom={dirty}>
      <Link
        href="/videogen"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-secondary transition hover:text-accent-yellow"
      >
        <Icon name="back" className="h-4 w-4" /> Todos os vídeos
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{script?.title || job.topic}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {profileLine} · {pattern ? pattern.nome : stylesLoaded ? "Estilo removido" : "…"} · alvo {job.durationS}s
          </p>
        </div>
        <StatusBadge status={job.status} progress={job.progress} />
      </div>

      {(error || job.error) && (
        <div role="alert" className="mt-5 flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{error || job.error}</span>
        </div>
      )}

      <div className="mt-6">
        <FlowSteps current={flowCurrent} finished={flowDone} skipped={noNarration ? [2] : []} />
      </div>

      {/* no celular, o próximo passo vem antes do roteiro longo */}
      <div className="mt-6 lg:hidden">{nextStep}</div>

      {script && (
        <div className="mt-6">
          <SceneStudio
            script={script}
            briefing={briefing}
            narrationWords={job.narrationWords}
            narrationUrl={job.narrationUrl}
            noNarration={noNarration}
            disabled={disabled}
            targetS={job.durationS}
            onScene={updateScene}
            onCta={(patch) => update({ cta: { ...script.cta, ...patch } })}
            onReorder={reorderScene}
            onInsert={insertScene}
            onRemove={removeScene}
            onAddImage={(url) => changeBriefing([...briefing, { url }])}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-6">
          {!script ? (
            <section className={cardClass}>
              <h2 className={sectionTitle}>Roteiro</h2>
              <p className="mt-3 text-sm text-text-secondary">
                O roteiro ainda não foi gerado. Use o botão &quot;Gerar roteiro&quot; para tentar de novo.
              </p>
            </section>
          ) : (
            <>
              <section className={cardClass} aria-labelledby="roteiro-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id="roteiro-title" className={sectionTitle}>
                      Roteiro
                    </h2>
                    <p className="mt-1 text-xs text-text-secondary">
                      {noNarration
                        ? `${script.scenes.length} cenas · ≈${Math.round(estimate)}s`
                        : `${wordCount} palavras · ≈${Math.round(estimate)}s de narração · ${script.scenes.length} cenas`}
                      {!noNarration && estimate > job.durationS * 1.15 && (
                        <span className="text-warning"> · passa do alvo de {job.durationS}s</span>
                      )}
                    </p>
                  </div>
                  <button type="button" onClick={regenerateScript} disabled={disabled} className={secondaryButton}>
                    {busy === "script" ? <Spinner /> : <Icon name="refresh" className="h-4 w-4" />}
                    {busy === "script" ? "Gerando…" : "Gerar de novo"}
                  </button>
                </div>

                <label htmlFor="title" className={`mt-5 ${labelClass}`}>
                  Título interno
                </label>
                <input
                  id="title"
                  value={script.title}
                  onChange={(e) => update({ title: e.target.value })}
                  disabled={disabled}
                  className={`mt-1 ${fieldClass}`}
                />

              </section>

              <section className={cardClass} aria-labelledby="briefing-title">
                <h2 id="briefing-title" className={sectionTitle}>
                  Imagens do briefing
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  {briefing.length
                    ? `${script.scenes.filter((sc) => sc.imageUrl).length} de ${script.scenes.length} cenas usam suas fotos; as outras têm imagem gerada pela IA. Escolha a imagem de cada cena clicando nela na timeline.`
                    : "Sem fotos suas: todas as cenas usam imagem gerada pela IA. Envie fotos para usar nas cenas (e no roteiro, se gerar de novo)."}
                </p>
                <div className="mt-3">
                  <BriefingImages images={briefing} onChange={changeBriefing} disabled={disabled} />
                </div>
              </section>

              <section className={cardClass} aria-labelledby="fecho-title">
                <h2 id="fecho-title" className={sectionTitle}>
                  Destaques, trilha e post
                </h2>
                <label htmlFor="keywords" className={`mt-4 ${labelClass}`}>
                  Palavras em destaque
                </label>
                <input
                  id="keywords"
                  aria-describedby="keywords-help"
                  value={script.keywords.join(", ")}
                  onChange={(e) => update({ keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                  disabled={disabled}
                  className={`mt-1 ${fieldClass}`}
                />
                <p id="keywords-help" className="mt-1 text-xs text-text-secondary">
                  Separadas por vírgula. O vídeo destaca essas palavras na legenda.
                </p>

                <label htmlFor="music" className={`mt-4 ${labelClass}`}>
                  Trilha (descrição em inglês)
                </label>
                <AutoTextarea
                  id="music"
                  value={script.musicPrompt}
                  onChange={(e) => update({ musicPrompt: e.target.value })}
                  disabled={disabled}
                  className={`mt-1 ${fieldClass}`}
                />

                <div className="mt-4 flex items-end justify-between gap-2">
                  <label htmlFor="caption" className={labelClass}>
                    Legenda do post
                  </label>
                  <CopyButton text={script.postCaption} />
                </div>
                <AutoTextarea
                  id="caption"
                  minRows={3}
                  value={script.postCaption}
                  onChange={(e) => update({ postCaption: e.target.value })}
                  disabled={disabled}
                  className={`mt-1 ${fieldClass}`}
                />
              </section>
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Narração, render e custo">
          <div className="hidden lg:block">{nextStep}</div>

          {script && !noNarration && (
            <section className={cardClass} aria-labelledby="narracao-title">
              <h2 id="narracao-title" className={sectionTitle}>
                Narração
              </h2>
              <label htmlFor="voice" className={`mt-4 ${labelClass}`}>
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
              {job.narrationUrl ? (
                <div className="mt-4">
                  <audio key={job.narrationUrl} controls src={job.narrationUrl} className="w-full" />
                  <p className="mt-1 text-xs text-text-secondary">
                    {job.narrationDurationS?.toFixed(1)}s · {job.narrationWords?.length ?? 0} palavras sincronizadas
                  </p>
                  {job.narrationDurationS && job.narrationDurationS > job.durationS * 1.15 && (
                    <p className="mt-1 text-xs text-warning">
                      Ficou mais longa que o alvo de {job.durationS}s. Se quiser, encurte o roteiro e gere de novo.
                    </p>
                  )}
                  <button type="button" onClick={generateNarration} disabled={disabled} className={`mt-3 w-full ${secondaryButton}`}>
                    {busy === "narration" ? <Spinner /> : <Icon name="refresh" className="h-4 w-4" />}
                    {busy === "narration" ? "Gerando narração…" : "Gerar narração de novo"}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-text-secondary">
                  Siglas em inglês e o site viram a pronúncia certa automaticamente. Ajuste abaixo, se precisar.
                </p>
              )}
              <PronunciationEditor
                script={script}
                fixed={fixedPronunciations}
                disabled={disabled}
                onChange={(p) => update({ pronunciations: p })}
              />
            </section>
          )}

          <section className={cardClass} aria-labelledby="render-title">
            <h2 id="render-title" className={sectionTitle}>
              Vídeo
            </h2>
            {job.status === "done" && job.videoUrl ? (
              <div className="mt-4">
                <video
                  controls
                  preload="metadata"
                  src={job.videoUrl}
                  className="mx-auto aspect-[9/16] max-h-[70dvh] w-full rounded-xl bg-black object-contain"
                />
                <a href={job.videoUrl} download className={`mt-4 w-full ${primaryButton}`}>
                  <Icon name="download" className="h-4 w-4" /> Baixar mp4
                </a>
                <button type="button" onClick={() => queue()} disabled={disabled} className={`mt-2 w-full ${secondaryButton}`}>
                  {busy === "queue" ? <Spinner /> : <Icon name="refresh" className="h-4 w-4" />}
                  Renderizar de novo
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-secondary">
                {locked
                  ? "Acompanhe o andamento no card de etapas."
                  : renderable
                    ? "O worker gera as imagens das cenas e a trilha, monta o vídeo no estilo do padrão e devolve o mp4 aqui."
                    : "O render automático deste padrão ainda está em desenvolvimento. Por enquanto, ele gera roteiro e narração."}
              </p>
            )}
            <div className="mt-5 border-t border-border pt-4">
              <button
                type="button"
                onClick={remove}
                disabled={busy !== null || job.status === "rendering"}
                aria-describedby={job.status === "rendering" ? "delete-help" : undefined}
                className={`-ml-3 ${dangerButton}`}
              >
                {busy === "delete" ? <Spinner /> : <Icon name="trash" className="h-4 w-4" />}
                Excluir vídeo
              </button>
              {job.status === "rendering" && (
                <p id="delete-help" className="text-xs text-text-secondary">
                  Disponível quando o render terminar.
                </p>
              )}
            </div>
          </section>

          <CostPanel job={job} />
        </aside>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-sm font-medium">
              <span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-full bg-warning align-middle" />
              Alterações não salvas
            </p>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={discard} disabled={busy !== null} className={secondaryButton}>
                Descartar
              </button>
              <button type="button" onClick={save} disabled={busy !== null} className={primaryButton}>
                {busy === "save" && <Spinner />}
                {busy === "save" ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg">
            <Icon name="check" className="h-4 w-4" /> {toast}
          </span>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, padBottom = false }: { children: React.ReactNode; padBottom?: boolean }) {
  return (
    <div className="flex min-h-full flex-col">
      <Header wide />
      <main className={`mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12 ${padBottom ? "pb-32" : ""}`}>
        {children}
      </main>
    </div>
  );
}

// ---------- etapas ----------

function NextStep({
  step,
  job,
  hasScript,
  noNarration,
  renderable,
  busy,
  dirty,
  onGenerateScript,
  onNarration,
  onQueue,
  onUnqueue,
}: {
  step: number;
  job: VideoJobDTO;
  hasScript: boolean;
  noNarration: boolean;
  renderable: boolean;
  busy: Busy;
  dirty: boolean;
  onGenerateScript: () => void;
  onNarration: () => void;
  onQueue: () => void;
  onUnqueue: () => void;
}) {
  const hasNarration = noNarration || Boolean(job.narrationUrl);
  const done = job.status === "done" && Boolean(job.videoUrl);


  let title: string;
  let body: React.ReactNode = null;
  let action: React.ReactNode = null;
  const savingNote = dirty ? " Suas alterações são salvas antes." : "";

  if (!hasScript) {
    title = "Gerar o roteiro";
    action = (
      <button type="button" onClick={onGenerateScript} disabled={busy !== null} className={`w-full ${primaryButton}`}>
        {busy === "script" && <Spinner />} {busy === "script" ? "Gerando roteiro…" : "Gerar roteiro"}
      </button>
    );
  } else if (!hasNarration) {
    title = "Revise o roteiro e gere a narração";
    body = `Edite o que quiser nas cenas; a narração usa o texto atual. Depois você ouve a voz e manda para o render.${savingNote}`;
    action = (
      <button type="button" onClick={onNarration} disabled={busy !== null} className={`w-full ${primaryButton}`}>
        {busy === "narration" ? <Spinner /> : <Icon name="mic" className="h-4 w-4" />}
        {busy === "narration" ? "Gerando narração…" : "Gerar narração"}
      </button>
    );
  } else if (job.status === "queued") {
    title = "Na fila de render";
    body = "O worker pega o vídeo em instantes. Você pode sair desta página.";
    action = (
      <button type="button" onClick={onUnqueue} disabled={busy !== null} className={`w-full ${secondaryButton}`}>
        Tirar da fila
      </button>
    );
  } else if (job.status === "rendering") {
    const p = job.progress ?? 0;
    title = "Renderizando o vídeo";
    body = (
      <>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={p}
          aria-label="Progresso do render"
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-accent-yellow transition-[width] duration-700" style={{ width: `${Math.max(3, p)}%` }} />
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          <span className="tabular-nums">{p}%</span> · leva alguns minutos. Você pode sair desta página.
        </p>
      </>
    );
  } else if (done) {
    title = "Vídeo pronto";
    body = "Assista e baixe no card do vídeo. A legenda do post está no fim do roteiro.";
    action = (
      <a href={job.videoUrl!} download className={`w-full ${primaryButton}`}>
        <Icon name="download" className="h-4 w-4" /> Baixar mp4
      </a>
    );
  } else if (!renderable) {
    title = "Estilo removido";
    body = "O estilo deste vídeo foi excluído, então ele não pode mais ir para o render.";
  } else {
    title = job.status === "failed" ? "O render falhou. Tente de novo" : noNarration ? "Envie para o render" : "Ouça a narração e envie para o render";
    body = `Se a voz estiver boa, envie: o servidor gera as imagens, a trilha e monta o mp4 (alguns minutos). Se não, ajuste o roteiro e gere a narração de novo.${savingNote}`;
    action = (
      <button type="button" onClick={onQueue} disabled={busy !== null} className={`w-full ${primaryButton}`}>
        {busy === "queue" ? <Spinner /> : <Icon name="arrow" className="h-4 w-4" />}
        {busy === "queue" ? "Enviando…" : "Enviar para render"}
      </button>
    );
  }

  return (
    <section className={`${cardClass} border-accent-yellow/30`} aria-label="O que fazer agora">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-yellow">
        {done ? "Concluído" : `Passo ${step + 1} de ${FLOW_STEPS.length} · ${FLOW_STEPS[step].label}`}
      </p>
      <p className="mt-1 font-semibold">{title}</p>
      {typeof body === "string" ? <p className="mt-1 text-sm text-text-secondary">{body}</p> : body}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

// ---------- pronúncias ----------

function PronunciationEditor({
  script,
  fixed,
  disabled,
  onChange,
}: {
  script: VideoScript;
  /** Dicionário fixo + pronúncias da pessoa e da empresa deste vídeo. */
  fixed: Pronunciation[];
  disabled: boolean;
  onChange: (p: VideoScript["pronunciations"]) => void;
}) {
  const list = script.pronunciations;
  return (
    <details className="group mt-4">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-foreground">
        <span aria-hidden className="transition group-open:rotate-90">›</span>
        Pronúncias ({fixed.length} fixas e dos perfis + {list.length} deste vídeo)
      </summary>
      <p className="mt-1 text-xs text-text-secondary">
        Fixas e dos perfis: {fixed.map((p) => `${p.display} → ${p.spoken}`).join(" · ")}
      </p>
      <div className="mt-3 space-y-2">
        {list.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={p.display}
              aria-label="Como aparece na legenda"
              placeholder="Como aparece"
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, display: e.target.value } : x)))}
              disabled={disabled}
              className={fieldClass}
            />
            <input
              value={p.spoken}
              aria-label="Como a voz fala"
              placeholder="Como falar"
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, spoken: e.target.value } : x)))}
              disabled={disabled}
              className={fieldClass}
            />
            <button
              type="button"
              aria-label={`Remover pronúncia ${p.display || i + 1}`}
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              disabled={disabled}
              className={`shrink-0 ${iconButton}`}
            >
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...list, { display: "", spoken: "" }])}
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-accent-yellow hover:underline disabled:opacity-50"
        >
          <Icon name="plus" /> Adicionar pronúncia
        </button>
      </div>
    </details>
  );
}

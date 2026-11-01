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

  const stepBar = (
    <StepBar
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
      onSave={save}
      onDiscard={discard}
    />
  );

  return (
    <Shell top={stepBar}>
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
          {pattern?.kind === "free" && <FreeStyleSummary spec={script?.styleSpec} notes={job.styleNotes} />}
        </div>
        <StatusBadge status={job.status} progress={job.progress} />
      </div>

      {(error || job.error) && (
        <div role="alert" className="mt-5 flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{error || job.error}</span>
        </div>
      )}


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

function Shell({ children, top }: { children: React.ReactNode; top?: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <Header wide />
      {top}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}

// ---------- etapas ----------

/**
 * Controlador de etapas: cartão flutuando no rodapé com as 5 etapas, a instrução da etapa atual e o
 * botão do próximo passo (que brilha na hora de enviar para o render). Com alterações não salvas,
 * ganha uma linha com Descartar/Salvar. Substitui a trilha solta, a caixa "o que fazer agora" e a
 * barra de salvar antiga.
 */
function StepBar({
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
  onSave,
  onDiscard,
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
  onSave: () => void;
  onDiscard: () => void;
}) {
  const hasNarration = noNarration || Boolean(job.narrationUrl);
  const done = job.status === "done" && Boolean(job.videoUrl);
  const savingNote = dirty ? " Suas alterações são salvas antes." : "";
  const actionClass = "w-full sm:w-auto";

  let title: string;
  let hint = "";
  let action: React.ReactNode = null;
  let progress: number | null = null;

  if (!hasScript) {
    title = "Gerar o roteiro";
    hint = "A IA escreve as cenas a partir do tema; depois você revisa.";
    action = (
      <button type="button" onClick={onGenerateScript} disabled={busy !== null} className={`${actionClass} ${primaryButton}`}>
        {busy === "script" ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />}
        {busy === "script" ? "Gerando roteiro…" : "Gerar roteiro"}
      </button>
    );
  } else if (!hasNarration) {
    title = "Revise as cenas e gere a narração";
    hint = `Edite o que quiser; a narração usa o texto atual.${savingNote}`;
    action = (
      <button type="button" onClick={onNarration} disabled={busy !== null} className={`${actionClass} ${primaryButton}`}>
        {busy === "narration" ? <Spinner /> : <Icon name="mic" className="h-4 w-4" />}
        {busy === "narration" ? "Gerando narração…" : "Gerar narração"}
      </button>
    );
  } else if (job.status === "queued") {
    title = "Na fila de render";
    hint = "O servidor pega o vídeo em instantes. Você pode sair desta página.";
    action = (
      <button type="button" onClick={onUnqueue} disabled={busy !== null} className={`${actionClass} ${secondaryButton}`}>
        Tirar da fila
      </button>
    );
  } else if (job.status === "rendering") {
    progress = job.progress ?? 0;
    title = `Renderizando · ${progress}%`;
    hint = "O servidor está montando o mp4 (alguns minutos). Você pode sair desta página.";
  } else if (done) {
    title = "Vídeo pronto";
    hint = "Assista no card do vídeo. A legenda do post está no roteiro.";
    action = (
      <a href={job.videoUrl!} download className={`${actionClass} ${primaryButton}`}>
        <Icon name="download" className="h-4 w-4" /> Baixar mp4
      </a>
    );
  } else if (!renderable) {
    title = "Estilo removido";
    hint = "O estilo deste vídeo foi excluído, então ele não pode mais ir para o render.";
  } else {
    title = job.status === "failed" ? "O render falhou. Tente de novo" : noNarration ? "Envie para o render" : "Ouça a narração e envie para o render";
    hint = `Se a voz estiver boa, envie: o servidor gera as imagens, a trilha e monta o mp4. Se não, ajuste e gere de novo.${savingNote}`;
    action = (
      <button type="button" onClick={onQueue} disabled={busy !== null} className={`${actionClass} ${primaryButton} btn-glow`}>
        {busy === "queue" ? <Spinner /> : <Icon name="arrow" className="h-4 w-4" />}
        {busy === "queue" ? "Enviando…" : "Enviar para render"}
      </button>
    );
  }

  const stateOf = (i: number) => (done || i < step ? "done" : i === step ? "current" : "todo");
  const skipped = (i: number) => noNarration && i === 2;

  return (
    <section
      aria-label="Etapas do vídeo"
      className="sticky top-[69px] z-[9] w-full border-b-2 border-accent-yellow bg-surface shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
    >
      <div className="bg-accent-yellow text-accent-yellow-ink">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]">
          <Icon name="scenes" className="h-3.5 w-3.5" /> Controle de etapas
        </p>
        <p className="text-[11px] font-medium opacity-90">
          {done ? "Tudo pronto" : <>Siga na ordem<span className="hidden sm:inline">: termine esta etapa para liberar a próxima</span> →</>}
        </p>
      </div>
      </div>
      <div className="mx-auto w-full max-w-6xl">
      {dirty && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/60 px-4 py-2 sm:px-6">
          <p className="text-xs font-medium sm:text-sm">
            <span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-full bg-warning align-middle" />
            Alterações não salvas
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onDiscard} disabled={busy !== null} className={`!min-h-9 !px-3 !text-xs ${secondaryButton}`}>
              Descartar
            </button>
            <button type="button" onClick={onSave} disabled={busy !== null} className={`!min-h-9 !px-3 !text-xs ${secondaryButton}`}>
              {busy === "save" && <Spinner />}
              {busy === "save" ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
      <div className="flex w-full flex-col gap-2.5 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-6">
        {/* celular: passo + barrinhas */}
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-yellow">
            {done ? "Concluído" : `Passo ${step + 1} de ${FLOW_STEPS.length} · ${FLOW_STEPS[step].label}`}
          </p>
          <span aria-hidden className="flex gap-1">
            {FLOW_STEPS.map((s, i) => (
              <span
                key={s.label}
                className={`h-1.5 w-4 rounded-full ${skipped(i) ? "bg-border" : stateOf(i) === "done" ? "bg-success" : stateOf(i) === "current" ? "bg-accent-yellow" : "bg-border"}`}
              />
            ))}
          </span>
        </div>
        {/* desktop: etapas em pílulas */}
        <ol className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {FLOW_STEPS.map((s, i) => {
            const st = stateOf(i);
            const skip = skipped(i);
            return (
              <li key={s.label} className="flex items-center gap-1.5" aria-current={st === "current" && !done ? "step" : undefined}>
                {i > 0 && <span aria-hidden className={`h-0.5 w-4 ${st === "todo" ? "bg-border" : "bg-success/50"}`} />}
                <span
                  className={`flex items-center gap-1.5 text-[13px] ${
                    st === "current" && !skip
                      ? "rounded-full border border-accent-yellow/30 bg-accent-yellow/[0.06] py-0.5 pl-0.5 pr-3 font-semibold text-accent-yellow"
                      : st === "done" && !skip
                        ? "font-medium text-success"
                        : "text-text-secondary"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                      skip
                        ? "border-2 border-dashed border-border"
                        : st === "done"
                          ? "bg-success text-background"
                          : st === "current"
                            ? "bg-accent-yellow text-accent-yellow-ink"
                            : "border-2 border-border-hover"
                    }`}
                  >
                    {st === "done" && !skip ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {s.label}
                  <span className="sr-only">
                    {skip ? " (não se aplica)" : st === "done" ? " (concluída)" : st === "current" ? " (etapa atual)" : " (próxima)"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <span aria-hidden className="hidden w-px self-stretch bg-border lg:block" />
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-sm font-semibold">{title}</p>
          {hint && <p className="mt-0.5 hidden text-xs text-text-secondary sm:block">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {progress !== null && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Progresso do render"
          className="h-1 bg-surface-2"
        >
          <div className="h-full bg-accent-yellow transition-[width] duration-700" style={{ width: `${Math.max(3, progress)}%` }} />
        </div>
      )}
      </div>
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

/** Estilo livre: mostra o visual que a IA montou (paleta, fontes, movimento) e o direcionamento do usuário. */
function FreeStyleSummary({ spec, notes }: { spec: Record<string, unknown> | undefined; notes: string | null }) {
  const group = (name: string) => ((spec?.[name] ?? {}) as Record<string, unknown>);
  const palette = group("palette");
  const colors = ["background", "text", "accent", "accentText"]
    .map((k) => palette[k])
    .filter((c): c is string => typeof c === "string" && /^#?[0-9a-f]{6}$/i.test(c))
    .map((c) => (c.startsWith("#") ? c : `#${c}`));
  const details = [
    typeof spec?.archetype === "string" && spec.archetype,
    group("title").font && `título ${group("title").font}`,
    group("transition").kind && `transição ${group("transition").kind}`,
    group("motion").energy && `energia ${group("motion").energy}`,
  ].filter(Boolean);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
      <span className="inline-flex items-center gap-1 font-medium text-accent-yellow">
        <Icon name="sparkles" className="h-3.5 w-3.5" /> Estilo criado pela IA
      </span>
      {spec ? (
        <>
          {colors.length > 0 && (
            <span className="inline-flex items-center gap-1" aria-label={`Paleta: ${colors.join(", ")}`}>
              {colors.map((c, i) => (
                <span key={i} className="h-4 w-4 rounded-full ring-1 ring-border" style={{ background: c }} />
              ))}
            </span>
          )}
          {details.length > 0 && <span>{details.join(" · ")}</span>}
        </>
      ) : (
        <span>sai junto com o roteiro</span>
      )}
      {notes && (
        <span className="w-full line-clamp-2 [overflow-wrap:anywhere]" title={notes}>
          Seu direcionamento: {notes}
        </span>
      )}
    </div>
  );
}

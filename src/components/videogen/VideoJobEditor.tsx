"use client";

import { CoverPreview, PublishPanel } from "./PublishPanel";
import { ScriptLoader } from "./ScriptLoader";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { uploadImage } from "@/lib/videogen/uploadImage";
import {
  MAX_BRIEFING_IMAGES,
  WORDS_PER_SECOND,
  fullNarration,
  type BriefingImage,
  type Pronunciation,
  type VideoScene,
  type VideoScript,
} from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";

type Busy = null | "save" | "script" | "narration" | "queue" | "preview" | "delete" | "storyboard";

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
      // Terminou: recarrega tudo (o worker grava no roteiro as imagens e a trilha que gerou).
      if (data.job && data.job.status !== "queued" && data.job.status !== "rendering") applyJob(data.job);
      else setJob(data.job);
    }, 5000);
    return () => clearInterval(timer);
  }, [polling, id, applyJob]);

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
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        // resposta sem JSON (tempo esgotado, erro da plataforma): mostra o que veio de verdade
        const detail = text.trim().replace(/\s+/g, " ").slice(0, 160);
        data = { error: `O servidor respondeu HTTP ${res.status}${detail ? `: ${detail}` : " sem conteúdo"}.` };
      }
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

  const [boardScene, setBoardScene] = useState<number | null>(null);
  async function generateStoryboard(scene?: number, action?: "next_video" | "use_image") {
    if (dirty && !(await save())) return;
    setBoardScene(scene ?? null);
    const data = await call("storyboard", `/api/videogen/jobs/${id}/storyboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scene === undefined ? {} : { scene, action }),
    });
    setBoardScene(null);
    if (data?.job) applyJob(data.job);
    if (data?.error) setError(data.error);
  }

  async function queue(remove = false, mode?: "preview") {
    if (!remove && dirty && !(await save())) return;
    const data = await call(mode === "preview" ? "preview" : "queue", `/api/videogen/jobs/${id}/queue`, {
      method: remove ? "DELETE" : "POST",
      ...(mode ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) } : {}),
    });
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
  /**
   * Storyboard: põe uma imagem enviada pelo usuário na cena. A foto antiga da cena sai do briefing se nenhuma outra cena
   * (nem o fecho) usa, para caber no limite. Devolve uma mensagem de erro, se não couber.
   */
  function setSceneImage(index: number, url: string): string | null {
    if (!script) return null;
    const old = script.scenes[index]?.imageUrl;
    const usedElsewhere =
      !old ||
      script.scenes.some((sc, i) => i !== index && sc.imageUrl === old) ||
      script.cta.imageUrl === old ||
      script.cta.logoUrl === old;
    const base = usedElsewhere ? briefing : briefing.filter((b) => b.url !== old);
    if (!base.some((b) => b.url === url) && base.length >= MAX_BRIEFING_IMAGES) {
      return `Limite de ${MAX_BRIEFING_IMAGES} imagens suas por vídeo. Tire alguma nas imagens do briefing.`;
    }
    setBriefing(base.some((b) => b.url === url) ? base : [...base, { url }]);
    updateScene(index, { imageUrl: url, ...(script.scenes[index]?.layout === "text_only" ? { layout: undefined } : {}) });
    return null;
  }

  /** Storyboard: volta a cena para imagem gerada pela IA (a foto continua nas imagens do briefing). */
  function backToGenerated(index: number) {
    const sc = script?.scenes[index];
    if (!sc) return;
    updateScene(index, { imageUrl: undefined, ...(sc.imagePrompt.trim() ? {} : { imagePrompt: sc.visual || sc.narration }) });
  }

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
      onPreview={() => queue(false, "preview")}
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
            {profileLine} · {pattern ? pattern.nome : stylesLoaded ? "Estilo removido" : "…"} · alvo {job.durationS}s{job.format === "16:9" ? " · horizontal 16:9 (YouTube)" : ""}
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
        <Storyboard
          scenes={script.scenes}
          landscape={job.format === "16:9"}
          disabled={disabled}
          busy={busy === "storyboard"}
          busyScene={boardScene}
          onGenerate={generateStoryboard}
          onUpload={setSceneImage}
          onUseGenerated={backToGenerated}
        />
      )}

      {script?.hooks && script.hooks.length > 1 && script.scenes[0] && (
        <HookPicker
          hooks={script.hooks}
          current={script.scenes[0]}
          disabled={disabled}
          onPick={(h) => updateScene(0, { narration: h.narration, onScreen: h.onScreen })}
        />
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
            landscape={job.format === "16:9"}
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
            {job.previewUrl && !locked && !(job.status === "done" && job.videoUrl) && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  <Icon name="play" className="h-3.5 w-3.5" /> Prévia rápida
                  <span className="font-normal normal-case tracking-normal">(menos fluida, sem trilha)</span>
                </p>
                <video
                  controls
                  preload="metadata"
                  src={job.previewUrl}
                  className={`mx-auto ${job.format === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[60dvh]"} w-full rounded-xl bg-black object-contain`}
                />
                <p className="mt-2 text-xs text-text-secondary">Gostou? Envie para o render final no card de etapas: ele reaproveita as imagens da prévia.</p>
              </div>
            )}
            {job.status === "done" && job.videoUrl ? (
              <div className="mt-4">
                <video
                  controls
                  preload="metadata"
                  src={job.videoUrl}
                  className={`mx-auto ${job.format === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[70dvh]"} w-full rounded-xl bg-black object-contain`}
                />
                <a href={job.videoUrl} download className={`mt-4 w-full ${primaryButton} !bg-foreground !text-background hover:!bg-foreground/85`}>
                  <Icon name="download" className="h-4 w-4" /> Baixar mp4
                </a>
                <button type="button" onClick={() => queue()} disabled={disabled} className={`mt-2 w-full ${secondaryButton}`}>
                  {busy === "queue" ? <Spinner /> : <Icon name="refresh" className="h-4 w-4" />}
                  Renderizar de novo
                </button>
                <CoverPreview job={job} />
                <PublishPanel key={job.videoUrl} job={job} />
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
  onPreview,
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
  onPreview: () => void;
  onUnqueue: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const hasNarration = noNarration || Boolean(job.narrationUrl);
  const done = job.status === "done" && Boolean(job.videoUrl);
  const savingNote = dirty ? " Suas alterações são salvas antes." : "";
  const actionClass = "w-full sm:w-auto";
  // Botão principal em tinta (preto no claro, claro no escuro): o vermelho sai da faixa.
  const ink = "!bg-foreground !text-background hover:!bg-foreground/85 btn-glow";

  let title: string;
  let hint = "";
  let action: React.ReactNode = null;
  let progress: number | null = null;

  if (!hasScript) {
    title = "Gerar o roteiro";
    hint = "A IA escreve as cenas a partir do tema; depois você revisa.";
    action = (
      <button type="button" onClick={onGenerateScript} disabled={busy !== null} aria-busy={busy === "script"} className={`${actionClass} ${primaryButton} ${ink}`}>
        {busy === "script" ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />}
        {busy === "script" ? "Gerando roteiro…" : "Gerar roteiro"}
      </button>
    );
  } else if (!hasNarration) {
    title = "Revise as cenas e gere a narração";
    hint = `Edite o que quiser; a narração usa o texto atual.${savingNote}`;
    action = (
      <button type="button" onClick={onNarration} disabled={busy !== null} aria-busy={busy === "narration"} className={`${actionClass} ${primaryButton} ${ink}`}>
        {busy === "narration" ? <Spinner /> : <Icon name="mic" className="h-4 w-4" />}
        {busy === "narration" ? "Gerando narração…" : "Gerar narração"}
      </button>
    );
  } else if (job.status === "queued") {
    title = job.renderMode === "preview" ? "Prévia na fila" : "Na fila de render";
    hint = "O servidor pega o vídeo em instantes. Você pode sair desta página.";
    action = (
      <button type="button" onClick={onUnqueue} disabled={busy !== null} className={`${actionClass} ${secondaryButton}`}>
        Tirar da fila
      </button>
    );
  } else if (job.status === "rendering") {
    progress = job.progress ?? 0;
    if (job.renderMode === "preview") {
      title = `Gerando a prévia · ${progress}%`;
      hint = "Versão rápida para conferir ritmo e cortes: menos fluida e sem trilha. As imagens geradas ficam para o render final.";
    } else {
      title = `Renderizando · ${progress}%`;
      hint = "O servidor está montando o mp4 (alguns minutos). Você pode sair desta página.";
    }
  } else if (done) {
    title = "Vídeo pronto";
    hint = "Assista no card do vídeo. A legenda do post está no roteiro.";
    action = (
      <a href={job.videoUrl!} download className={`${actionClass} ${primaryButton} ${ink}`}>
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onPreview}
          disabled={busy !== null}
          title="Render rápido para conferir ritmo e cortes (menos fluido, sem trilha). As imagens ficam para o render final."
          className={`${actionClass} ${secondaryButton} bg-background/70`}
        >
          {busy === "preview" ? <Spinner /> : <Icon name="play" className="h-4 w-4" />}
          {busy === "preview" ? "Enviando…" : "Prévia rápida"}
        </button>
        <button type="button" onClick={onQueue} disabled={busy !== null} aria-busy={busy === "queue"} className={`${actionClass} ${primaryButton} ${ink}`}>
          {busy === "queue" ? <Spinner /> : <Icon name="arrow" className="h-4 w-4" />}
          {busy === "queue" ? "Enviando…" : "Enviar para render"}
        </button>
      </div>
    );
  }

  const stateOf = (i: number) => (done || i < step ? "done" : i === step ? "current" : "todo");
  const skipped = (i: number) => noNarration && i === 2;
  // Quanto do segmento da etapa atual já foi feito (no render, o progresso real).
  const currentFill = progress !== null ? Math.max(8, progress) : job.status === "queued" ? 15 : 50;

  // Visual "Areia" (escolhido pelo Rodrigo no Claude Design): faixa bege, quase sem vermelho;
  // verde quando o vídeo fica pronto. Cores próprias para o tema escuro (classes escritas por
  // extenso: o Tailwind só gera o que aparece literal no código).
  const band = done
    ? `border-[#cfdecd] bg-[#e6efe5] [[data-theme=dark]_&]:border-[#2a3d2e] [[data-theme=dark]_&]:bg-[#17231a]`
    : `border-[#e2d9c6] bg-[#efe8da] [[data-theme=dark]_&]:border-[#3a3428] [[data-theme=dark]_&]:bg-[#221f19]`;
  const muted = done ? `text-[#2e5b3d] [[data-theme=dark]_&]:text-[#9fd3ad]` : `text-[#5d5a52] [[data-theme=dark]_&]:text-[#bdb4a2]`;
  const faint = `text-[#7d786c] [[data-theme=dark]_&]:text-[#9a917f]`;
  const track = `bg-[#d8cfbc] [[data-theme=dark]_&]:bg-[#4a4335]`;
  const filled = done ? `bg-[#2f7d4f] [[data-theme=dark]_&]:bg-[#4caf72]` : "bg-foreground";

  return (
    <section aria-label="Etapas do vídeo" className={`sticky top-[69px] z-[9] w-full border-y ${band} shadow-[0_10px_24px_-14px_rgba(0,0,0,0.25)]`}>
      {dirty && (
        <div className={`border-b ${done ? "border-[#cfdecd]" : "border-[#e2d9c6]"} [[data-theme=dark]_&]:border-[#3a3428]`}>
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
            <p className={`flex items-center gap-2 text-xs font-medium text-[#8a5a00] [[data-theme=dark]_&]:text-[#f5c46b]`}>
              <span aria-hidden className={`h-2 w-2 rounded-full bg-[#d99a12] [[data-theme=dark]_&]:bg-[#f5b941]`} />
              Alterações não salvas
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onDiscard}
                disabled={busy !== null}
                className="inline-flex min-h-9 items-center px-2.5 text-xs font-medium text-foreground underline underline-offset-[3px] transition hover:opacity-70 disabled:opacity-40"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={busy !== null}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8cfbc] bg-background px-3.5 text-xs font-semibold text-foreground transition hover:border-foreground disabled:opacity-40 [[data-theme=dark]_&]:border-[#4a4335]`}
              >
                {busy === "save" && <Spinner />}
                {busy === "save" ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:gap-8">
        {/* trilho de etapas */}
        <div className="w-full shrink-0 lg:w-[420px]">
          <div aria-hidden className="grid grid-cols-5 gap-1">
            {FLOW_STEPS.map((s, i) => {
              const st = stateOf(i);
              return (
                <span key={s.label} className={`relative h-[5px] overflow-hidden rounded-full ${track} ${skipped(i) ? "opacity-40" : ""}`}>
                  {st === "done" && !skipped(i) && <span className={`absolute inset-0 ${filled}`} />}
                  {st === "current" && !done && <span className={`absolute inset-y-0 left-0 ${filled} transition-[width] duration-700`} style={{ width: `${currentFill}%` }} />}
                </span>
              );
            })}
          </div>
          <ol className="mt-2 grid grid-cols-5 gap-1 text-[11px] sm:text-xs">
            {FLOW_STEPS.map((s, i) => {
              const st = stateOf(i);
              const skip = skipped(i);
              const current = st === "current" && !done;
              return (
                <li
                  key={s.label}
                  aria-current={current ? "step" : undefined}
                  className={`flex min-w-0 items-center gap-1.5 truncate ${
                    current ? "font-bold text-foreground" : done && i === FLOW_STEPS.length - 1 ? `font-bold ${muted}` : st === "done" ? muted : faint
                  } ${skip ? "line-through opacity-60" : ""}`}
                >
                  {current && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-yellow" />}
                  {s.label}
                  <span className="sr-only">
                    {skip ? " (não se aplica)" : st === "done" ? " (concluída)" : current ? " (etapa atual)" : " (próxima)"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${done ? muted : `text-[#6f6a5e] [[data-theme=dark]_&]:text-[#a89f8c]`}`}>
            {done ? "Concluído" : `Passo ${step + 1} de ${FLOW_STEPS.length}`}
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug">{title}</p>
          {hint && <p className={`mt-0.5 hidden text-xs sm:block ${muted}`}>{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {progress !== null && (
        <div className="mx-auto w-full max-w-6xl px-2 pb-2 sm:px-4">
          <ScriptLoader progress={Math.max(3, progress)} label="Progresso do render" height={30} showLabel={false} />
        </div>
      )}
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

/** Gancho: as aberturas que a IA escreveu; escolher uma troca a fala e o texto da cena 1. */
function HookPicker({
  hooks,
  current,
  disabled,
  onPick,
}: {
  hooks: { narration: string; onScreen: string }[];
  current: VideoScene;
  disabled: boolean;
  onPick: (h: { narration: string; onScreen: string }) => void;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="hooks-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="hooks-title" className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="sparkles" className="h-4 w-4 text-accent-yellow" /> Gancho: escolha a abertura
        </h2>
        <p className="text-xs text-text-secondary">Os 2 primeiros segundos decidem se a pessoa fica. Trocar aqui muda a cena 1.</p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Aberturas">
        {hooks.map((h, i) => {
          const active = h.narration === current.narration;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onPick(h)}
              className={`min-h-11 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                active ? "border-accent-yellow bg-accent-yellow/5" : "border-border hover:border-border-hover"
              }`}
            >
              <span className="block text-sm font-medium">&ldquo;{h.narration}&rdquo;</span>
              {h.onScreen && <span className="mt-1 block text-xs text-text-secondary">Na tela: {h.onScreen}</span>}
              {active && <span className="mt-1.5 inline-block text-[11px] font-semibold uppercase tracking-wide text-accent-yellow">em uso</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Storyboard: a imagem de cada cena antes do render, com "gerar de novo" por cena. */
function Storyboard({
  scenes,
  landscape,
  disabled,
  busy,
  busyScene,
  onGenerate,
  onUpload,
  onUseGenerated,
}: {
  scenes: VideoScene[];
  landscape?: boolean;
  disabled: boolean;
  busy: boolean;
  busyScene: number | null;
  onGenerate: (scene?: number, action?: "next_video" | "use_image") => void;
  onUpload: (scene: number, url: string) => string | null;
  onUseGenerated: (scene: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function pick(i: number) {
    setTarget(i);
    setUploadError(null);
    fileRef.current?.click();
  }

  async function upload(file: File | undefined) {
    if (!file || target === null) return;
    const i = target;
    setUploading(i);
    try {
      const url = await uploadImage(file, "briefing");
      const problem = onUpload(i, url);
      if (problem) setUploadError(problem);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const needs = scenes.filter((sc) => !sc.imageUrl && !sc.stock && sc.layout !== "text_only" && sc.imagePrompt.trim());
  const missing = needs.filter((sc) => !(sc.preview && sc.preview.prompt === sc.imagePrompt)).length;
  const pendingStock = scenes.filter((sc) => sc.stockQuery && !sc.stock && !sc.imageUrl).length;
  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="board-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="board-title" className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon name="image" className="h-4 w-4 text-accent-yellow" /> Storyboard
            <span className="font-normal text-text-secondary">(opcional)</span>
          </h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            Veja as imagens antes do render e gere de novo só as que não gostou. O render usa estas imagens e guarda aqui as que gerar,
            então ao renderizar de novo só as cenas alteradas ganham imagem nova (a trilha também é reaproveitada).
            {scenes.some((sc) => sc.stock) && (
              <> Vídeos de banco: {[...new Set(scenes.map((sc) => sc.stock && (sc.stock.source === "pexels" ? "Pexels" : "Pixabay")).filter(Boolean))].join(" e ")}.</>
            )}
          </p>
        </div>
        {(missing > 0 || pendingStock > 0) && (
          <button type="button" onClick={() => onGenerate()} disabled={disabled} className={secondaryButton}>
            {busy && busyScene === null ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />}
            {busy && busyScene === null
              ? "Gerando imagens…"
              : missing === 0
                ? "Buscar vídeos de banco"
                : `${missing === needs.length ? "Gerar storyboard" : `Gerar ${missing} que faltam`} (≈ US$ ${(missing * 0.04).toFixed(2).replace(".", ",")})`}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {uploadError && (
        <p role="alert" className="mt-3 rounded-lg bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          {uploadError}
        </p>
      )}
      <ol className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {scenes.map((sc, i) => {
          const fresh = Boolean(sc.preview && sc.preview.prompt === sc.imagePrompt);
          const src = sc.imageUrl || sc.stock?.thumb || sc.preview?.url;
          const generated = !sc.imageUrl && !sc.stock && sc.layout !== "text_only" && Boolean(sc.imagePrompt.trim());
          const working = uploading === i || (busy && (busyScene === i || (busyScene === null && generated && !fresh)));
          return (
            <li key={i} className={`shrink-0 snap-start ${landscape ? "w-[176px] sm:w-[208px]" : "w-[108px] sm:w-[124px]"}`}>
              <div className={`relative overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border ${landscape ? "aspect-video" : "aspect-[9/16]"}`}>
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={`Cena ${i + 1}`} className={`h-full w-full object-cover ${!sc.imageUrl && !fresh ? "opacity-40" : ""}`} />
                )}
                {!src && (
                  <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] text-text-secondary">
                    {sc.layout === "text_only" ? "Só texto" : "Ainda sem imagem"}
                  </span>
                )}
                {working && (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Spinner />
                  </span>
                )}
                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{i + 1}</span>
                {sc.stock && (
                  <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-md bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold text-accent-yellow-ink">
                    <Icon name="film" className="h-3 w-3" /> vídeo
                  </span>
                )}
                {sc.preview && !fresh && !sc.imageUrl && !sc.stock && (
                  <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-warning/90 px-1 py-0.5 text-center text-[10px] font-medium text-black">
                    prompt mudou
                  </span>
                )}
              </div>
              {sc.imageUrl ? (
                <div className="mt-1 grid gap-0.5">
                  <p className="text-center text-[11px] text-text-secondary">Sua foto</p>
                  <button
                    type="button"
                    onClick={() => onUseGenerated(i)}
                    disabled={disabled}
                    className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-accent-yellow hover:bg-accent-yellow/10 disabled:opacity-50"
                  >
                    <Icon name="sparkles" className="h-3.5 w-3.5" /> Gerar com IA
                  </button>
                </div>
              ) : sc.stock ? (
                <div className="mt-1 grid gap-0.5">
                  <button
                    type="button"
                    onClick={() => onGenerate(i, "next_video")}
                    disabled={disabled}
                    className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-accent-yellow hover:bg-accent-yellow/10 disabled:opacity-50"
                  >
                    <Icon name="refresh" className="h-3.5 w-3.5" /> Trocar vídeo
                  </button>
                  <button
                    type="button"
                    onClick={() => onGenerate(i, "use_image")}
                    disabled={disabled}
                    className="min-h-8 rounded-lg text-[11px] text-text-secondary hover:bg-surface-2 disabled:opacity-50"
                  >
                    Usar imagem
                  </button>
                </div>
              ) : generated ? (
                <button
                  type="button"
                  onClick={() => onGenerate(i)}
                  disabled={disabled}
                  className="mt-1 inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-accent-yellow hover:bg-accent-yellow/10 disabled:opacity-50"
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" /> {sc.preview ? "Gerar de novo" : "Gerar"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => pick(i)}
                disabled={disabled || uploading !== null}
                className="inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-lg text-[11px] text-text-secondary hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
              >
                <Icon name="image" className="h-3.5 w-3.5" /> {sc.imageUrl ? "Trocar foto" : "Usar foto minha"}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { VoiceSelect } from "@/components/videogen/VoiceSelect";
import { BriefingImages } from "@/components/videogen/BriefingImages";
import { ScriptLoader } from "@/components/videogen/ScriptLoader";
import { TopicAiModal } from "@/components/videogen/TopicAiModal";
import { VoiceCloneModal } from "@/components/videogen/VoiceCloneModal";
import { formatUsd } from "@/components/videogen/CostPanel";
import { mediaDuration } from "@/components/videogen/BaseVideoPanel";
import { Icon, Spinner, StatusBadge, cardClass, fieldClass, iconButton, primaryButton, secondaryButton, sectionTitle } from "@/components/videogen/ui";
import { useVoices } from "@/lib/videogen/useVoices";
import type { VideoPattern } from "@/lib/videogen/patterns";
import { FREE_STYLE_ID } from "@/lib/videogen/freeStyle";
import { useStyles } from "@/lib/videogen/useStyles";
import { useProfiles } from "@/lib/videogen/useProfiles";
import { uploadBaseFile, uploadImage, type BaseKind } from "@/lib/videogen/uploadImage";
import {
  DEFAULT_VOICE_ID,
  DURATION_OPTIONS,
  LANDSCAPE_DURATION_OPTIONS,
  SPEAKER_LABEL,
  WORDS_PER_SECOND,
  type BriefingImage,
  type Speaker,
  type VideoFormat,
  type VideoProfileDTO,
} from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";

const MAX_TOPIC = 2000;
const TRAIN_VOICE = "__treinar-voz__";
const MAX_BATCH = 10;
const noopSubscribe = () => () => {};

/** Os 5 passos da criação. A ordem importa: a resposta de "Quem fala" decide os campos dos passos seguintes. */
const STEPS = [
  { id: "formato", title: "Formato" },
  { id: "quem-fala", title: "Quem fala" },
  { id: "conteudo", title: "Conteúdo" },
  { id: "visual", title: "Visual" },
  { id: "revisao", title: "Revisão" },
] as const;

const SPEAKER_OPTIONS: { id: Speaker; title: string; help: string }[] = [
  { id: "ai_voice", title: "Voz por IA", help: "A IA escreve o roteiro e a voz do perfil narra no ElevenLabs. As cenas mostram imagens." },
  { id: "ai_avatar", title: "Avatar por IA", help: "Igual à voz por IA, e o Higgsfield anima a sua foto falando. Você escolhe, cena a cena, avatar ou imagem." },
  { id: "upload", title: "Submeter áudio / vídeo", help: "Um áudio ou vídeo já gravado. A sua fala vira a narração; não há etapa de voz." },
];

/** Preços de referência para a estimativa da revisão (ordem de grandeza, não cobrança). */
const USD_PER_CREDIT = 22 / 100_000;
const EST = {
  script: 0.08,
  transcriptionPerMin: 0.01,
  narrationPerS: 14 * USD_PER_CREDIT, // ≈ 14 caracteres falados por segundo
  musicPerS: 13.75 * USD_PER_CREDIT,
  image: 0.04,
  secondsPerScene: 4,
};

export default function VideoGenPage() {
  const router = useRouter();
  const { voices, loading: loadingVoices, error: voicesError, addVoice } = useVoices();
  const [trainingVoice, setTrainingVoice] = useState(false);

  // ----- passo 1: formato -----
  const [format, setFormat] = useState<VideoFormat>("9:16");
  const landscape = format === "16:9";

  // ----- passo 2: quem fala -----
  const [speaker, setSpeaker] = useState<Speaker>("ai_voice");
  const { people, companies, loaded: profilesLoaded, setProfiles } = useProfiles();
  // null = ainda não escolheu (usa o perfil padrão); "" = nenhum
  const [chosenPerson, setChosenPerson] = useState<string | null>(null);
  const [chosenCompany, setChosenCompany] = useState<string | null>(null);
  const personId = chosenPerson ?? people.find((p) => p.isDefault)?.id ?? people[0]?.id ?? "";
  const companyId = chosenCompany ?? companies.find((p) => p.isDefault)?.id ?? companies[0]?.id ?? "";
  const person = people.find((p) => p.id === personId);
  const company = companies.find((p) => p.id === companyId);
  // A voz segue a da pessoa até o usuário trocar à mão.
  const [chosenVoice, setChosenVoice] = useState<{ id: string; name: string } | null>(null);
  const voiceId = chosenVoice?.id ?? person?.voiceId ?? DEFAULT_VOICE_ID;
  const voiceName = chosenVoice?.name ?? (person?.voiceId ? person.voiceName || person.name : "Macena");
  // avatar por IA: foto enviada só para este vídeo (senão a do perfil)
  const [avatarPhoto, setAvatarPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const avatarImage = avatarPhoto ?? person?.avatarUrl ?? null;
  // áudio/vídeo enviado
  const [base, setBase] = useState<{ url: string; kind: BaseKind; name: string; durationS: number } | null>(null);
  const [baseUseVideo, setBaseUseVideo] = useState(true);
  const [baseProgress, setBaseProgress] = useState<number | null>(null);
  const baseInput = useRef<HTMLInputElement>(null);

  // ----- passo 3: conteúdo -----
  const [topic, setTopic] = useState("");
  const [topicAi, setTopicAi] = useState(false);
  // vários temas de uma vez: um vídeo (roteiro) por linha
  const [batch, setBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const [extraInstructions, setExtraInstructions] = useState("");
  // /videogen?noticia=<id> (botão "Criar vídeo" da notícia): o roteiro sai da notícia
  const wantedArticle = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("noticia"),
    () => null
  );
  const [article, setArticle] = useState<{ id: string; title: string; subtitle: string; coverImage: string | null } | null>(null);
  const [articleError, setArticleError] = useState<string | null>(null);
  useEffect(() => {
    if (!wantedArticle) return;
    fetch(`/api/articles/${encodeURIComponent(wantedArticle)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.article) throw new Error(data.error || "Notícia não encontrada.");
        setArticle(data.article);
      })
      .catch((err) => setArticleError(err instanceof Error ? err.message : "Notícia não encontrada."));
  }, [wantedArticle]);
  const batchTopics = topic
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH);
  const isBatch = batch && !article && speaker !== "upload";

  // ----- passo 4: visual -----
  const { styles: allStyles, loaded: stylesLoaded, getStyle, removeStyle } = useStyles();
  // Os estilos embutidos antigos só continuam valendo para vídeos já criados; os novos usam os gerados.
  const styles = allStyles.filter((s) => s.kind !== "builtin");
  const [managingStyles, setManagingStyles] = useState(false);
  const [chosenPattern, setPatternId] = useState<string | null>(null);
  // /videogen?estilo=<id> (link "Criar vídeo neste estilo" da tela de templates)
  const wantedPattern = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("estilo"),
    () => null
  );
  const patternId =
    chosenPattern ?? (wantedPattern && styles.some((s) => s.id === wantedPattern) ? wantedPattern : FREE_STYLE_ID);
  const pattern = getStyle(patternId);
  const [styleNotes, setStyleNotes] = useState("");
  const [briefingImages, setBriefingImages] = useState<BriefingImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [durationS, setDurationS] = useState(15);
  const durationOptions = landscape ? LANDSCAPE_DURATION_OPTIONS : DURATION_OPTIONS;

  // ----- navegação entre passos -----
  // `reached` = até que passo a pessoa já chegou; passos depois dele ficam fechados.
  const [reached, setReached] = useState(0);
  const [stepError, setStepError] = useState<Record<number, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ----- lista de vídeos -----
  const [jobs, setJobs] = useState<VideoJobDTO[] | null>(null);
  const [totalJobs, setTotalJobs] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/videogen/jobs?take=${HOME_LIST}`)
      .then((res) => res.json())
      .then((data) => {
        setJobs(data.jobs ?? []);
        setTotalJobs(data.total ?? 0);
      })
      .catch(() => setJobs([]));
  }, []);

  // atualiza a lista enquanto algum vídeo está na fila/renderizando
  const anyRendering = Boolean(jobs?.some((j) => j.status === "queued" || j.status === "rendering"));
  useEffect(() => {
    if (!anyRendering) return;
    const t = setInterval(() => {
      fetch(`/api/videogen/jobs?take=${HOME_LIST}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.jobs) return;
          setJobs(data.jobs);
          setTotalJobs(data.total ?? data.jobs.length);
        })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [anyRendering]);

  /** Troca o formato (o horizontal ganha durações maiores). */
  function chooseFormat(next: VideoFormat) {
    setFormat(next);
    const options = next === "16:9" ? LANDSCAPE_DURATION_OPTIONS : DURATION_OPTIONS;
    if (!options.includes(durationS)) setDurationS(next === "16:9" ? 60 : 15);
  }

  /** O que falta para fechar o passo `i` (null = pode continuar). */
  function problem(i: number): string | null {
    if (i === 1) {
      if (speaker === "ai_avatar" && !avatarImage) return "Envie uma foto para o avatar ou cadastre uma no perfil de quem fala.";
      if (speaker === "upload" && !base) return "Envie o áudio ou o vídeo com a sua fala.";
      if (baseProgress !== null) return "Espere o envio terminar.";
    }
    if (i === 2 && speaker !== "upload" && !article) {
      if (isBatch && batchTopics.length === 0) return "Escreva ao menos um tema (um por linha).";
      if (!isBatch && !topic.trim()) return "Escreva o tema do vídeo.";
    }
    if (i === 3 && uploadingImages) return "Espere as imagens terminarem de enviar.";
    return null;
  }

  function goTo(i: number) {
    document.getElementById(`passo-${STEPS[i].id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function next(i: number) {
    const p = problem(i);
    setStepError((e) => ({ ...e, [i]: p }));
    if (p) return;
    setReached((r) => Math.max(r, i + 1));
    // o passo seguinte só existe no DOM depois do render
    setTimeout(() => goTo(i + 1), 50);
  }

  /** Voltar a um passo anterior: os seguintes continuam abertos (as respostas ficam). */
  function edit(i: number) {
    goTo(i);
  }

  async function pickBase(file: File | undefined) {
    if (!file) return;
    setStepError((e) => ({ ...e, 1: null }));
    try {
      const durationS = await mediaDuration(file);
      setBaseProgress(0);
      const { url, kind } = await uploadBaseFile(file, (p) => setBaseProgress(p));
      setBase({ url, kind, name: file.name, durationS });
    } catch (err) {
      setStepError((e) => ({ ...e, 1: err instanceof Error ? err.message : "Falha ao enviar o arquivo." }));
    } finally {
      setBaseProgress(null);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setUploadingPhoto(true);
    setStepError((e) => ({ ...e, 1: null }));
    try {
      setAvatarPhoto(await uploadImage(file, "perfis"));
    } catch (err) {
      setStepError((e) => ({ ...e, 1: err instanceof Error ? err.message : "Falha ao enviar a foto." }));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function payload(t: string, withImages: boolean) {
    return {
      topic: t,
      patternId,
      voiceId,
      voiceName,
      durationS,
      extraInstructions,
      styleNotes: pattern?.kind === "free" ? styleNotes : "",
      personId: personId || null,
      companyId: companyId || null,
      briefingImages: withImages ? briefingImages : [],
      articleId: article?.id ?? null,
      format,
      speaker,
      avatarImageUrl: speaker === "ai_avatar" ? avatarPhoto : null,
      ...(speaker === "upload" && base
        ? { baseUrl: base.url, baseKind: base.kind, baseDurationS: base.durationS, baseUseVideo: base.kind === "video" && baseUseVideo }
        : {}),
    };
  }

  /** Vários temas: gera um roteiro por linha, um de cada vez, e mostra os vídeos na lista. */
  async function submitBatch() {
    const list = batchTopics;
    setLoading(true);
    setError(null);
    const failed: string[] = [];
    setBatchProgress({ done: 0, total: list.length, failed });
    for (let i = 0; i < list.length; i++) {
      try {
        const res = await fetch("/api/videogen/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // imagens do briefing não vão no lote: o mesmo arquivo em vários vídeos seria apagado junto com o primeiro excluído
          body: JSON.stringify(payload(list[i], false)),
        });
        if (!res.ok) failed.push(list[i]);
      } catch {
        failed.push(list[i]);
      }
      setBatchProgress({ done: i + 1, total: list.length, failed: [...failed] });
    }
    try {
      const data = await (await fetch(`/api/videogen/jobs?take=${HOME_LIST}`)).json();
      setJobs(data.jobs ?? []);
      setTotalJobs(data.total ?? 0);
    } catch {}
    setLoading(false);
    setTopic(failed.join("\n"));
    if (failed.length) setError(`Não deu para gerar ${failed.length} de ${list.length}. Eles ficaram no campo para tentar de novo.`);
    document.getElementById("seus-videos")?.scrollIntoView({ behavior: "smooth" });
  }

  async function create() {
    for (let i = 0; i < 4; i++) {
      const p = problem(i);
      if (p) {
        setStepError((e) => ({ ...e, [i]: p }));
        goTo(i);
        return;
      }
    }
    if (isBatch) return submitBatch();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/videogen/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(topic, true)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o vídeo. Tente de novo.");
      router.push(`/videogen/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado. Tente de novo.");
      setLoading(false);
    }
  }

  /** Exclui o vídeo (com confirmação). Devolve true se excluiu. */
  async function removeJob(job: VideoJobDTO): Promise<boolean> {
    const what = job.videoUrl ? "o vídeo, o roteiro e a narração" : "o roteiro e a narração";
    if (!window.confirm(`Excluir "${job.script?.title || job.topic}"? Isso apaga ${what} de vez.`)) return false;
    setDeleting(job.id);
    setError(null);
    try {
      const res = await fetch(`/api/videogen/jobs/${job.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir.");
      setJobs((list) => (list ?? []).filter((j) => j.id !== job.id));
      setTotalJobs((n) => Math.max(0, n - 1));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      return false;
    } finally {
      setDeleting(null);
    }
  }

  // ----- resumo e estimativa (passo 5) -----
  const effectiveDuration = speaker === "upload" && base ? Math.max(5, Math.round(base.durationS || durationS)) : durationS;
  const scenes = Math.max(2, Math.round(effectiveDuration / EST.secondsPerScene));
  const estimate: { label: string; usd: number | null }[] = [];
  if (speaker === "upload") estimate.push({ label: "transcrição + cenas", usd: EST.script + (EST.transcriptionPerMin * effectiveDuration) / 60 });
  else estimate.push({ label: "roteiro", usd: EST.script });
  if (speaker !== "upload" && !pattern?.semNarracao) estimate.push({ label: "narração", usd: EST.narrationPerS * effectiveDuration });
  if (speaker === "ai_avatar") estimate.push({ label: "avatar (Higgsfield)", usd: null });
  estimate.push({ label: `imagens (≈${scenes} cenas)`, usd: EST.image * scenes });
  estimate.push({ label: "trilha", usd: EST.musicPerS * effectiveDuration });
  const estimateTotal = estimate.reduce((sum, e) => sum + (e.usd ?? 0), 0);
  const perVideo = isBatch ? batchTopics.length || 1 : 1;

  const summaries: (string | null)[] = [
    landscape ? "Horizontal 16:9" : "Vertical 9:16",
    reached > 1
      ? speaker === "upload"
        ? base
          ? `${SPEAKER_LABEL.upload} · ${base.name}`
          : SPEAKER_LABEL.upload
        : `${SPEAKER_LABEL[speaker]} · ${person?.name ?? "—"}`
      : null,
    reached > 2 ? (article ? "Notícia" : isBatch ? `${batchTopics.length} temas` : speaker === "upload" ? (topic.trim() ? "Contexto" : "Sem contexto") : "Tema") : null,
    reached > 3 ? `${pattern?.nome ?? "…"}${speaker === "upload" ? "" : ` · ${effectiveDuration}s`}` : null,
    null,
  ];

  const locked = (i: number) => i > reached;
  const busy = loading;

  return (
    <div className="flex min-h-full flex-col">
      <Header wide />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Novo vídeo</h1>
            <p className="mt-2 text-text-secondary">
              Responda os cinco passos na ordem. Nada é cobrado antes do último.
            </p>
          </div>
          {jobs && jobs.length > 0 && (
            <a href="#seus-videos" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-yellow lg:hidden">
              Seus vídeos ({Math.max(totalJobs, jobs.length)}) <Icon name="down" className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_360px] lg:items-start">
          {/* trilho dos passos */}
          <nav aria-label="Passos" className="lg:sticky lg:top-24">
            <ol className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1.5">
              {STEPS.map((s, i) => {
                const state = i < reached ? "done" : i === reached ? "current" : "todo";
                return (
                  <li key={s.id} className="min-w-0 shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => !locked(i) && goTo(i)}
                      disabled={locked(i)}
                      aria-current={state === "current" ? "step" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed ${
                        state === "current" ? "bg-surface font-semibold ring-1 ring-border" : state === "done" ? "hover:bg-surface" : "text-text-secondary"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          state === "done" ? "bg-success" : state === "current" ? "bg-foreground ring-4 ring-foreground/15" : "bg-border"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {i + 1} · {s.title}
                        </span>
                        {summaries[i] && state === "done" && <span className="hidden truncate text-xs font-normal text-text-secondary lg:block">{summaries[i]}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (reached >= 4) void create();
              else next(reached);
            }}
            noValidate
            className="min-w-0 space-y-5"
            aria-busy={loading}
          >
            {/* ---------- 1 · Formato ---------- */}
            <Step index={0} title="Formato" reached={reached} error={stepError[0]} onNext={next} onEdit={edit} busy={busy}>
              <div role="radiogroup" aria-label="Formato" className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { id: "9:16", title: "Vertical 9:16", hint: "Reels, Shorts e TikTok (padrão)" },
                    { id: "16:9", title: "Horizontal 16:9", hint: "Vídeo normal do YouTube" },
                  ] as const
                ).map((f) => {
                  const active = format === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => chooseFormat(f.id)}
                      disabled={busy}
                      className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        active ? "border-accent-yellow bg-accent-yellow/5" : "border-border hover:border-border-hover"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`shrink-0 rounded-[4px] border-2 ${active ? "border-accent-yellow" : "border-text-secondary/50"} ${
                          f.id === "9:16" ? "h-7 w-4" : "h-4 w-7"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className={`block text-sm ${active ? "font-semibold" : "font-medium"}`}>{f.title}</span>
                        <span className="block text-xs text-text-secondary">{f.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {landscape && (
                <p className="mt-2 text-xs text-text-secondary">
                  No horizontal dá para usar o estilo livre e os seus templates. A imagem fica ao lado do texto nas cenas com card.
                </p>
              )}
            </Step>

            {/* ---------- 2 · Quem fala ---------- */}
            <Step index={1} title="Quem fala no vídeo" reached={reached} error={stepError[1]} onNext={next} onEdit={edit} busy={busy}>
              <div role="radiogroup" aria-label="Quem fala" className="grid gap-2 md:grid-cols-3">
                {SPEAKER_OPTIONS.map((o) => {
                  const active = speaker === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={busy}
                      onClick={() => {
                        setSpeaker(o.id);
                        setStepError((e) => ({ ...e, 1: null }));
                        if (o.id === "upload") setBatch(false);
                      }}
                      className={`flex min-h-24 flex-col gap-1 rounded-xl border p-3 text-left transition ${
                        active ? "border-accent-yellow bg-accent-yellow/5" : "border-border hover:border-border-hover"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Icon name={o.id === "ai_voice" ? "mic" : o.id === "ai_avatar" ? "user" : "up"} className="h-4 w-4 text-accent-yellow" />
                        {o.title}
                      </span>
                      <span className="text-xs text-text-secondary">{o.help}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <ProfileSelect
                  id="person"
                  label={speaker === "upload" ? "Tom de quem fala (perfil)" : "Quem fala"}
                  icon="user"
                  emptyLabel="Nenhuma pessoa cadastrada"
                  profiles={people}
                  value={personId}
                  loaded={profilesLoaded}
                  extraOption={speaker === "upload" ? undefined : { value: TRAIN_VOICE, label: "+ Treinar nova voz…" }}
                  onChange={(id) => {
                    if (id === TRAIN_VOICE) return setTrainingVoice(true);
                    setChosenPerson(id);
                    setChosenVoice(null);
                    setAvatarPhoto(null);
                  }}
                />
                {trainingVoice && (
                  <VoiceCloneModal
                    onClose={() => setTrainingVoice(false)}
                    onCreated={(profile) => {
                      setProfiles((list) => [...list, profile]);
                      if (profile.voiceId) {
                        addVoice({ id: profile.voiceId, name: profile.name, category: "cloned", language: "pt", previewUrl: null });
                      }
                      setChosenPerson(profile.id);
                      setChosenVoice(null);
                    }}
                  />
                )}
                {speaker !== "upload" ? (
                  <div>
                    <label htmlFor="voice" className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon name="mic" className="h-4 w-4 text-text-secondary" /> Voz (ElevenLabs)
                    </label>
                    <div className="mt-2">
                      <VoiceSelect
                        id="voice"
                        voices={voices}
                        value={voiceId}
                        onChange={(v) => setChosenVoice({ id: v.id, name: v.name })}
                        disabled={busy}
                        loading={loadingVoices}
                        error={voicesError}
                      />
                    </div>
                    {person?.voiceId && !chosenVoice && <p className="mt-1.5 text-xs text-text-secondary">Voz do perfil {person.name}.</p>}
                  </div>
                ) : (
                  <p className="self-end text-xs text-text-secondary">Sem seletor de voz: a voz é a da sua gravação. O perfil só dá o tom do texto na tela.</p>
                )}
              </div>

              {speaker === "ai_avatar" && (
                <div className="mt-5 flex items-center gap-4 rounded-xl border border-border bg-background/60 p-3">
                  <span className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
                    {avatarImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarImage} alt="Foto do avatar" className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="user" className="h-6 w-6 text-text-secondary" />
                    )}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">Foto do avatar</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {avatarPhoto
                        ? "Foto enviada só para este vídeo."
                        : avatarImage
                          ? `Foto do perfil ${person?.name ?? ""}. Fica junto da voz em Perfis.`
                          : "O perfil de quem fala não tem foto. Envie uma agora (JPG, PNG ou WebP, rosto de frente)."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => photoInput.current?.click()} disabled={busy || uploadingPhoto} className={`!min-h-9 ${secondaryButton}`}>
                        {uploadingPhoto ? <Spinner /> : <Icon name="up" className="h-4 w-4" />}
                        {avatarImage ? "Usar outra foto" : "Enviar foto"}
                      </button>
                      {avatarPhoto && (
                        <button type="button" onClick={() => setAvatarPhoto(null)} disabled={busy} className="text-xs text-text-secondary hover:text-foreground">
                          Voltar à do perfil
                        </button>
                      )}
                      <Link href="/videogen/perfis" className="inline-flex items-center text-xs font-medium text-accent-yellow hover:underline">
                        Cadastrar no perfil
                      </Link>
                    </div>
                    <input
                      ref={photoInput}
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void pickPhoto(f);
                      }}
                    />
                  </div>
                </div>
              )}

              {speaker === "upload" && (
                <div className="mt-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                    <Icon name={base?.kind === "audio" ? "wave" : "film"} className="h-6 w-6 shrink-0 text-accent-yellow" />
                    <div className="min-w-0 flex-1 text-sm">
                      {base ? (
                        <>
                          <p className="truncate font-medium">{base.name}</p>
                          <p className="text-xs text-text-secondary">
                            {base.kind === "video" ? "Vídeo" : "Áudio"}
                            {base.durationS ? ` · ${formatClock(base.durationS)}` : ""} · a fala é transcrita ao criar o vídeo
                          </p>
                        </>
                      ) : baseProgress !== null ? (
                        <p className="text-xs text-text-secondary" aria-live="polite">
                          Enviando… {Math.round(baseProgress)}%
                        </p>
                      ) : (
                        <>
                          <p className="font-medium">Áudio ou vídeo com a sua fala</p>
                          <p className="text-xs text-text-secondary">MP4, MOV, WebM, MP3, WAV, M4A ou OGG, até 500 MB.</p>
                        </>
                      )}
                    </div>
                    <button type="button" onClick={() => baseInput.current?.click()} disabled={busy || baseProgress !== null} className={`!min-h-9 ${base ? secondaryButton : primaryButton}`}>
                      {baseProgress !== null ? <Spinner /> : <Icon name="up" className="h-4 w-4" />}
                      {base ? "Trocar arquivo" : "Escolher arquivo"}
                    </button>
                    <input
                      ref={baseInput}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,audio/webm"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void pickBase(f);
                      }}
                    />
                  </div>
                  {base?.kind === "video" && (
                    <fieldset>
                      <legend className="text-sm font-medium">Como usar o vídeo</legend>
                      <div role="radiogroup" className="mt-2 grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            { v: true, t: "Vídeo nas cenas", h: "Trilha fixa com você; as imagens entram por cima nas cenas que você marcar." },
                            { v: false, t: "Só o áudio", h: "A fala vira a narração e as cenas mostram as imagens do estilo." },
                          ] as const
                        ).map((o) => (
                          <button
                            key={String(o.v)}
                            type="button"
                            role="radio"
                            aria-checked={baseUseVideo === o.v}
                            onClick={() => setBaseUseVideo(o.v)}
                            disabled={busy}
                            className={`rounded-xl border p-3 text-left transition ${
                              baseUseVideo === o.v ? "border-accent-yellow bg-accent-yellow/5" : "border-border hover:border-border-hover"
                            }`}
                          >
                            <span className="block text-sm font-medium">{o.t}</span>
                            <span className="block text-xs text-text-secondary">{o.h}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                </div>
              )}
            </Step>

            {/* ---------- 3 · Conteúdo ---------- */}
            <Step index={2} title="Conteúdo" reached={reached} error={stepError[2]} onNext={next} onEdit={edit} busy={busy}>
              {speaker === "upload" ? (
                <>
                  <label htmlFor="topic" className="block text-sm font-medium">
                    Contexto <span className="font-normal text-text-secondary">(opcional)</span>
                  </label>
                  <textarea
                    id="topic"
                    maxLength={MAX_TOPIC}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={busy}
                    rows={3}
                    placeholder="Ex.: é um trecho sobre GEO vs. SEO; destacar os 3 números que eu cito"
                    className={`mt-2 resize-y ${fieldClass}`}
                  />
                  <p className="mt-1.5 text-xs text-text-secondary">
                    O conteúdo é a sua fala: ela é transcrita e dividida em cenas, palavra por palavra. Aqui você só diz do que se trata e o que destacar na tela.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor="topic" className="block text-sm font-medium">
                      {article ? (
                        <>
                          Ângulo do vídeo <span className="font-normal text-text-secondary">(opcional)</span>
                        </>
                      ) : isBatch ? (
                        <>Temas</>
                      ) : (
                        <>Tema</>
                      )}
                    </label>
                    <div className="flex items-center gap-3">
                      {!article && !isBatch && (
                        <button
                          type="button"
                          onClick={() => setTopicAi(true)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-yellow hover:underline disabled:opacity-50"
                        >
                          <Icon name="sparkles" className="h-3.5 w-3.5" /> Criar com IA
                        </button>
                      )}
                      {!article && (
                        <button
                          type="button"
                          onClick={() => setBatch((b) => !b)}
                          disabled={busy}
                          aria-pressed={isBatch}
                          className="text-xs font-semibold text-accent-yellow hover:underline disabled:opacity-50"
                        >
                          {isBatch ? "Só um tema" : "Vários temas de uma vez"}
                        </button>
                      )}
                      <span className="text-xs tabular-nums text-text-secondary">
                        {isBatch ? `${batchTopics.length}/${MAX_BATCH} temas` : `${topic.length}/${MAX_TOPIC}`}
                      </span>
                    </div>
                  </div>
                  {topicAi && <TopicAiModal durationS={durationS} onUse={setTopic} onClose={() => setTopicAi(false)} />}
                  {wantedArticle && (article || articleError) && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-accent-yellow/40 bg-accent-yellow/10 p-3">
                      {article?.coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={article.coverImage} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-yellow">
                          {article ? "Vídeo a partir da notícia" : "Notícia"}
                        </p>
                        <p className="truncate text-sm font-semibold">{article ? article.title : articleError}</p>
                      </div>
                      {article && (
                        <button
                          type="button"
                          onClick={() => {
                            setArticle(null);
                            window.history.replaceState(null, "", "/videogen");
                          }}
                          disabled={busy}
                          className="shrink-0 text-xs font-medium text-text-secondary hover:text-foreground"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  )}
                  <textarea
                    id="topic"
                    required={!article}
                    maxLength={isBatch ? MAX_TOPIC * MAX_BATCH : MAX_TOPIC}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={busy}
                    aria-describedby="topic-help"
                    rows={isBatch ? 6 : 3}
                    placeholder={
                      article
                        ? "Opcional. Ex.: foque no impacto para quem tem loja online"
                        : isBatch
                          ? "Um tema por linha (até 10). Ex.:\nPor que o GEO importa mais que o SEO\nComo o Google AI Mode muda as buscas"
                          : "Ex.: Por que o GEO vai importar mais que o SEO em 2027"
                    }
                    className={`mt-2 resize-y ${fieldClass}`}
                  />
                  <p id="topic-help" className="mt-1.5 text-xs text-text-secondary">
                    {article
                      ? "O roteiro conta a notícia usando só os fatos dela. Se quiser, diga o ângulo ou o público."
                      : isBatch
                        ? "Cada linha vira um vídeo com as mesmas escolhas (quem fala, estilo, duração). Os roteiros ficam em “Seus vídeos” para revisar um por um."
                        : "Uma frase basta. Quanto mais específico (público, ângulo, exemplo), melhor o roteiro."}
                  </p>
                </>
              )}

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <ProfileSelect
                  id="company"
                  label="Para qual empresa (marca, CTA, logo)"
                  icon="building"
                  emptyLabel="Nenhuma empresa cadastrada"
                  profiles={companies}
                  value={companyId}
                  loaded={profilesLoaded}
                  onChange={setChosenCompany}
                />
                <div>
                  <label htmlFor="extra" className="block text-sm font-medium">
                    Instruções extras <span className="font-normal text-text-secondary">(opcional)</span>
                  </label>
                  <textarea
                    id="extra"
                    rows={2}
                    maxLength={2000}
                    value={extraInstructions}
                    onChange={(e) => setExtraInstructions(e.target.value)}
                    disabled={busy}
                    placeholder={speaker === "upload" ? "Ex.: texto da tela curto, sem emojis" : "Ex.: tom mais provocador, terminar com 'comenta GEO'"}
                    className={`mt-2 resize-y ${fieldClass}`}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-text-secondary">
                <Link href="/videogen/perfis" className="font-medium text-accent-yellow hover:underline">
                  Gerenciar perfis
                </Link>{" "}
                · pessoas (tom, voz, foto do avatar) e empresas (marca, site, @, logo).
              </p>
            </Step>

            {/* ---------- 4 · Visual ---------- */}
            <Step index={3} title="Visual" reached={reached} error={stepError[3]} onNext={next} onEdit={edit} busy={busy}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium">Estilo</span>
                <div className="flex flex-wrap items-center gap-x-4">
                  <button
                    type="button"
                    onClick={() => setManagingStyles(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-foreground"
                  >
                    <Icon name="edit" className="h-4 w-4" /> Gerenciar estilos
                  </button>
                  <Link href="/videogen/templates" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-yellow hover:underline">
                    <Icon name="plus" className="h-4 w-4" /> Montar template a partir de um vídeo
                  </Link>
                </div>
              </div>
              {managingStyles && (
                <ManageStylesModal
                  styles={styles}
                  onDeleted={(id) => {
                    removeStyle(id);
                    if (id === patternId) setPatternId(FREE_STYLE_ID);
                  }}
                  onClose={() => setManagingStyles(false)}
                />
              )}
              <div className="mt-3 grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
                <StylePreview style={pattern} />
                <div
                  className="grid max-h-[400px] content-start gap-2 overflow-y-auto overscroll-contain rounded-xl pr-1 [scrollbar-width:thin]"
                  role="radiogroup"
                  aria-label="Estilos"
                >
                  {styles.map((p) => {
                    const active = p.id === patternId;
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 rounded-xl border p-2 pr-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-yellow/40 cursor-pointer ${active ? "border-accent-yellow bg-accent-yellow/5" : "border-border hover:border-border-hover"}`}
                      >
                        <input type="radio" name="pattern" value={p.id} checked={active} onChange={() => setPatternId(p.id)} disabled={busy} className="sr-only" />
                        <span className="relative flex h-16 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                          {p.kind === "free" && <Icon name="sparkles" className="h-4 w-4 text-accent-yellow" />}
                          {p.sampleUrl && (
                            <video src={`${p.sampleUrl}#t=1.5`} muted playsInline preload="metadata" aria-hidden className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{p.nome}</span>
                          <span className="line-clamp-2 block text-xs text-text-secondary">{p.tom}</span>
                          {(p.kind !== "builtin" || p.semNarracao) && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {p.kind === "free" && (
                                <span className="rounded-full bg-accent-yellow/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-yellow">livre</span>
                              )}
                              {p.kind === "template" && (
                                <span className="rounded-full bg-accent-yellow/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-yellow">
                                  seu template
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
                        <span
                          aria-hidden
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            active ? "border-accent-yellow bg-accent-yellow text-accent-yellow-ink" : "border-border"
                          }`}
                        >
                          {active && <Icon name="check" className="h-3 w-3" />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {pattern?.kind === "free" && (
                <div className="mt-5">
                  <label htmlFor="style-notes" className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon name="sparkles" className="h-4 w-4 text-accent-yellow" /> Direcionamento do estilo
                    <span className="font-normal text-text-secondary">(opcional)</span>
                  </label>
                  <textarea
                    id="style-notes"
                    rows={3}
                    maxLength={1500}
                    value={styleNotes}
                    onChange={(e) => setStyleNotes(e.target.value)}
                    disabled={busy}
                    aria-describedby="style-notes-help"
                    placeholder="Ex.: clima retrô anos 80, cores neon, cortes rápidos com glitch, câmera tremida, trilha synthwave animada"
                    className={`mt-2 resize-y ${fieldClass}`}
                  />
                  <p id="style-notes-help" className="mt-1.5 text-xs text-text-secondary">
                    Movimento, música, clima, cores, ritmo, tipo de imagem… O que você não disser, eu escolho a partir do tema.
                  </p>
                </div>
              )}

              {!isBatch && (
                <div className="mt-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">Imagens do briefing</span>
                    <span className="text-xs text-text-secondary">opcional</span>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    Fotos do produto, do cliente, prints… {speaker === "upload" ? "Entram nas cenas no lugar das imagens geradas." : "A IA olha as imagens para escrever o roteiro e usa elas nas cenas em vez de gerar."}
                  </p>
                  <div className="mt-3">
                    <BriefingImages images={briefingImages} onChange={setBriefingImages} disabled={busy} onBusyChange={setUploadingImages} />
                  </div>
                </div>
              )}

              {speaker !== "upload" ? (
                <div className="mt-5">
                  <span id="duration-label" className="block text-sm font-medium">
                    Duração alvo
                  </span>
                  <div role="radiogroup" aria-labelledby="duration-label" className="mt-2 flex flex-wrap gap-1.5">
                    {durationOptions.map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={d === durationS}
                        onClick={() => setDurationS(d)}
                        disabled={busy}
                        className={`min-h-11 min-w-12 rounded-lg border px-3 text-sm tabular-nums transition ${
                          d === durationS
                            ? "border-accent-yellow bg-accent-yellow/10 font-semibold text-accent-yellow"
                            : "border-border text-text-secondary hover:border-border-hover"
                        }`}
                      >
                        {d >= 120 ? `${d / 60} min` : `${d}s`}
                      </button>
                    ))}
                  </div>
                  {!pattern?.semNarracao && (
                    <p className="mt-1.5 text-xs text-text-secondary">≈ {Math.round(durationS * WORDS_PER_SECOND)} palavras de narração.</p>
                  )}
                </div>
              ) : (
                <p className="mt-5 text-xs text-text-secondary">
                  Sem duração: o vídeo tem o tamanho da sua gravação{base?.durationS ? ` (${formatClock(base.durationS)})` : ""}.
                </p>
              )}
            </Step>

            {/* ---------- 5 · Revisão ---------- */}
            <Step index={4} title="Revisão" reached={reached} error={null} onNext={next} onEdit={edit} busy={busy} last>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
                <dt className="text-text-secondary">Formato</dt>
                <dd>
                  {landscape ? "Horizontal 16:9 (YouTube)" : "Vertical 9:16 (Reels / Shorts)"}
                  {speaker === "upload" && base?.durationS ? ` · ${formatClock(base.durationS)}` : ` · alvo ${durationS}s`}
                </dd>
                <dt className="text-text-secondary">Quem fala</dt>
                <dd>
                  {SPEAKER_LABEL[speaker]}
                  {speaker === "upload" && base ? ` · ${base.name}${base.kind === "video" ? (baseUseVideo ? " · vídeo nas cenas" : " · só o áudio") : ""}` : ""}
                  {speaker !== "upload" ? ` · ${person?.name ?? "—"} · voz ${voiceName}` : person ? ` · tom de ${person.name}` : ""}
                  {speaker === "ai_avatar" ? (avatarImage ? " · foto ok" : " · sem foto") : ""}
                </dd>
                <dt className="text-text-secondary">Conteúdo</dt>
                <dd className="[overflow-wrap:anywhere]">
                  {article
                    ? `Notícia: ${article.title}`
                    : isBatch
                      ? `${batchTopics.length} temas (um vídeo por linha)`
                      : speaker === "upload"
                        ? topic.trim()
                          ? `A sua fala · contexto: ${topic.trim()}`
                          : "A sua fala, transcrita e dividida em cenas"
                        : topic.trim() || "—"}
                  {company ? ` · para ${company.name}` : ""}
                </dd>
                <dt className="text-text-secondary">Visual</dt>
                <dd>
                  {pattern?.nome ?? "…"}
                  {pattern?.kind === "free" && styleNotes.trim() ? ` · ${styleNotes.trim().slice(0, 80)}` : ""}
                  {briefingImages.length && !isBatch ? ` · ${briefingImages.length} foto(s) sua(s)` : ""}
                </dd>
              </dl>

              <div className="mt-5 rounded-xl border border-border bg-background/60 p-4">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">Custo estimado{isBatch ? " por vídeo" : ""}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    ≈ {formatUsd(estimateTotal)}
                    {speaker === "ai_avatar" ? " + Higgsfield" : ""}
                    {isBatch && perVideo > 1 ? ` × ${perVideo}` : ""}
                  </span>
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {estimate.map((e) => `${e.label} ${e.usd === null ? "(preço do Higgsfield)" : `≈ ${formatUsd(e.usd)}`}`).join(" · ")}. Ordem de grandeza; o
                  gasto real aparece no vídeo.
                </p>
                <p className="mt-2 text-xs text-text-secondary">
                  {speaker === "upload"
                    ? "Ao criar, a fala é transcrita e dividida em cenas. Depois: revisar as cenas → render → pronto."
                    : speaker === "ai_avatar"
                      ? "Ao criar, só o roteiro é gerado. Depois: revisar → narração (aprovar ou gerar de novo) → avatar com o áudio aprovado → render → pronto."
                      : "Ao criar, só o roteiro é gerado. Depois: revisar → narração (aprovar ou gerar de novo) → render → pronto."}
                </p>
              </div>

              {error && (
                <div role="alert" className="mt-4 flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                  <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
                </div>
              )}

              {loading ? (
                <div className="mt-4 rounded-2xl border border-border bg-background px-4 py-3">
                  {batchProgress && (
                    <p className="mb-2 text-sm font-semibold" aria-live="polite">
                      Gerando roteiro {Math.min(batchProgress.done + 1, batchProgress.total)} de {batchProgress.total}…
                    </p>
                  )}
                  <ScriptLoader label={speaker === "upload" ? "Transcrevendo a fala e montando as cenas" : "Escrevendo o roteiro"} />
                  <p className="mt-2 text-center text-xs text-text-secondary" aria-live="polite">
                    {speaker === "upload" ? "Leva cerca de 30 a 60 segundos." : "Leva cerca de 20 a 40 segundos. Depois você revisa tudo antes de gastar com narração e render."}
                  </p>
                </div>
              ) : (
                <button type="submit" disabled={reached < 4} className={`mt-4 w-full py-3.5 ${primaryButton}`}>
                  {isBatch
                    ? `Criar ${batchTopics.length || ""} vídeo${batchTopics.length === 1 ? "" : "s"}`
                    : speaker === "upload"
                      ? "Criar vídeo: transcrever e montar as cenas"
                      : "Criar vídeo: gerar o roteiro"}{" "}
                  <Icon name="arrow" className="h-4 w-4" />
                </button>
              )}
            </Step>
          </form>

          <aside id="seus-videos" className="min-w-0 scroll-mt-24 lg:col-start-2 xl:col-start-3 xl:row-start-1" aria-labelledby="seus-videos-title">
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
                <p className="mt-1 text-xs text-text-secondary">Responda os 5 passos e crie o primeiro.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {jobs.map((job) => {
                  const title = job.script?.title || job.topic;
                  return (
                    <li key={job.id} className="flex items-center transition hover:bg-surface-2">
                      <Link
                        href={`/videogen/${job.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-1 outline-none focus-visible:bg-surface-2"
                      >
                        <JobThumb job={job} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
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
                              {getStyle(job.patternId)?.nome ?? (stylesLoaded ? "Estilo removido" : "…")} · {job.durationS}s{job.format === "16:9" ? " · horizontal" : ""}
                              {job.speaker !== "ai_voice" ? ` · ${SPEAKER_LABEL[job.speaker].toLowerCase()}` : ""}
                            </span>
                            <span>
                              {formatDate(job.createdAt)}
                              {job.costSummary && job.costSummary.totalUsd > 0 && ` · ≈ ${formatUsd(job.costSummary.totalUsd)}`}
                            </span>
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
            {jobs && totalJobs > jobs.length && (
              <button type="button" onClick={() => setShowAll(true)} className={`mt-3 w-full ${secondaryButton}`}>
                Ver mais ({totalJobs} vídeos no total)
              </button>
            )}
            {showAll && (
              <AllVideosModal
                getStyleName={(id) => getStyle(id)?.nome}
                deleting={deleting}
                onDelete={removeJob}
                onClose={() => setShowAll(false)}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/** 0:42 a partir de segundos. */
function formatClock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s - m * 60)).padStart(2, "0")}`;
}

/**
 * Um passo do questionário. Fechado até a pessoa chegar nele; aberto, mostra os campos e o botão
 * "Continuar" (o último mostra só o conteúdo, que já traz o botão de criar).
 */
function Step({
  index,
  title,
  reached,
  error,
  busy,
  last = false,
  onNext,
  onEdit,
  children,
}: {
  index: number;
  title: string;
  reached: number;
  error: string | null | undefined;
  busy: boolean;
  last?: boolean;
  onNext: (i: number) => void;
  onEdit: (i: number) => void;
  children: ReactNode;
}) {
  const state = index < reached ? "done" : index === reached ? "current" : "locked";
  const id = `passo-${STEPS[index].id}`;
  if (state === "locked") {
    return (
      <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-2xl border border-dashed border-border px-5 py-4 opacity-70 sm:px-6">
        <h2 id={`${id}-title`} className="flex items-center gap-3 text-sm font-semibold text-text-secondary">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-xs">
            {index + 1}
          </span>
          {title}
          <span className="ml-auto text-xs font-normal">depois do passo {index}</span>
        </h2>
      </section>
    );
  }
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-24 ${cardClass} ${state === "current" ? "ring-1 ring-foreground/30" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-3 text-base font-semibold">
          <span
            aria-hidden
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              state === "done" ? "bg-success text-white" : "bg-foreground text-background"
            }`}
          >
            {state === "done" ? <Icon name="check" className="h-3.5 w-3.5" /> : index + 1}
          </span>
          {title}
        </h2>
        {state === "done" && (
          <button type="button" onClick={() => onEdit(index)} className="text-xs font-medium text-text-secondary hover:text-foreground">
            <span className="sr-only">{title}: </span>respondido
          </button>
        )}
      </div>
      <div className="mt-4">{children}</div>
      {error && (
        <p role="alert" className="mt-3 flex gap-2 rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {!last && state === "current" && (
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => onNext(index)} disabled={busy} className={primaryButton}>
            Continuar <Icon name="arrow" className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}

function ProfileSelect({
  id,
  label,
  icon,
  emptyLabel,
  profiles,
  value,
  loaded,
  extraOption,
  onChange,
}: {
  id: string;
  label: string;
  icon: string;
  /** Só aparece quando não há nenhum perfil cadastrado desse tipo. */
  emptyLabel: string;
  profiles: VideoProfileDTO[];
  value: string;
  loaded: boolean;
  /** Opção extra no fim da lista que dispara uma ação (ex.: treinar nova voz) em vez de escolher um perfil. */
  extraOption?: { value: string; label: string };
  onChange: (id: string) => void;
}) {
  const selected = profiles.find((p) => p.id === value);
  const summary = selected ? [selected.tone, selected.site, selected.instagram].filter(Boolean).join(" · ") : "";
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
        <Icon name={icon} className="h-4 w-4 text-text-secondary" /> {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!loaded}
        className={`mt-2 bg-background text-foreground ${fieldClass}`}
      >
        {!loaded && <option className="bg-background text-foreground">Carregando…</option>}
        {loaded &&
          profiles.map((p) => (
            <option key={p.id} value={p.id} className="bg-background text-foreground">
              {p.name}
              {p.isDefault ? " (padrão)" : ""}
            </option>
          ))}
        {loaded && profiles.length === 0 && (
          <option value="" className="bg-background text-foreground">
            {emptyLabel}
          </option>
        )}
        {loaded && extraOption && (
          <option value={extraOption.value} className="bg-background text-foreground">
            {extraOption.label}
          </option>
        )}
      </select>
      {summary && <p className="mt-1.5 line-clamp-2 text-xs text-text-secondary">{summary}</p>}
    </div>
  );
}

/** Exemplo de 5s do estilo escolhido: sempre visível, para a pessoa saber que vídeo vai sair. */
function StylePreview({ style }: { style: VideoPattern | undefined }) {
  return (
    <div className="mx-auto w-full max-w-[200px] sm:mx-0">
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
        {style?.sampleUrl ? (
          <video
            key={style.sampleUrl}
            src={style.sampleUrl}
            autoPlay
            muted
            loop
            playsInline
            controls
            aria-label={`Exemplo do estilo ${style.nome}`}
            className="h-full w-full object-cover"
          />
        ) : style?.kind === "free" ? (
          <span className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-xs text-text-secondary">
            <Icon name="sparkles" className="h-8 w-8 text-accent-yellow" />
            <span>
              <strong className="block text-sm font-semibold text-foreground">Visual criado para este vídeo</strong>
              Cores, fontes, imagens, transições e movimento saem do tema e do seu direcionamento.
            </span>
          </span>
        ) : (
          <span className="flex h-full items-center justify-center px-4 text-center text-xs text-text-secondary">
            Este estilo ainda não tem exemplo.
          </span>
        )}
      </div>
      {style && style.kind !== "free" && (
        <p className="mt-2 text-xs text-text-secondary">
          <strong className="font-semibold text-foreground">Exemplo de 5s</strong>
          {style.ritmo ? ` · ${style.ritmo}` : ""}
        </p>
      )}
    </div>
  );
}

const HOME_LIST = 5;
const MODAL_PAGE = 10;

function formatDate(iso: string, withTime = false) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: withTime ? "2-digit" : "short",
    ...(withTime ? { year: "numeric", hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Lista os templates (cada um pode ser excluído). */
function ManageStylesModal({ styles, onDeleted, onClose }: { styles: VideoPattern[]; onDeleted: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function remove(style: VideoPattern) {
    if (!window.confirm(`Excluir o estilo "${style.nome}"? Vídeos que já usam este estilo não poderão mais ir para o render.`)) return;
    setDeleting(style.id);
    setError(null);
    try {
      const res = await fetch(`/api/videogen/templates/${style.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir.");
      onDeleted(style.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setDeleting(null);
    }
  }

  const templates = styles.filter((s) => s.kind === "template");

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="manage-styles-title"
      className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="manage-styles-title" className="text-lg font-semibold">
          Gerenciar estilos
        </h2>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className={iconButton}>
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[65vh] overflow-y-auto">
        {error && (
          <p role="alert" className="mx-5 mt-4 rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
            {error}
          </p>
        )}
        <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Seus templates ({templates.length})</p>
        {templates.length === 0 ? (
          <p className="px-5 py-3 text-sm text-text-secondary">Nenhum template ainda.</p>
        ) : (
          <ul className="divide-y divide-border pb-2">
            {templates.map((s) => (
              <StyleRow key={s.id} style={s}>
                <button
                  type="button"
                  onClick={() => remove(s)}
                  disabled={deleting !== null}
                  title="Excluir"
                  aria-label={`Excluir o estilo ${s.nome}`}
                  className={`shrink-0 hover:bg-accent-red/10 hover:text-accent-red ${iconButton}`}
                >
                  {deleting === s.id ? <Spinner className="h-4 w-4" /> : <Icon name="trash" className="h-4 w-4" />}
                </button>
              </StyleRow>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-text-secondary">
        Excluir um template não muda os vídeos já prontos.
      </p>
    </dialog>
  );
}

function StyleRow({ style, children }: { style: VideoPattern; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="relative h-14 w-8 shrink-0 overflow-hidden rounded-md bg-surface-2">
        {style.sampleUrl && (
          <video src={`${style.sampleUrl}#t=1.5`} muted playsInline preload="metadata" aria-hidden className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{style.nome}</span>
        <span className="line-clamp-1 block text-xs text-text-secondary">{style.tom}</span>
      </span>
      {children}
    </li>
  );
}

/** Todos os vídeos gerados, com paginação e data/hora de criação. */
function AllVideosModal({
  getStyleName,
  deleting,
  onDelete,
  onClose,
}: {
  getStyleName: (id: string) => string | undefined;
  deleting: string | null;
  onDelete: (job: VideoJobDTO) => Promise<boolean>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ page: number; jobs: VideoJobDTO[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/videogen/jobs?take=${MODAL_PAGE}&skip=${page * MODAL_PAGE}`)
      .then((res) => res.json())
      .then((d) => alive && setData({ page, jobs: d.jobs ?? [], total: d.total ?? 0 }))
      .catch(() => alive && setError("Não foi possível carregar os vídeos."));
    return () => {
      alive = false;
    };
  }, [page, reload]);

  async function remove(job: VideoJobDTO) {
    if (!(await onDelete(job))) return;
    // tira da lista na hora e recarrega a página (o próximo vídeo sobe para o lugar)
    setData((d) => (d ? { ...d, jobs: d.jobs.filter((j) => j.id !== job.id), total: Math.max(0, d.total - 1) } : d));
    if (data && data.jobs.length === 1 && page > 0) setPage((p) => p - 1);
    else setReload((n) => n + 1);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / MODAL_PAGE)) : 1;
  const loadingPage = !data || data.page !== page;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="all-videos-title"
      className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="all-videos-title" className="text-lg font-semibold">
          Todos os vídeos{data ? ` (${data.total})` : ""}
        </h2>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className={iconButton}>
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[60vh] min-h-[200px] overflow-y-auto">
        {error ? (
          <p role="alert" className="px-5 py-6 text-sm text-accent-red">
            {error}
          </p>
        ) : !data ? (
          <div className="space-y-2 p-5" aria-label="Carregando">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <ul className={`divide-y divide-border transition-opacity ${loadingPage ? "opacity-50" : ""}`} aria-busy={loadingPage}>
            {data.jobs.map((job) => {
              const title = job.script?.title || job.topic;
              return (
                <li key={job.id} className="flex items-center transition hover:bg-surface-2">
                  <Link
                    href={`/videogen/${job.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-1 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <JobThumb job={job} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="line-clamp-2 text-sm font-medium">{title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
                      <StatusBadge status={job.status} progress={job.progress} label={job.error && job.status === "draft" ? "Erro no roteiro" : undefined} />
                      <span>
                        {getStyleName(job.patternId) ?? "Estilo removido"} · {job.durationS}s{job.format === "16:9" ? " · horizontal" : ""}
                      </span>
                      <span>Gerado em {formatDate(job.createdAt, true)}</span>
                      {job.costSummary && job.costSummary.totalUsd > 0 && <span>≈ {formatUsd(job.costSummary.totalUsd)}</span>}
                    </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(job)}
                    disabled={deleting !== null || job.status === "rendering"}
                    title={job.status === "rendering" ? "Aguarde o render terminar para excluir" : "Excluir"}
                    aria-label={`Excluir "${title}"`}
                    className={`mr-3 shrink-0 hover:bg-accent-red/10 hover:text-accent-red ${iconButton}`}
                  >
                    {deleting === job.id ? <Spinner className="h-4 w-4" /> : <Icon name="trash" className="h-4 w-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 0 || loadingPage} className={secondaryButton}>
          <Icon name="back" className="h-4 w-4" /> Anterior
        </button>
        <span className="text-sm tabular-nums text-text-secondary">
          Página {page + 1} de {pages}
        </span>
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages || loadingPage} className={secondaryButton}>
          Próxima <Icon name="arrow" className="h-4 w-4" />
        </button>
      </div>
    </dialog>
  );
}

/** Miniatura da lista de vídeos: capa do render final; antes dele, a imagem da 1ª cena que já tiver prévia. */
function JobThumb({ job }: { job: VideoJobDTO }) {
  const landscape = job.format === "16:9";
  const src =
    (landscape ? job.thumbUrl || job.coverUrl : job.coverUrl || job.thumbUrl) ||
    job.script?.scenes.find((sc) => sc.preview?.url)?.preview?.url ||
    null;
  return (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center">
      <span
        className={`flex items-center justify-center overflow-hidden rounded-md bg-surface-2 ring-1 ring-border ${
          landscape ? "aspect-video w-16" : "aspect-[9/16] h-16"
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Icon name="film" className="h-4 w-4 text-text-secondary" />
        )}
      </span>
    </span>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { VoiceSelect } from "@/components/videogen/VoiceSelect";
import { BriefingImages } from "@/components/videogen/BriefingImages";
import { ScriptLoader } from "@/components/videogen/ScriptLoader";
import { formatUsd } from "@/components/videogen/CostPanel";
import { FlowSteps, Icon, Spinner, StatusBadge, cardClass, fieldClass, iconButton, primaryButton, secondaryButton, sectionTitle } from "@/components/videogen/ui";
import { useVoices } from "@/lib/videogen/useVoices";
import { VIDEO_PATTERNS, type VideoPattern } from "@/lib/videogen/patterns";
import { useStyles } from "@/lib/videogen/useStyles";
import { useProfiles } from "@/lib/videogen/useProfiles";
import { DEFAULT_VOICE_ID, DURATION_OPTIONS, WORDS_PER_SECOND, type BriefingImage, type VideoProfileDTO } from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";

const MAX_TOPIC = 2000;
const noopSubscribe = () => () => {};

export default function VideoGenPage() {
  const router = useRouter();
  const { voices, loading: loadingVoices, error: voicesError } = useVoices();

  const [topic, setTopic] = useState("");
  const { styles, loaded: stylesLoaded, getStyle, removeStyle } = useStyles();
  const [managingStyles, setManagingStyles] = useState(false);
  const [chosenPattern, setPatternId] = useState<string | null>(null);
  // /videogen?estilo=<id> (link "Criar vídeo neste estilo" da tela de templates)
  const wantedPattern = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("estilo"),
    () => null
  );
  const patternId =
    chosenPattern ?? (wantedPattern && styles.some((s) => s.id === wantedPattern) ? wantedPattern : VIDEO_PATTERNS[0]?.id ?? "");
  const { people, companies, loaded: profilesLoaded } = useProfiles();
  // null = ainda não escolheu (usa o perfil padrão); "" = nenhum
  const [chosenPerson, setChosenPerson] = useState<string | null>(null);
  const [chosenCompany, setChosenCompany] = useState<string | null>(null);
  const personId = chosenPerson ?? people.find((p) => p.isDefault)?.id ?? people[0]?.id ?? "";
  const companyId = chosenCompany ?? companies.find((p) => p.isDefault)?.id ?? companies[0]?.id ?? "";
  const person = people.find((p) => p.id === personId);
  // A voz segue a da pessoa até o usuário trocar à mão.
  const [chosenVoice, setChosenVoice] = useState<{ id: string; name: string } | null>(null);
  const voiceId = chosenVoice?.id ?? person?.voiceId ?? DEFAULT_VOICE_ID;
  const voiceName = chosenVoice?.name ?? (person?.voiceId ? person.voiceName || person.name : "Macena");
  const [briefingImages, setBriefingImages] = useState<BriefingImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [durationS, setDurationS] = useState(15);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [styleNotes, setStyleNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const pattern = getStyle(patternId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim()) {
      setError("Escreva o tema do vídeo.");
      document.getElementById("topic")?.focus();
      return;
    }
    if (uploadingImages) {
      setError("Espere as imagens terminarem de enviar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/videogen/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          patternId,
          voiceId,
          voiceName,
          durationS,
          extraInstructions,
          styleNotes: pattern?.kind === "free" ? styleNotes : "",
          personId: personId || null,
          companyId: companyId || null,
          briefingImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível gerar o roteiro. Tente de novo.");
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
              Seus vídeos ({Math.max(totalJobs, jobs.length)}) <Icon name="down" className="h-4 w-4" />
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
              <legend className="sr-only">Quem fala e para qual empresa</legend>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={sectionTitle} aria-hidden>
                  Quem fala e para quem
                </h2>
                <Link
                  href="/videogen/perfis"
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-yellow hover:underline"
                >
                  <Icon name="edit" className="h-4 w-4" /> Gerenciar perfis
                </Link>
              </div>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <ProfileSelect
                  id="person"
                  label="Quem fala no vídeo"
                  icon="user"
                  emptyLabel="Nenhuma pessoa cadastrada"
                  profiles={people}
                  value={personId}
                  loaded={profilesLoaded}
                  onChange={(id) => {
                    setChosenPerson(id);
                    setChosenVoice(null);
                  }}
                />
                <ProfileSelect
                  id="company"
                  label="Para qual empresa"
                  icon="building"
                  emptyLabel="Nenhuma empresa cadastrada"
                  profiles={companies}
                  value={companyId}
                  loaded={profilesLoaded}
                  onChange={setChosenCompany}
                />
              </div>
            </fieldset>

            <section className={cardClass} aria-labelledby="briefing-images-title">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="briefing-images-title" className={sectionTitle}>
                  Imagens do briefing
                </h2>
                <span className="text-xs text-text-secondary">opcional</span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                Fotos do produto, do cliente, prints… A IA olha as imagens para escrever o roteiro e usa elas nas cenas em vez de gerar.
              </p>
              <div className="mt-3">
                <BriefingImages images={briefingImages} onChange={setBriefingImages} disabled={loading} onBusyChange={setUploadingImages} />
              </div>
            </section>

            <fieldset className={cardClass} disabled={loading}>
              <legend className="sr-only">Estilo visual</legend>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={sectionTitle} aria-hidden>
                  Estilo visual
                </h2>
                <div className="flex flex-wrap items-center gap-x-4">
                  <button
                    type="button"
                    onClick={() => setManagingStyles(true)}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-foreground"
                  >
                    <Icon name="edit" className="h-4 w-4" /> Gerenciar estilos
                  </button>
                  <Link
                    href="/videogen/templates"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-yellow hover:underline"
                  >
                    <Icon name="plus" className="h-4 w-4" /> Montar template a partir de um vídeo
                  </Link>
                </div>
              </div>
              {managingStyles && (
                <ManageStylesModal
                  styles={styles}
                  onDeleted={(id) => {
                    removeStyle(id);
                    if (id === patternId) setPatternId(VIDEO_PATTERNS[0]?.id ?? "");
                  }}
                  onClose={() => setManagingStyles(false)}
                />
              )}
              <div className="mt-4 grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
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
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2 pr-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-yellow/40 ${
                          active ? "border-accent-yellow bg-accent-yellow/5" : "border-border hover:border-border-hover"
                        }`}
                      >
                        <input
                          type="radio"
                          name="pattern"
                          value={p.id}
                          checked={active}
                          onChange={() => setPatternId(p.id)}
                          className="sr-only"
                        />
                        <span className="relative flex h-16 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                          {p.kind === "free" && <Icon name="sparkles" className="h-4 w-4 text-accent-yellow" />}
                          {p.sampleUrl && (
                            <video
                              src={`${p.sampleUrl}#t=1.5`}
                              muted
                              playsInline
                              preload="metadata"
                              aria-hidden
                              className="h-full w-full object-cover"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{p.nome}</span>
                          <span className="line-clamp-2 block text-xs text-text-secondary">{p.tom}</span>
                          {(p.kind !== "builtin" || p.semNarracao) && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {p.kind === "free" && (
                                <span className="rounded-full bg-accent-yellow/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-yellow">
                                  livre
                                </span>
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
                    disabled={loading}
                    aria-describedby="style-notes-help"
                    placeholder="Ex.: clima retrô anos 80, cores neon, cortes rápidos com glitch, câmera tremida, trilha synthwave animada"
                    className={`mt-2 resize-y ${fieldClass}`}
                  />
                  <p id="style-notes-help" className="mt-1.5 text-xs text-text-secondary">
                    Movimento, música, clima, cores, ritmo, tipo de imagem… O que você não disser, eu escolho a partir do tema.
                  </p>
                </div>
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
                      onChange={(v) => setChosenVoice({ id: v.id, name: v.name })}
                      disabled={loading || pattern?.semNarracao}
                      loading={loadingVoices}
                      error={voicesError}
                    />
                  </div>
                  {pattern?.semNarracao ? (
                    <p className="mt-1 text-xs text-text-secondary">Este estilo não usa narração.</p>
                  ) : (
                    person?.voiceId && !chosenVoice && <p className="mt-1 text-xs text-text-secondary">Voz do perfil {person.name}.</p>
                  )}
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

            {loading ? (
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <ScriptLoader />
              </div>
            ) : (
              <button type="submit" className={`w-full py-3.5 ${primaryButton}`}>
                Gerar roteiro <Icon name="arrow" className="h-4 w-4" />
              </button>
            )}
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
                            {getStyle(job.patternId)?.nome ?? (stylesLoaded ? "Estilo removido" : "…")} · {job.durationS}s
                          </span>
                          <span>
                            {formatDate(job.createdAt)}
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

function ProfileSelect({
  id,
  label,
  icon,
  emptyLabel,
  profiles,
  value,
  loaded,
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

/** Lista os estilos: templates podem ser excluídos; os embutidos fazem parte do código. */
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
  const builtins = styles.filter((s) => s.kind === "builtin");

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
          <ul className="divide-y divide-border">
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
        <p className="border-t border-border px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Estilos embutidos ({builtins.length})</p>
        <ul className="divide-y divide-border pb-2">
          {builtins.map((s) => (
            <StyleRow key={s.id} style={s}>
              <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-secondary" title="Faz parte do código do app">
                Embutido
              </span>
            </StyleRow>
          ))}
        </ul>
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-text-secondary">
        Excluir um template não muda os vídeos já prontos. Os estilos embutidos fazem parte do código: para tirar um deles, é só me pedir.
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
                    className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 pl-5 pr-1 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <span className="line-clamp-2 text-sm font-medium">{title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
                      <StatusBadge status={job.status} progress={job.progress} label={job.error && job.status === "draft" ? "Erro no roteiro" : undefined} />
                      <span>
                        {getStyleName(job.patternId) ?? "Estilo removido"} · {job.durationS}s
                      </span>
                      <span>Gerado em {formatDate(job.createdAt, true)}</span>
                      {job.costSummary && job.costSummary.totalUsd > 0 && <span>≈ {formatUsd(job.costSummary.totalUsd)}</span>}
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

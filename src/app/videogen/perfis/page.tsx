"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { VoiceSelect } from "@/components/videogen/VoiceSelect";
import {
  AutoTextarea,
  Icon,
  Spinner,
  cardClass,
  dangerButton,
  fieldClass,
  iconButton,
  labelClass,
  primaryButton,
  secondaryButton,
  sectionTitle,
} from "@/components/videogen/ui";
import { useProfiles } from "@/lib/videogen/useProfiles";
import { useVoices } from "@/lib/videogen/useVoices";
import { uploadImage } from "@/lib/videogen/uploadImage";
import { AvatarCharacterSelect } from "@/components/videogen/AvatarCharacterSelect";
import { BrandMaterialGrid, uploadPicked, useBrandPicker } from "@/components/videogen/BrandTemplateForm";
import type { VideoTemplateDTO } from "@/lib/videogen/templates";
import { TEMPLATE_STATUS_LABEL, parseCharacter, type AvatarCharacter, type Pronunciation, type VideoProfileDTO, type VideoProfileKind } from "@/lib/videogen/types";

interface Draft {
  id: string | null;
  kind: VideoProfileKind;
  name: string;
  description: string;
  tone: string;
  speech: string;
  voiceId: string;
  voiceName: string;
  site: string;
  instagram: string;
  cta: string;
  logoUrl: string;
  heygenAvatar: AvatarCharacter | null;
  colors: string;
  pronunciations: Pronunciation[];
  isDefault: boolean;
  neutral: boolean;
  brandTemplateId: string | null;
}

function toDraft(p: VideoProfileDTO): Draft {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    description: p.description ?? "",
    tone: p.tone ?? "",
    speech: p.speech ?? "",
    voiceId: p.voiceId ?? "",
    voiceName: p.voiceName ?? "",
    site: p.site ?? "",
    instagram: p.instagram ?? "",
    cta: p.cta ?? "",
    logoUrl: p.logoUrl ?? "",
    heygenAvatar: parseCharacter(p.heygenAvatar),
    colors: p.colors ?? "",
    pronunciations: p.pronunciations,
    isDefault: p.isDefault,
    neutral: p.neutral,
    brandTemplateId: p.brandTemplateId ?? null,
  };
}

function emptyDraft(kind: VideoProfileKind): Draft {
  return {
    id: null,
    kind,
    name: "",
    description: "",
    tone: "",
    speech: "",
    voiceId: "",
    voiceName: "",
    site: "",
    instagram: "",
    cta: "",
    logoUrl: "",
    heygenAvatar: null,
    colors: "",
    pronunciations: [],
    isDefault: false,
    neutral: false,
    brandTemplateId: null,
  };
}

const COPY: Record<VideoProfileKind, { title: string; empty: string; add: string; help: string }> = {
  person: {
    title: "Pessoas",
    empty: "Nenhuma pessoa cadastrada.",
    add: "Nova pessoa",
    help: "Quem fala no vídeo: jeito de falar, humor e voz.",
  },
  company: {
    title: "Empresas",
    empty: "Nenhuma empresa cadastrada.",
    add: "Nova empresa",
    help: "Para quem é o conteúdo: tom da marca, site, @, CTA e logo.",
  },
};

export default function ProfilesPage() {
  const { people, companies, loaded, error: loadError, setProfiles } = useProfiles();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  function open(d: Draft) {
    setDraft(d);
    setError(null);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function upsert(profile: VideoProfileDTO) {
    setProfiles((list) => {
      const rest = list.filter((p) => p.id !== profile.id);
      // só um padrão por tipo
      const fixed = profile.isDefault ? rest.map((p) => (p.kind === profile.kind ? { ...p, isDefault: false } : p)) : rest;
      return [...fixed, profile].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
    });
  }

  async function makeDefault(p: VideoProfileDTO) {
    setActing(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/videogen/profiles/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      upsert(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setActing(null);
    }
  }

  async function remove(p: VideoProfileDTO) {
    if (!window.confirm(`Excluir o perfil "${p.name}"? Vídeos já criados continuam existindo.`)) return;
    setActing(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/videogen/profiles/${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir.");
      // recarrega: outro perfil pode ter virado o padrão
      const list = await fetch("/api/videogen/profiles").then((r) => r.json());
      setProfiles(list.profiles ?? []);
      if (draft?.id === p.id) setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header wide />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/videogen"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-secondary transition hover:text-accent-yellow"
        >
          <Icon name="back" className="h-4 w-4" /> VideoGen
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Perfis de comunicação</h1>
        <p className="mt-2 max-w-2xl text-text-secondary">
          Cada vídeo tem uma pessoa que fala e uma empresa dona do conteúdo. O roteiro segue o jeito de falar da pessoa e o tom, o site e o
          CTA da empresa. O perfil marcado como padrão já vem escolhido ao criar um vídeo.
        </p>

        {(error || loadError) && (
          <div role="alert" className="mt-6 flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error || loadError}</span>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {(["person", "company"] as const).map((kind) => {
            const list = kind === "person" ? people : companies;
            return (
              <section key={kind} aria-labelledby={`title-${kind}`} className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 id={`title-${kind}`} className={`flex items-center gap-2 ${sectionTitle}`}>
                      <Icon name={kind === "person" ? "user" : "building"} className="h-4 w-4" />
                      {COPY[kind].title}
                    </h2>
                    <p className="mt-0.5 text-xs text-text-secondary">{COPY[kind].help}</p>
                  </div>
                  <button type="button" onClick={() => open(emptyDraft(kind))} className={secondaryButton}>
                    <Icon name="plus" className="h-4 w-4" /> {COPY[kind].add}
                  </button>
                </div>
                {!loaded ? (
                  <div className="mt-3 h-24 animate-pulse rounded-2xl bg-surface-2 motion-reduce:animate-none" />
                ) : list.length === 0 ? (
                  <p className={`mt-3 text-sm text-text-secondary ${cardClass}`}>{COPY[kind].empty}</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {list.map((p) => (
                      <li
                        key={p.id}
                        className={`flex gap-3 rounded-2xl border bg-surface p-4 ${draft?.id === p.id ? "border-accent-yellow" : "border-border"}`}
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-lg font-bold text-text-secondary">
                          {p.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.logoUrl} alt="" className="h-full w-full object-contain" />
                          ) : (
                            p.name.slice(0, 1).toUpperCase()
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{p.name}</span>
                            {p.isDefault && (
                              <span className="rounded-full bg-accent-yellow/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-yellow">
                                padrão
                              </span>
                            )}
                            {p.neutral && (
                              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                                neutro
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
                            {[p.tone, kind === "person" ? p.voiceName && `voz ${p.voiceName}` : p.site, p.instagram].filter(Boolean).join(" · ") ||
                              "Sem detalhes ainda"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <button type="button" onClick={() => open(toDraft(p))} className={`!min-h-9 !px-3 ${secondaryButton}`}>
                              <Icon name="edit" className="h-3.5 w-3.5" /> Editar
                            </button>
                            {!p.isDefault && (
                              <button
                                type="button"
                                onClick={() => makeDefault(p)}
                                disabled={acting !== null}
                                className={`!min-h-9 !px-3 ${secondaryButton}`}
                              >
                                <Icon name="star" className="h-3.5 w-3.5" /> Tornar padrão
                              </button>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(p)}
                          disabled={acting !== null}
                          aria-label={`Excluir ${p.name}`}
                          className={`shrink-0 hover:bg-accent-red/10 hover:text-accent-red ${iconButton}`}
                        >
                          {acting === p.id ? <Spinner className="h-4 w-4" /> : <Icon name="trash" className="h-4 w-4" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <div ref={formRef} className="scroll-mt-24">
          {draft && (
            <ProfileForm
              key={draft.id ?? `novo-${draft.kind}`}
              initial={draft}
              onCancel={() => setDraft(null)}
              onSaved={(p) => {
                upsert(p);
                setDraft(null);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function ProfileForm({ initial, onCancel, onSaved }: { initial: Draft; onCancel: () => void; onSaved: (p: VideoProfileDTO) => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { voices, loading: loadingVoices, error: voicesError } = useVoices();
  const logoInput = useRef<HTMLInputElement>(null);
  const isPerson = d.kind === "person";
  const brand = useBrandPicker();
  const [brandIdea, setBrandIdea] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((x) => ({ ...x, [key]: value }));

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      set("logoUrl", await uploadImage(file, "perfis"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) {
      setError("Dê um nome ao perfil.");
      document.getElementById("profile-name")?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { id, brandTemplateId: _keep, ...body } = d;
      void _keep;
      const res = await fetch(id ? `/api/videogen/profiles/${id}` : "/api/videogen/profiles", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, pronunciations: d.pronunciations.filter((p) => p.display.trim() && p.spoken.trim()) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      let profile: VideoProfileDTO = data.profile;
      // material da marca novo: a IA estuda e monta o estilo dos vídeos desta empresa (template de marca)
      if (!isPerson && brand.total > 0) {
        const assets = await uploadPicked(brand.picked, (done, n) => setStatus(`Enviando arquivos da marca… ${done} de ${n}`));
        setStatus("Mandando a IA estudar a marca…");
        const tRes = await fetch("/api/videogen/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: "brand",
            name: `Estilo ${profile.name}`.slice(0, 80),
            brief: brandBrief(profile, brandIdea),
            brandAssets: assets,
            companyId: profile.id,
          }),
        });
        const tData = await tRes.json();
        if (!tRes.ok) throw new Error(tData.error || "O perfil foi salvo, mas não deu para montar o estilo da marca.");
        profile = { ...profile, brandTemplateId: tData.template.id };
      }
      onSaved(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setSaving(false);
      setStatus(null);
    }
  }

  const text = (key: keyof Draft, label: string, placeholder: string, help?: string, rows = 2) => (
    <div>
      <label htmlFor={`profile-${key}`} className={labelClass}>
        {label}
      </label>
      <AutoTextarea
        id={`profile-${key}`}
        minRows={rows}
        maxLength={1500}
        value={d[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder={placeholder}
        className={`mt-1.5 ${fieldClass}`}
      />
      {help && <p className="mt-1 text-xs text-text-secondary">{help}</p>}
    </div>
  );
  const line = (key: keyof Draft, label: string, placeholder: string, max = 120) => (
    <div>
      <label htmlFor={`profile-${key}`} className={labelClass}>
        {label}
      </label>
      <input
        id={`profile-${key}`}
        value={d[key] as string}
        maxLength={max}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder={placeholder}
        className={`mt-1.5 ${fieldClass}`}
      />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className={`mt-8 ${cardClass}`} aria-labelledby="profile-form-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="profile-form-title" className="flex items-center gap-2 text-xl font-bold">
          <Icon name={isPerson ? "user" : "building"} className="h-5 w-5 text-accent-yellow" />
          {d.id ? `Editar ${initial.name}` : isPerson ? "Nova pessoa" : "Nova empresa"}
        </h2>
        <button type="button" onClick={onCancel} aria-label="Fechar" className={iconButton}>
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label htmlFor="profile-name" className={labelClass}>
              Nome *
            </label>
            <input
              id="profile-name"
              value={d.name}
              maxLength={80}
              required
              onChange={(e) => set("name", e.target.value)}
              placeholder={isPerson ? "Ex.: Macena" : "Ex.: Oxyn Group"}
              className={`mt-1.5 ${fieldClass}`}
            />
          </div>
          {text(
            "description",
            isPerson ? "Quem é" : "Sobre a empresa",
            isPerson ? "Ex.: especialista em marketing digital e IA, fala para donos de pequenas empresas" : "O que a empresa faz, para quem, diferenciais"
          )}
          {text(
            "tone",
            isPerson ? "Tom e humor" : "Tom de voz da marca",
            isPerson ? "Ex.: direto, provocador, humor leve e autodepreciativo" : "Ex.: confiante, técnico mas acessível, sem gírias"
          )}
          {text(
            "speech",
            isPerson ? "Jeito de falar" : "Regras de comunicação",
            isPerson ? "Bordões, vocabulário, como abre e fecha os vídeos, o que nunca fala" : "Palavras proibidas, termos da marca, promessas que não pode fazer",
            isPerson ? "Quanto mais concreto, mais o roteiro soa como a pessoa." : undefined
          )}
        </div>

        <div className="space-y-4">
          {isPerson ? (
            <div>
              <label htmlFor="profile-voice" className={labelClass}>
                Voz (ElevenLabs)
              </label>
              <div className="mt-1.5">
                <VoiceSelect
                  id="profile-voice"
                  voices={voices}
                  value={d.voiceId}
                  onChange={(v) => setD((x) => ({ ...x, voiceId: v.id, voiceName: v.name }))}
                  loading={loadingVoices}
                  error={voicesError}
                />
              </div>
              <p className="mt-1 text-xs text-text-secondary">Escolher esta pessoa no vídeo já seleciona essa voz.</p>
              <div className="mt-4">
                <label htmlFor="profile-heygen" className={labelClass}>
                  Avatar por IA (HeyGen)
                </label>
                <div className="mt-1.5">
                  <AvatarCharacterSelect id="profile-heygen" value={d.heygenAvatar} onChange={(c) => set("heygenAvatar", c)} />
                </div>
                <p className="mt-1 text-xs text-text-secondary">Escolher esta pessoa em “Avatar por IA” já seleciona esse avatar (imagem e voz vêm dele).</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <span className={labelClass}>Logo</span>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-[repeating-conic-gradient(var(--surface-2)_0_25%,transparent_0_50%)] bg-[length:12px_12px]">
                    {d.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.logoUrl} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <Icon name="image" className="h-6 w-6 text-text-secondary" />
                    )}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => logoInput.current?.click()} disabled={uploadingLogo} className={secondaryButton}>
                      {uploadingLogo ? <Spinner className="h-4 w-4" /> : <Icon name="up" className="h-4 w-4" />}
                      {d.logoUrl ? "Trocar" : "Enviar logo"}
                    </button>
                    {d.logoUrl && (
                      <button type="button" onClick={() => set("logoUrl", "")} className={dangerButton}>
                        Remover
                      </button>
                    )}
                  </div>
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(e) => {
                      void pickLogo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-text-secondary">PNG com fundo transparente fica melhor. Aparece no fim do vídeo, junto do CTA.</p>
              </div>
              {line("site", "Site", "Ex.: oxyngroup.com.br")}
              {line("colors", "Cores da marca", "Ex.: vermelho #E10600, preto e branco", 200)}
            </>
          )}
          {line("instagram", "Instagram", "@perfil", 60)}
          {line("cta", "CTA padrão", isPerson ? "Ex.: Me segue pra mais dicas" : "Ex.: Acesse o site e fale com um especialista", 300)}
          <PronunciationsEditor list={d.pronunciations} onChange={(l) => set("pronunciations", l)} />
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={d.isDefault} onChange={(e) => set("isDefault", e.target.checked)} className="h-4 w-4 accent-[var(--accent-yellow)]" />
            Usar como padrão ao criar vídeos
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={d.neutral} onChange={(e) => set("neutral", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-yellow)]" />
            <span>
              Conteúdo neutro
              <span className="block text-xs text-text-secondary">
                O roteiro fala do assunto de forma informativa, sem citar empresa, sem tom de venda e com CTA só de engajamento.
              </span>
            </span>
          </label>
        </div>
      </div>

      {!isPerson && (
        <section className="mt-6 border-t border-border pt-5" aria-labelledby="brand-material-title">
          <h3 id="brand-material-title" className="text-base font-semibold">
            Guia da marca e estilo dos vídeos
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Suba o manual da marca, as fontes, os logos e peças de referência (pode ser mais de um arquivo de cada). A IA estuda tudo e monta o
            estilo visual dos vídeos desta empresa: cores, tipografia, animações e onde vai o logo. Vídeos novos desta empresa já saem nesse estilo.
          </p>
          {d.brandTemplateId && <BrandStyleStatus id={d.brandTemplateId} replacing={brand.total > 0} />}
          <BrandMaterialGrid picker={brand} disabled={saving} />
          {brand.problem && <p className="mt-2 text-xs text-accent-red">{brand.problem}</p>}
          {brand.total > 0 && (
            <div className="mt-3">
              <label htmlFor="profile-brand-idea" className={labelClass}>
                Como você imagina os vídeos <span className="font-normal text-text-secondary">(opcional)</span>
              </label>
              <AutoTextarea
                id="profile-brand-idea"
                minRows={2}
                maxLength={1500}
                value={brandIdea}
                onChange={(e) => setBrandIdea(e.target.value)}
                placeholder="Ex.: animações suaves, cortes rápidos, logo pequeno no canto de cima"
                className={`mt-1.5 ${fieldClass}`}
              />
            </div>
          )}
        </section>
      )}

      {error && (
        <div role="alert" className="mt-5 flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancelar
        </button>
        <button type="submit" disabled={saving || uploadingLogo} className={primaryButton}>
          {saving && <Spinner className="h-4 w-4" />}
          {saving && status ? status : d.id ? "Salvar alterações" : "Criar perfil"}
        </button>
      </div>
    </form>
  );
}

function PronunciationsEditor({ list, onChange }: { list: Pronunciation[]; onChange: (l: Pronunciation[]) => void }) {
  return (
    <div>
      <span className={labelClass}>Pronúncias</span>
      <p className="mt-0.5 text-xs text-text-secondary">
        Nomes e termos que a narração lê errado. Ex.: Oxyn Group → Óxin Grúp. A legenda continua com a grafia normal.
      </p>
      <ul className="mt-2 space-y-2">
        {list.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              aria-label={`Termo ${i + 1}`}
              value={p.display}
              maxLength={80}
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, display: e.target.value } : x)))}
              placeholder="Como se escreve"
              className={`!py-2 ${fieldClass}`}
            />
            <Icon name="arrow" className="h-4 w-4 shrink-0 text-text-secondary" />
            <input
              aria-label={`Como falar o termo ${i + 1}`}
              value={p.spoken}
              maxLength={160}
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, spoken: e.target.value } : x)))}
              placeholder="Como se fala"
              className={`!py-2 ${fieldClass}`}
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              aria-label={`Remover pronúncia ${i + 1}`}
              className={`shrink-0 ${iconButton}`}
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...list, { display: "", spoken: "" }])}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-yellow hover:underline"
      >
        <Icon name="plus" className="h-4 w-4" /> Adicionar pronúncia
      </button>
    </div>
  );
}

/** Texto que vai para a IA montar o estilo da empresa (junto dos arquivos). */
function brandBrief(p: VideoProfileDTO, idea: string): string {
  const parts = [
    `Estilo padrão de TODOS os vídeos da empresa ${p.name}. Estude cada arquivo enviado (guias de marca, fontes, logos e imagens) e siga a identidade visual à risca: cores exatas do guia, tipografia da marca, uso do logo e o clima das peças de referência.`,
    p.description ? `Sobre a empresa: ${p.description}` : "",
    p.tone ? `Tom de voz da marca: ${p.tone}` : "",
    p.colors ? `Cores informadas no cadastro: ${p.colors}` : "",
    idea.trim() ? `Como imaginam os vídeos: ${idea.trim()}` : "",
  ];
  return parts.filter(Boolean).join("\n").slice(0, 4000);
}

/** Situação do estilo já montado com o material da marca (link para ver/aprovar na tela de estilos). */
function BrandStyleStatus({ id, replacing }: { id: string; replacing: boolean }) {
  const [t, setT] = useState<VideoTemplateDTO | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`/api/videogen/templates/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => alive && setT(data?.template ?? null))
      .catch(() => alive && setT(null));
    return () => {
      alive = false;
    };
  }, [id]);
  if (t === undefined) return <p className="mt-3 text-xs text-text-secondary">Carregando o estilo da marca…</p>;
  if (t === null) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
      <Icon name="star" className="h-4 w-4 shrink-0 text-accent-yellow" />
      <span className="min-w-0 flex-1">
        Estilo atual: <strong>{t.name}</strong> · {TEMPLATE_STATUS_LABEL[t.status]}
        {replacing && <span className="block text-xs text-text-secondary">Ao salvar, a IA monta um estilo novo com os arquivos escolhidos.</span>}
      </span>
      <Link href="/videogen/templates" className="text-xs font-medium text-accent-yellow hover:underline">
        {t.status === "review" ? "Ver e aprovar" : "Ver estilos"}
      </Link>
    </div>
  );
}

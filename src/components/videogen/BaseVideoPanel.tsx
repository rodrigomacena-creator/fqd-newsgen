"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, Spinner, cardClass, dangerButton, labelClass, primaryButton, secondaryButton, sectionTitle } from "./ui";
import { uploadBaseFile, uploadImage } from "@/lib/videogen/uploadImage";
import { uncoveredScenes } from "@/lib/videogen/avatarPlan";
import { parseCharacter, type AvatarCharacter, type VideoProfileDTO, type VideoScript } from "@/lib/videogen/types";
import { AvatarCharacterSelect } from "./AvatarCharacterSelect";
import type { VideoJobDTO } from "@/lib/videogen/jobs";

export async function jobApi(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: { error?: string; job?: VideoJobDTO } = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: `O servidor respondeu HTTP ${res.status}${text.trim() ? `: ${text.trim().slice(0, 160)}` : ""}.` };
  }
  if (!res.ok) throw new Error(data.error || "Algo deu errado.");
  return data.job!;
}

/** Duração do arquivo pelo próprio navegador (sem subir nada). */
export function mediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(Number.isFinite(el.duration) ? el.duration : 0);
    };
    el.onerror = () => resolve(0);
    el.src = URL.createObjectURL(file);
  });
}

/** Foto que o avatar vai usar: a enviada para este vídeo, senão a do perfil de quem fala. */
export function avatarPhoto(job: VideoJobDTO, person: VideoProfileDTO | undefined): string | null {
  return job.avatarImageUrl ?? job.avatar?.imageUrl ?? person?.avatarUrl ?? null;
}

/** Quem aparece no vídeo: avatar da conta do HeyGen (do vídeo, da trilha gerada ou do perfil) e/ou a foto. */
export interface AvatarWho {
  character: AvatarCharacter | null;
  imageUrl: string | null;
}
export function avatarWho(job: VideoJobDTO, person: VideoProfileDTO | undefined): AvatarWho | null {
  const character = job.avatarCharacter ?? (job.avatar?.source === "heygen" ? job.avatar.character : null) ?? parseCharacter(person?.heygenAvatar);
  const imageUrl = avatarPhoto(job, person);
  return character || imageUrl ? { character: character ?? null, imageUrl } : null;
}

/**
 * Card de quem fala, no editor. Segue o caminho escolhido na criação:
 * - Avatar por IA: quem aparece (avatar do HeyGen ou foto), o andamento e, como opção avançada, gerar só as cenas marcadas.
 * - Áudio/vídeo enviado: o arquivo com a fala (dá para trocar ou tirar).
 * Voz por IA não tem card (a narração já tem o dela).
 */
export function BaseVideoPanel({
  job,
  script,
  person,
  disabled,
  dirty,
  onSave,
  onJob,
  onAvatarProgress,
  onStartAvatar,
  bare = false,
}: {
  job: VideoJobDTO;
  script: VideoScript;
  person: VideoProfileDTO | undefined;
  disabled: boolean;
  dirty: boolean;
  /** Salva as edições pendentes antes de mexer no vídeo base. */
  onSave: () => Promise<boolean>;
  /** Job novo vindo do servidor (recarrega o roteiro). */
  onJob: (job: VideoJobDTO) => void;
  /** Só o andamento do avatar mudou (não mexe no roteiro em edição). */
  onAvatarProgress: (job: VideoJobDTO) => void;
  /** Manda a narração aprovada pro HeyGen (mesma ação do controle de etapas). */
  onStartAvatar: (scope: "all" | "marked", who: AvatarWho | null) => Promise<void>;
  /** Sem a moldura de card nem o título (quando já está dentro de uma etapa do editor). */
  bare?: boolean;
}) {
  const avatar = job.avatar;
  const valid = Boolean(avatar && job.narrationUrl && avatar.narrationUrl === job.narrationUrl);
  const [busy, setBusy] = useState<null | "photo" | "start" | "upload" | "remove">(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "marked">("all");
  const [useVideo, setUseVideo] = useState(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // acompanha a geração do avatar
  const generating = avatar?.status === "generating";
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(async () => {
      try {
        onAvatarProgress(await jobApi(`/api/videogen/jobs/${job.id}/avatar`));
      } catch {}
    }, 8000);
    return () => clearInterval(timer);
  }, [generating, job.id, onAvatarProgress]);

  const [chosen, setChosen] = useState<AvatarCharacter | null | undefined>(undefined);
  const saved = avatarWho(job, person);
  const character = chosen === undefined ? (saved?.character ?? null) : chosen;
  const imageUrl = photo ?? saved?.imageUrl ?? null;
  const who: AvatarWho | null = character || imageUrl ? { character, imageUrl: character ? null : imageUrl } : null;
  const total = job.narrationDurationS ?? 0;
  const missing = valid && avatar ? uncoveredScenes(script, job.narrationWords, avatar, total) : [];
  // foto nova, narração nova ou nada gerado ainda: gera a trilha do zero
  const needsNew =
    !avatar || !valid || avatar.source !== "heygen" || (character ? avatar.character?.id !== character.id : Boolean(photo && photo !== avatar.imageUrl));
  const failed = !needsNew && avatar?.status === "failed";
  const done = avatar?.segments.filter((s) => s.status === "completed").length ?? 0;
  const off = disabled || busy !== null;

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const startAvatar = (sc: "all" | "marked") => run("start", () => onStartAvatar(sc, who));

  const pickFile = (file: File | undefined) =>
    file &&
    run("upload", async () => {
      if (
        script.scenes.length &&
        !window.confirm("As cenas vão ser refeitas em cima da fala do arquivo novo (o texto falado passa a ser o dele). Continuar?")
      )
        return;
      if (dirty && !(await onSave())) return;
      const durationS = await mediaDuration(file);
      setProgress(0);
      const { url, kind } = await uploadBaseFile(file, (p) => setProgress(p));
      setProgress(null);
      onJob(
        await jobApi(`/api/videogen/jobs/${job.id}/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "upload", videoUrl: url, durationS, useVideo: kind === "video" && useVideo }),
        })
      );
    });

  const remove = () =>
    run("remove", async () => {
      const msg =
        job.speaker === "upload"
          ? "Tirar a gravação? A fala vinha dela, então a narração some e o vídeo volta a ser narrado por IA (gere a narração no ElevenLabs)."
          : "Tirar o avatar? As cenas voltam a mostrar só imagens.";
      if (!window.confirm(msg)) return;
      onJob(await jobApi(`/api/videogen/jobs/${job.id}/avatar`, { method: "DELETE" }));
    });

  if (job.speaker === "upload") {
    const isVideo = Boolean(avatar?.source === "upload" && valid);
    return (
      <section className={cardClass} aria-labelledby="base-title">
        <h2 id="base-title" className={sectionTitle}>
          Sua gravação
        </h2>
        <div className="mt-4 space-y-3">
          {isVideo ? (
            <video controls preload="metadata" src={avatar!.segments[0]?.videoUrl} className="max-h-72 w-full rounded-xl bg-black object-contain" />
          ) : job.narrationUrl ? (
            <audio controls preload="metadata" src={job.narrationUrl} className="w-full" />
          ) : null}
          <p className="text-xs text-text-secondary">
            {job.narrationDurationS ? `${job.narrationDurationS.toFixed(1)}s · ` : ""}
            {isVideo
              ? "A fala virou a narração e as legendas. Na timeline, escolha em cada cena se aparece o seu vídeo ou uma imagem."
              : "A fala virou a narração e as legendas; as cenas mostram as imagens do estilo."}
          </p>
          <details className="group">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-foreground">
              <span aria-hidden className="transition group-open:rotate-90">›</span> Trocar o arquivo
            </summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={useVideo} onChange={(e) => setUseVideo(e.target.checked)} className="mt-0.5 accent-[#2D6CDF]" />
                <span>Se for vídeo, mostrar o vídeo nas cenas (desmarcado: só o áudio vira a narração)</span>
              </label>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={off} className={`w-full ${secondaryButton}`}>
                {busy === "upload" ? <Spinner /> : <Icon name="up" className="h-4 w-4" />}
                {busy === "upload"
                  ? progress !== null
                    ? `Enviando… ${Math.round(progress)}%`
                    : "Transcrevendo e montando as cenas…"
                  : "Enviar outro áudio ou vídeo"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,audio/webm"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  void pickFile(f);
                }}
              />
            </div>
          </details>
          <button type="button" onClick={remove} disabled={off} className={`-ml-3 ${dangerButton}`}>
            {busy === "remove" ? <Spinner /> : <Icon name="trash" className="h-4 w-4" />}
            Tirar a gravação (narrar por IA)
          </button>
          {error && (
            <p role="alert" className="text-xs text-accent-red [overflow-wrap:anywhere]">
              {error}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={bare ? "" : cardClass} aria-labelledby="base-title">
      <h2 id="base-title" className={bare ? "sr-only" : sectionTitle}>
        Avatar
      </h2>
      {!bare && <p className="mt-1 text-xs text-text-secondary">O HeyGen anima o avatar (ou a foto) falando a narração aprovada. Só o áudio que você aprovou vai para lá.</p>}
      <div className={`space-y-3 ${bare ? "" : "mt-4"}`}>
        <div>
          <label htmlFor="base-heygen" className={labelClass}>
            Avatar (HeyGen)
          </label>
          <div className="mt-1.5">
            <AvatarCharacterSelect id="base-heygen" value={character} onChange={setChosen} disabled={off || generating} />
          </div>
        </div>
        {!character && (
        <div className="flex items-center gap-3">
          <span className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Foto do avatar" className="h-full w-full object-cover" />
            ) : (
              <Icon name="user" className="h-6 w-6 text-text-secondary" />
            )}
          </span>
          <div className="min-w-0 text-xs text-text-secondary">
            <p>
              {imageUrl
                ? photo || job.avatarImageUrl
                  ? "Foto enviada para este vídeo."
                  : avatar?.source === "heygen" && avatar.imageUrl
                    ? "Foto usada no avatar."
                    : `Foto do perfil ${person?.name ?? "de quem fala"}.`
                : "Sem foto: envie uma (ou cadastre no perfil de quem fala)."}
            </p>
            <button type="button" onClick={() => photoInput.current?.click()} disabled={off || generating} className={`mt-1.5 !min-h-9 ${secondaryButton}`}>
              {busy === "photo" ? <Spinner /> : <Icon name="up" className="h-4 w-4" />}
              {imageUrl ? "Trocar foto" : "Enviar foto"}
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void run("photo", async () => setPhoto(await uploadImage(f, "perfis")));
              }}
            />
          </div>
        </div>
        )}

        {!job.narrationUrl ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary">Primeiro gere e aprove a narração: o avatar fala exatamente o áudio aprovado.</p>
        ) : generating ? (
          <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary" role="status">
            <Spinner /> Gerando o avatar no HeyGen: {done} de {avatar!.segments.length} trecho(s) prontos. Leva alguns minutos; pode continuar editando.
          </p>
        ) : (
          <>
            {avatar?.source === "heygen" && !valid && <p className="text-xs text-warning">A narração mudou depois do avatar. Gere o avatar de novo para ele falar a fala nova.</p>}
            {failed && <p className="text-xs text-accent-red">{avatar?.error}</p>}
            {!needsNew && avatar?.status === "ready" && missing.length === 0 && (
              <p className="text-xs text-text-secondary">
                <Icon name="check" className="mr-1 inline h-3.5 w-3.5 text-success" />
                Avatar pronto. Na timeline, clique na faixa “Avatar” de cada cena para escolher avatar ou imagem.
              </p>
            )}
            {!needsNew && missing.length > 0 && (
              <p className="text-xs text-warning">
                Cena(s) {missing.map((i) => i + 1).join(", ")} marcadas como avatar ainda sem avatar gerado.
              </p>
            )}
            {needsNew && (
              <details className="group">
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-foreground">
                  <span aria-hidden className="transition group-open:rotate-90">›</span> Opções avançadas
                </summary>
                <fieldset className="mt-1">
                  <legend className={labelClass}>Gerar para</legend>
                  <div className="mt-1.5 space-y-1.5 text-xs">
                    <label className="flex items-start gap-2">
                      <input type="radio" name="avatar-scope" checked={scope === "all"} onChange={() => setScope("all")} className="mt-0.5 accent-[#2D6CDF]" />
                      <span>
                        <b>O vídeo todo</b> (padrão: depois você troca cena por cena sem gerar de novo)
                      </span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="radio" name="avatar-scope" checked={scope === "marked"} onChange={() => setScope("marked")} className="mt-0.5 accent-[#2D6CDF]" />
                      <span>
                        <b>Só as cenas marcadas</b> como avatar (mais barato; a cena 1 entra se nada estiver marcado)
                      </span>
                    </label>
                  </div>
                </fieldset>
              </details>
            )}
            {(needsNew || failed || missing.length > 0) && (
              <button
                type="button"
                onClick={() => startAvatar(needsNew || failed ? scope : "marked")}
                disabled={off || !who}
                className={`w-full ${avatar ? secondaryButton : primaryButton}`}
              >
                {busy === "start" ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />}
                {busy === "start"
                  ? "Enviando para o HeyGen…"
                  : failed
                    ? "Tentar de novo os que falharam"
                    : !needsNew
                      ? "Gerar os trechos que faltam"
                      : avatar
                        ? "Gerar avatar de novo"
                        : bare
                          ? "Gerar o avatar"
                          : "Aprovar a narração e gerar o avatar"}
              </button>
            )}
          </>
        )}
        {avatar && !generating && (
          <button type="button" onClick={remove} disabled={off} className={`-ml-3 ${dangerButton}`}>
            {busy === "remove" ? <Spinner /> : <Icon name="trash" className="h-4 w-4" />}
            Tirar o avatar
          </button>
        )}
        {error && (
          <p role="alert" className="text-xs text-accent-red [overflow-wrap:anywhere]">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

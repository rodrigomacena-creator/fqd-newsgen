"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, Spinner, cardClass, dangerButton, labelClass, primaryButton, secondaryButton, sectionTitle } from "./ui";
import { uploadBaseFile } from "@/lib/videogen/uploadImage";
import { uncoveredScenes } from "@/lib/videogen/avatarPlan";
import { avatarStale, parseCharacter, type AvatarCharacter, type VideoProfileDTO, type VideoScript } from "@/lib/videogen/types";
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

/** Quem aparece no vídeo: avatar da conta do HeyGen (do vídeo, da trilha gerada ou do perfil de quem fala). */
export function avatarWho(job: VideoJobDTO, person: VideoProfileDTO | undefined): AvatarCharacter | null {
  return job.avatarCharacter ?? (job.avatar?.source === "heygen" ? (job.avatar.character ?? null) : null) ?? parseCharacter(person?.heygenAvatar);
}

/**
 * Card de quem fala, no editor. Segue o caminho escolhido na criação:
 * - Avatar por IA: o avatar do HeyGen (imagem e voz dele) e o andamento da geração.
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
  /** Manda o roteiro pro HeyGen gerar vídeo + voz (mesma ação do controle de etapas). */
  onStartAvatar: (character: AvatarCharacter | null) => Promise<void>;
  /** Sem a moldura de card nem o título (quando já está dentro de uma etapa do editor). */
  bare?: boolean;
}) {
  const avatar = job.avatar;
  const generating = avatar?.status === "generating";
  const stale = avatarStale(avatar, script);
  const valid = Boolean(avatar && (generating || (job.narrationUrl && avatar.narrationUrl === job.narrationUrl)) && !stale);
  const [busy, setBusy] = useState<null | "start" | "upload" | "remove">(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useVideo, setUseVideo] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  // acompanha a geração do avatar; pronto, o roteiro e a narração mudam (fala transcrita), então recarrega tudo
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(async () => {
      try {
        const next = await jobApi(`/api/videogen/jobs/${job.id}/avatar`);
        if (next.avatar?.status === "generating") onAvatarProgress(next);
        else onJob(next);
      } catch {}
    }, 8000);
    return () => clearInterval(timer);
  }, [generating, job.id, onAvatarProgress, onJob]);
  const [chosen, setChosen] = useState<AvatarCharacter | null | undefined>(undefined);
  const character = chosen === undefined ? avatarWho(job, person) : chosen;
  const total = job.narrationDurationS ?? 0;
  const missing = valid && avatar ? uncoveredScenes(script, job.narrationWords, avatar, total) : [];
  // avatar trocado, texto editado ou nada gerado ainda: gera a trilha do zero
  const needsNew = !avatar || !valid || avatar.source !== "heygen" || (character ? avatar.character?.id !== character.id : false);
  const failed = !needsNew && avatar?.status === "failed";
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

  const startAvatar = () => run("start", () => onStartAvatar(character));

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
      {!bare && <p className="mt-1 text-xs text-text-secondary">O HeyGen gera o vídeo do avatar falando o roteiro, com a imagem e a voz do próprio avatar.</p>}
      <div className={`space-y-3 ${bare ? "" : "mt-4"}`}>
        <div>
          <label htmlFor="base-heygen" className={labelClass}>
            Avatar (HeyGen)
          </label>
          <div className="mt-1.5">
            <AvatarCharacterSelect id="base-heygen" value={character} onChange={setChosen} disabled={off || generating} />
          </div>
        </div>
        {generating ? (
          <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary" role="status">
            <Spinner /> O HeyGen está gerando o vídeo com a voz. Leva alguns minutos; pode continuar editando as cenas. Quando ficar pronto, a fala é transcrita para a legenda e os cortes.
          </p>
        ) : (
          <>
            {stale && <p className="text-xs text-warning">O texto do roteiro mudou depois do avatar. Gere o avatar de novo para ele falar o texto novo.</p>}
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
            {(needsNew || failed || missing.length > 0) && (
              <button
                type="button"
                onClick={startAvatar}
                disabled={off || !character}
                className={`w-full ${avatar ? secondaryButton : `${primaryButton} !bg-foreground !text-background hover:!bg-foreground/85`}`}
              >
                {busy === "start" ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />}
                {busy === "start"
                  ? "Enviando para o HeyGen…"
                  : failed
                    ? "Tentar de novo"
                    : avatar && avatar.source === "heygen"
                      ? "Gerar avatar de novo"
                      : "Gerar o avatar"}
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

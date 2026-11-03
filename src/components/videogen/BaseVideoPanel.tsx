"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, Spinner, cardClass, dangerButton, labelClass, primaryButton, secondaryButton, sectionTitle } from "./ui";
import { uploadBaseVideo, uploadImage } from "@/lib/videogen/uploadImage";
import { uncoveredScenes } from "@/lib/videogen/avatarPlan";
import { avatarReady, type VideoProfileDTO, type VideoScript } from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";

type Mode = "none" | "higgsfield" | "upload";

async function api(url: string, init?: RequestInit) {
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

/** Duração do vídeo pelo próprio navegador (sem subir nada). */
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

/**
 * Vídeo base das cenas: só a narração (como sempre), um avatar falando gerado no Higgsfield com a
 * narração do ElevenLabs, ou um vídeo pronto seu. Com vídeo base, a timeline ganha uma trilha fixa e
 * cada cena escolhe se mostra o vídeo ou a imagem do estilo.
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
}) {
  const avatar = job.avatar;
  const valid = Boolean(avatar && job.narrationUrl && avatar.narrationUrl === job.narrationUrl);
  const [mode, setMode] = useState<Mode>(avatar ? avatar.source : "none");
  const [busy, setBusy] = useState<null | "photo" | "start" | "upload" | "remove">(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "marked">("all");
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // acompanha a geração do avatar
  const generating = avatar?.status === "generating";
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(async () => {
      try {
        onAvatarProgress(await api(`/api/videogen/jobs/${job.id}/avatar`));
      } catch {}
    }, 8000);
    return () => clearInterval(timer);
  }, [generating, job.id, onAvatarProgress]);

  const imageUrl = photo ?? (avatar?.source === "higgsfield" ? avatar.imageUrl : null) ?? person?.avatarUrl ?? null;
  const total = job.narrationDurationS ?? 0;
  const missing = valid && avatar ? uncoveredScenes(script, job.narrationWords, avatar, total) : [];
  // foto nova, narração nova ou nada gerado ainda: gera a trilha do zero
  const needsNew = !avatar || !valid || avatar.source !== "higgsfield" || Boolean(photo && photo !== avatar.imageUrl);
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

  const startAvatar = (sc: "all" | "marked") =>
    run("start", async () => {
      if (dirty && !(await onSave())) return;
      onJob(
        await api(`/api/videogen/jobs/${job.id}/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "higgsfield", imageUrl, scope: sc }),
        })
      );
    });

  const pickVideo = (file: File | undefined) =>
    file &&
    run("upload", async () => {
      if (
        script.scenes.length &&
        !window.confirm("O roteiro vai ser refeito em cima da fala do seu vídeo (as cenas viram os trechos do que você fala). Continuar?")
      )
        return;
      if (dirty && !(await onSave())) return;
      const durationS = await videoDuration(file);
      setProgress(0);
      const url = await uploadBaseVideo(file, job.id, (p) => setProgress(p));
      setProgress(null);
      onJob(
        await api(`/api/videogen/jobs/${job.id}/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "upload", videoUrl: url, durationS }),
        })
      );
    });

  const remove = () =>
    run("remove", async () => {
      const msg =
        avatar?.source === "upload"
          ? "Tirar o vídeo base? A fala vinha dele, então a narração some e você precisa gerar uma no ElevenLabs."
          : "Tirar o avatar? As cenas voltam a mostrar só imagens.";
      if (!window.confirm(msg)) return;
      onJob(await api(`/api/videogen/jobs/${job.id}/avatar`, { method: "DELETE" }));
      setMode("none");
    });

  const choices: { id: Mode; label: string; help: string }[] = [
    { id: "none", label: "Só a voz", help: "Como sempre: narração do ElevenLabs com as imagens do estilo." },
    { id: "higgsfield", label: "Avatar falando", help: "O Higgsfield anima a sua foto falando a narração do ElevenLabs." },
    { id: "upload", label: "Vídeo meu", help: "Um vídeo pronto seu vira a trilha fixa; a fala dele vira a narração." },
  ];

  return (
    <section className={cardClass} aria-labelledby="base-title">
      <h2 id="base-title" className={sectionTitle}>
        Vídeo base
      </h2>
      <div role="radiogroup" aria-label="Vídeo base" className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {choices.map((c) => {
          const active = mode === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={off || (Boolean(avatar) && c.id !== avatar?.source)}
              onClick={() => setMode(c.id)}
              title={avatar && c.id !== avatar.source ? "Tire o vídeo base atual para trocar" : c.help}
              className={`min-h-10 rounded-lg px-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-text-secondary hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-text-secondary">{choices.find((c) => c.id === mode)?.help}</p>

      {mode === "higgsfield" && (
        <div className="mt-4 space-y-3">
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
                  ? photo
                    ? "Foto enviada para este vídeo."
                    : avatar?.source === "higgsfield" && avatar.imageUrl
                      ? "Foto usada no avatar."
                      : "Foto do perfil de quem fala."
                  : "Sem foto: envie uma (ou cadastre no perfil)."}
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

          {!job.narrationUrl ? (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary">Gere a narração primeiro: o avatar fala exatamente a narração do ElevenLabs.</p>
          ) : generating ? (
            <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary" role="status">
              <Spinner /> Gerando o avatar no Higgsfield: {done} de {avatar!.segments.length} trecho(s) prontos. Leva alguns minutos; pode continuar editando.
            </p>
          ) : (
            <>
              {avatar?.source === "higgsfield" && !valid && <p className="text-xs text-warning">A narração mudou depois do avatar. Gere o avatar de novo para ele falar a fala nova.</p>}
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
                <fieldset>
                  <legend className={labelClass}>Gerar para</legend>
                  <div className="mt-1.5 space-y-1.5 text-xs">
                    <label className="flex items-start gap-2">
                      <input type="radio" name="avatar-scope" checked={scope === "all"} onChange={() => setScope("all")} className="mt-0.5 accent-[#2D6CDF]" />
                      <span>
                        <b>O vídeo todo</b> (trilha fixa inteira: depois você troca cena por cena sem gerar de novo)
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
              )}
              {(needsNew || failed || missing.length > 0) && (
                <button
                  type="button"
                  onClick={() => startAvatar(needsNew || failed ? scope : "marked")}
                  disabled={off || !imageUrl}
                  className={`w-full ${primaryButton}`}
                >
                  {busy === "start" ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />}
                  {busy === "start"
                    ? "Enviando para o Higgsfield…"
                    : failed
                      ? "Tentar de novo os que falharam"
                      : !needsNew
                        ? "Gerar os trechos que faltam"
                        : avatar
                          ? "Gerar avatar de novo"
                          : "Gerar avatar"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {mode === "upload" && (
        <div className="mt-4 space-y-3">
          {avatar?.source === "upload" && valid ? (
            <>
              <video controls preload="metadata" src={avatar.segments[0]?.videoUrl} className="max-h-72 w-full rounded-xl bg-black object-contain" />
              <p className="text-xs text-text-secondary">
                {avatarReady(avatar, job.narrationUrl) && `${avatar.durationS.toFixed(1)}s · `}A fala do vídeo virou a narração e as legendas. Escolha na timeline onde aparece o vídeo e onde
                aparece imagem.
              </p>
            </>
          ) : (
            <p className="text-xs text-text-secondary">
              MP4, MOV ou WebM, até 500 MB, com alguém falando. O app transcreve a fala, refaz o roteiro em cenas em cima dela e marca onde mostrar você e onde mostrar imagens.
            </p>
          )}
          <button type="button" onClick={() => videoInput.current?.click()} disabled={off} className={`w-full ${avatar?.source === "upload" ? secondaryButton : primaryButton}`}>
            {busy === "upload" ? <Spinner /> : <Icon name="up" className="h-4 w-4" />}
            {busy === "upload"
              ? progress !== null
                ? `Enviando o vídeo… ${Math.round(progress)}%`
                : "Transcrevendo e montando as cenas…"
              : avatar?.source === "upload"
                ? "Trocar vídeo"
                : "Enviar vídeo"}
          </button>
          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void pickVideo(f);
            }}
          />
        </div>
      )}

      {avatar && (
        <button type="button" onClick={remove} disabled={off || generating} className={`mt-3 -ml-3 ${dangerButton}`}>
          {busy === "remove" ? <Spinner /> : <Icon name="trash" className="h-4 w-4" />}
          {avatar.source === "upload" ? "Tirar o vídeo base" : "Tirar o avatar"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-accent-red [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
    </section>
  );
}

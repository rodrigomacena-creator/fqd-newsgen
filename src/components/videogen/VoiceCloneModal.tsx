"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, Spinner, fieldClass, iconButton, primaryButton, secondaryButton } from "./ui";
import { audioProblem, uploadAudio } from "@/lib/videogen/uploadImage";
import type { VideoProfileDTO } from "@/lib/videogen/types";

const MAX_FILES = 10;

function formatDuration(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/**
 * "Treinar nova voz": envia amostras (arquivos ou gravação no navegador) e cria uma voz clonada no ElevenLabs.
 * No fim, o app cria um perfil de pessoa com essa voz e devolve pra quem abriu.
 */
export function VoiceCloneModal({ onCreated, onClose }: { onCreated: (profile: VideoProfileDTO) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [removeNoise, setRemoveNoise] = useState(false);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [step, setStep] = useState<null | "upload" | "train">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // para o microfone se a janela fechar no meio de uma gravação
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((tr) => tr.stop()), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = audioProblem(f);
      if (problem) {
        setError(problem);
        continue;
      }
      if (next.length < MAX_FILES) next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const mime = (rec.mimeType || "audio/webm").split(";")[0];
        const ext = mime === "audio/mp4" ? "m4a" : "webm";
        const file = new File(chunks, `gravacao-${Date.now()}.${ext}`, { type: mime });
        setFiles((list) => (list.length < MAX_FILES ? [...list, file] : list));
      };
      recorder.current = rec;
      rec.start();
      setElapsed(0);
      setRecording(true);
    } catch {
      setError("Não consegui usar o microfone. Libere o acesso no navegador ou envie um arquivo de áudio.");
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  }

  async function train() {
    if (!name.trim() || !files.length || !consent || step) return;
    setError(null);
    try {
      setStep("upload");
      const samples = await Promise.all(files.map((f) => uploadAudio(f)));
      setStep("train");
      const res = await fetch("/api/videogen/voices/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, samples, removeNoise, consent }),
      });
      const data = (await res.json().catch(() => ({}))) as { profile?: VideoProfileDTO; error?: string };
      if (!res.ok || !data.profile) throw new Error(data.error || "Não foi possível treinar a voz.");
      onCreated(data.profile);
      ref.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setStep(null);
    }
  }

  const busy = step !== null;
  const totalMb = files.reduce((n, f) => n + f.size, 0) / 1024 / 1024;

  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      onClick={(e) => e.target === ref.current && !busy && !recording && ref.current?.close()}
      aria-labelledby="voice-clone-title"
      className="m-auto w-[min(600px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="voice-clone-title" className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="mic" className="h-4 w-4 text-accent-yellow" /> Treinar nova voz
        </h2>
        <button type="button" onClick={() => ref.current?.close()} disabled={busy} aria-label="Fechar" className={iconButton}>
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-sm text-text-secondary">
          Grave ou envie de 1 a 5 minutos de fala limpa, só da pessoa, sem música e com pouco eco. O ElevenLabs cria a voz em
          segundos (clonagem instantânea) e ela vira um novo perfil em &quot;Quem fala no vídeo&quot;.
        </p>
        <div>
          <label htmlFor="voice-name" className="text-sm font-medium">
            Nome da voz
          </label>
          <input
            id="voice-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Rodrigo narração"
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>
        <div>
          <label htmlFor="voice-desc" className="text-sm font-medium">
            Descrição <span className="font-normal text-text-secondary">(opcional)</span>
          </label>
          <input
            id="voice-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="Ex.: voz masculina, calma, sotaque paulista"
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>

        <div>
          <p className="text-sm font-medium">Amostras de áudio</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || recording || files.length >= MAX_FILES} className={secondaryButton}>
              <Icon name="plus" className="h-4 w-4" /> Enviar arquivos
            </button>
            {recording ? (
              <button type="button" onClick={stopRecording} className={`${secondaryButton} border-accent-red text-accent-red`}>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent-red motion-reduce:animate-none" /> Parar gravação ({formatDuration(elapsed)})
              </button>
            ) : (
              <button type="button" onClick={startRecording} disabled={busy || files.length >= MAX_FILES} className={secondaryButton}>
                <Icon name="mic" className="h-4 w-4" /> Gravar agora
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,.mp3,.wav,.m4a,.ogg,.webm"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          {files.length > 0 && (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Icon name="wave" className="h-4 w-4 shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-text-secondary">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button
                    type="button"
                    onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}
                    disabled={busy}
                    aria-label={`Tirar ${f.name}`}
                    className={`h-8 w-8 ${iconButton}`}
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-text-secondary">
            MP3, WAV, M4A, OGG ou WebM · até {MAX_FILES} arquivos de 25 MB{files.length > 0 && ` · ${files.length} enviado(s), ${totalMb.toFixed(1)} MB`}
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={removeNoise} onChange={(e) => setRemoveNoise(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-yellow)]" />
          <span>
            Remover ruído de fundo <span className="text-text-secondary">(use só se a gravação tiver barulho; em áudio limpo pode piorar)</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-yellow)]" />
          <span>A voz é minha ou tenho autorização da pessoa para cloná-la.</span>
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3">
        <button type="button" onClick={() => ref.current?.close()} disabled={busy} className={secondaryButton}>
          Cancelar
        </button>
        <button type="button" onClick={train} disabled={busy || recording || !name.trim() || !files.length || !consent} className={primaryButton}>
          {busy ? <Spinner className="h-4 w-4" /> : <Icon name="sparkles" className="h-4 w-4" />}
          {step === "upload" ? "Enviando áudios…" : step === "train" ? "Treinando a voz…" : "Treinar voz"}
        </button>
      </div>
    </dialog>,
    document.body
  );
}

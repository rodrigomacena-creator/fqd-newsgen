"use client";

import { useRef, useState } from "react";
import type { InstructionProfile } from "@/lib/useInstructionProfiles";

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.svg";

export function ProfileCard({
  profile,
  onSaved,
  onDeleted,
}: {
  profile: InstructionProfile;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [prompt, setPrompt] = useState(profile.prompt);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [removingFile, setRemovingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = name !== profile.name || prompt !== profile.prompt;

  let colors: string[] = [];
  if (profile.styleguideColors) {
    try {
      colors = JSON.parse(profile.styleguideColors);
    } catch {
      colors = [];
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar o perfil.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir o perfil "${profile.name}"? Essa ação não pode ser desfeita.`)) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível excluir o perfil.");
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setDeleting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFileError(null);
    setFileWarning(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/profiles/${profile.id}/styleguide`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar o arquivo.");

      if (data.extractionWarning) setFileWarning(data.extractionWarning);
      onSaved();
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveFile() {
    if (!confirm("Remover o styleguide deste perfil?")) return;

    setRemovingFile(true);
    setFileError(null);
    setFileWarning(null);
    try {
      const res = await fetch(`/api/profiles/${profile.id}/styleguide`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível remover o arquivo.");
      onSaved();
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setRemovingFile(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving || deleting}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-accent-yellow disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-text-secondary hover:text-accent-yellow"
        >
          {expanded ? "Ocultar instrução" : "Ver/editar instrução"}
        </button>
      </div>

      {expanded && (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={saving || deleting}
          rows={10}
          className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-4 py-3 font-mono text-xs leading-relaxed outline-none focus:border-accent-yellow disabled:opacity-50"
        />
      )}

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || deleting || !name.trim() || !prompt.trim()}
          className="rounded-lg bg-accent-yellow px-4 py-2 text-xs font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving || deleting}
          className="text-xs font-medium text-accent-red hover:underline disabled:opacity-50"
        >
          {deleting ? "Excluindo…" : "Excluir"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-accent-red">{error}</p>}

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs font-medium text-text-secondary">
          Styleguide (cores, logo etc.)
        </p>

        {profile.styleguideFileName ? (
          <>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <a
                href={profile.styleguidePath ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="truncate text-foreground underline hover:text-accent-yellow"
                title={profile.styleguideFileName}
              >
                {profile.styleguideFileName}
              </a>
              <button
                type="button"
                onClick={handleRemoveFile}
                disabled={removingFile}
                className="shrink-0 font-medium text-accent-red hover:underline disabled:opacity-50"
              >
                {removingFile ? "Removendo…" : "Remover"}
              </button>
            </div>

            {colors.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                {colors.map((hex) => (
                  <span
                    key={hex}
                    title={hex}
                    style={{ backgroundColor: hex }}
                    className="h-5 w-5 rounded-full border border-border"
                  />
                ))}
                <span className="ml-1 text-[11px] text-text-secondary/70">
                  cores extraídas usadas nos prompts de imagem
                </span>
              </div>
            )}

            {profile.styleguideSummary && (
              <p className="mt-2 line-clamp-2 text-[11px] text-text-secondary/70">
                {profile.styleguideSummary}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs text-text-secondary/70">
            Nenhum arquivo enviado ainda.
          </p>
        )}

        {fileWarning && <p className="mt-2 text-xs text-accent-yellow">{fileWarning}</p>}

        <div className="mt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            disabled={uploading}
            className="text-xs text-text-secondary file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground hover:file:border-accent-yellow disabled:opacity-50"
          />
          {uploading && <p className="mt-1 text-xs text-accent-yellow">Enviando…</p>}
        </div>

        <p className="mt-1 text-[11px] text-text-secondary/60">
          PDF, PNG, JPG ou SVG — até 15MB.
        </p>

        {fileError && <p className="mt-2 text-xs text-accent-red">{fileError}</p>}
      </div>
    </div>
  );
}

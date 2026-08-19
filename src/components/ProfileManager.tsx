"use client";

import { useState } from "react";
import { useInstructionProfiles } from "@/lib/useInstructionProfiles";
import { DEFAULT_ARTICLE_PROMPT } from "@/lib/prompts";
import { ProfileCard } from "./ProfileCard";

export function ProfileManager() {
  const { profiles, loading, error, reload } = useInstructionProfiles();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState(DEFAULT_ARTICLE_PROMPT);
  const [newMaxSectionImages, setNewMaxSectionImages] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function startCreating() {
    setNewName("");
    setNewPrompt(DEFAULT_ARTICLE_PROMPT);
    setNewMaxSectionImages("");
    setCreateError(null);
    setCreating(true);
  }

  async function handleCreate() {
    if (!newName.trim() || !newPrompt.trim()) return;

    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          prompt: newPrompt,
          maxSectionImages:
            newMaxSectionImages.trim() === "" ? null : Number(newMaxSectionImages),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o perfil.");

      setCreating(false);
      await reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Perfis de instrução
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Crie um perfil por destino (ex.: &quot;Esquadrias&quot; com tom técnico,
            &quot;Canal Humor&quot; com tom descontraído). Ao gerar uma notícia, você
            escolhe qual perfil usar.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={startCreating}
            className="shrink-0 rounded-lg bg-accent-yellow px-4 py-2 text-xs font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90"
          >
            + Novo perfil
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          {error}
        </p>
      )}

      {creating && (
        <div className="mt-4 rounded-xl border border-accent-yellow/40 bg-surface p-4">
          <label htmlFor="new-profile-name" className="text-sm font-medium">
            Nome do perfil
          </label>
          <input
            id="new-profile-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ex.: Esquadrias, Canal Humor…"
            disabled={saving}
            className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
          />

          <label htmlFor="new-profile-prompt" className="mt-4 block text-sm font-medium">
            Instrução (já começa com o padrão neutro — edite à vontade)
          </label>
          <textarea
            id="new-profile-prompt"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            disabled={saving}
            rows={10}
            className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-4 py-3 font-mono text-xs leading-relaxed outline-none focus:border-accent-yellow disabled:opacity-50"
          />

          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="new-profile-max-images" className="text-xs text-text-secondary">
              Máximo de imagens de seção
            </label>
            <input
              id="new-profile-max-images"
              type="number"
              min={0}
              step={1}
              value={newMaxSectionImages}
              onChange={(e) => setNewMaxSectionImages(e.target.value)}
              disabled={saving}
              placeholder="sem limite"
              className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent-yellow disabled:opacity-50"
            />
            <span className="text-[11px] text-text-secondary/70">
              vazio = gera imagem em todas as seções
            </span>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !newName.trim() || !newPrompt.trim()}
              className="rounded-lg bg-accent-yellow px-4 py-2 text-xs font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Criando…" : "Criar perfil"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              disabled={saving}
              className="text-xs font-medium text-text-secondary hover:text-foreground"
            >
              Cancelar
            </button>
          </div>

          {createError && <p className="mt-2 text-xs text-accent-red">{createError}</p>}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {!loading && profiles.length === 0 && !creating && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary">
            Nenhum perfil criado ainda. Sem perfil, as notícias usam a instrução
            neutra padrão do app.
          </p>
        )}

        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            onSaved={reload}
            onDeleted={reload}
          />
        ))}
      </div>
    </div>
  );
}

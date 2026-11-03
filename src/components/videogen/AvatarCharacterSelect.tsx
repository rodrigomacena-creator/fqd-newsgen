"use client";

import { fieldClass } from "@/components/videogen/ui";
import { useHeygenCharacters } from "@/lib/videogen/useHeygenCharacters";
import type { AvatarCharacter } from "@/lib/videogen/types";

/**
 * Seletor de quem aparece no vídeo: um avatar (ou foto animada) já cadastrado na conta do HeyGen, como as
 * vozes do ElevenLabs. Imagem e voz vêm do próprio avatar (voz padrão dele no HeyGen).
 */
export function AvatarCharacterSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: AvatarCharacter | null;
  onChange: (c: AvatarCharacter | null) => void;
  disabled?: boolean;
}) {
  const { characters, error, loading } = useHeygenCharacters();
  // o escolhido pode ter sido apagado da conta: continua na lista pra não sumir
  const list = value && !characters.some((c) => c.id === value.id) ? [value, ...characters] : characters;
  return (
    <div>
      <div className="flex items-center gap-3">
        {value?.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.previewUrl} alt="" className="h-11 w-11 shrink-0 rounded-full border border-border object-cover" />
        )}
        <select
          id={id}
          value={value?.id ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(list.find((c) => c.id === e.target.value) ?? null)}
          className={`${fieldClass} bg-background text-foreground`}
        >
          <option value="" className="bg-background text-foreground">
            {loading && list.length === 0 ? "Carregando os avatares…" : "Escolha o avatar"}
          </option>
          {list.map((c) => (
            <option key={c.id} value={c.id} className="bg-background text-foreground">
              {c.name || c.id}
              {c.kind === "talking_photo" ? " (foto animada)" : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {loading && list.length === 0
          ? "Buscando os avatares da sua conta do HeyGen…"
          : error
            ? `Lista do HeyGen indisponível (${error}).`
            : list.length === 0
              ? "Nenhum avatar na sua conta do HeyGen ainda: crie lá e volte aqui."
              : "Avatares criados na sua conta do HeyGen. O vídeo sai com a imagem e a voz padrão do avatar."}
      </p>
    </div>
  );
}

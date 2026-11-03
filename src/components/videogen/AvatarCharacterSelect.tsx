"use client";

import { fieldClass } from "@/components/videogen/ui";
import { useHeygenCharacters } from "@/lib/videogen/useHeygenCharacters";
import type { AvatarCharacter } from "@/lib/videogen/types";

export const PHOTO_OPTION = "__foto__";

/**
 * Seletor de quem aparece no vídeo: um avatar/foto animada já cadastrado na conta do HeyGen
 * (como as vozes do ElevenLabs) ou "usar a foto" (a foto enviada vira foto animada lá).
 */
export function AvatarCharacterSelect({
  id,
  value,
  onChange,
  photoLabel = "Usar a foto (abaixo)",
  disabled,
}: {
  id: string;
  value: AvatarCharacter | null;
  onChange: (c: AvatarCharacter | null) => void;
  photoLabel?: string;
  disabled?: boolean;
}) {
  const { characters, error, loading } = useHeygenCharacters();
  // o escolhido pode ter sido apagado da conta: continua na lista pra não sumir
  const list = value && !characters.some((c) => c.id === value.id) ? [value, ...characters] : characters;
  return (
    <div>
      <select
        id={id}
        value={value?.id ?? PHOTO_OPTION}
        disabled={disabled}
        onChange={(e) => onChange(list.find((c) => c.id === e.target.value) ?? null)}
        className={`${fieldClass} bg-background text-foreground`}
      >
        <option value={PHOTO_OPTION} className="bg-background text-foreground">
          {photoLabel}
        </option>
        {list.length > 0 && (
          <optgroup label="Avatares da conta do HeyGen" className="bg-background text-foreground">
            {list.map((c) => (
              <option key={c.id} value={c.id} className="bg-background text-foreground">
                {c.name || c.id}
                {c.kind === "talking_photo" ? " (foto animada)" : ""}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="mt-1 text-xs text-text-secondary">
        {loading ? "Buscando os avatares da conta do HeyGen… (dá para usar a foto enquanto isso)" : error ? `Lista do HeyGen indisponível (${error}). Dá para usar a foto.` : list.length === 0 ? "Nenhum avatar na conta do HeyGen ainda: crie lá ou use a foto." : "Avatares criados na sua conta do HeyGen. Ou use a foto: ela vira uma foto animada lá."}
      </p>
    </div>
  );
}

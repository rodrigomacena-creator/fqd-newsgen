"use client";

// Formulário do template "do zero": material da marca (logos, guia, fontes, efeitos, trilha, imagens) +
// a ideia escrita do template. Sobe os arquivos direto pro Blob e cria o template (origin = "brand").
import { useRef, useState, type FormEvent } from "react";
import { AutoTextarea, Icon, Spinner, cardClass, fieldClass, iconButton, primaryButton, sectionTitle } from "@/components/videogen/ui";
import { brandAccept, brandFileProblem, newBrandFolder, uploadBrandFile, type BrandUploadKind } from "@/lib/videogen/uploadImage";
import type { VideoTemplateDTO } from "@/lib/videogen/templates";
import type { BrandAssetKind, BrandAssets, BrandSfxRole } from "@/lib/videogen/types";

interface Section {
  kind: BrandAssetKind;
  upload: BrandUploadKind;
  title: string;
  hint: string;
  max: number;
  icon: string;
}

const SECTIONS: Section[] = [
  { kind: "logos", upload: "logo", title: "Logos", hint: "PNG com fundo transparente funciona melhor. SVG também vale. O 1º é o principal.", max: 4, icon: "star" },
  { kind: "guides", upload: "guia", title: "Guia de marca", hint: "Manual da marca em PDF ou imagens: cores, tipografia, tom de voz. Pode mandar mais de um.", max: 6, icon: "doc" },
  { kind: "fonts", upload: "fonte", title: "Fontes", hint: "Arquivos .ttf, .otf, .woff ou .woff2. A IA escolhe onde usar cada uma.", max: 6, icon: "edit" },
  { kind: "sfx", upload: "sfx", title: "Efeitos sonoros", hint: "Trocam os efeitos padrão: diga em que momento cada um entra.", max: 8, icon: "wave" },
  { kind: "music", upload: "trilha", title: "Trilha", hint: "Opcional. Se enviar, ela toca em todos os vídeos do template; sem ela, a IA gera.", max: 1, icon: "music" },
  { kind: "images", upload: "imagem", title: "Imagens de referência", hint: "Opcional. Posts, fotos ou peças que mostram o visual que você quer.", max: 6, icon: "image" },
];

const SFX_ROLES: { value: BrandSfxRole; label: string }[] = [
  { value: "transicao", label: "Transição (nos cortes)" },
  { value: "impacto", label: "Impacto (abertura, destaques, fecho)" },
  { value: "subida", label: "Subida (antes do fecho)" },
];

function guessRole(name: string): BrandSfxRole {
  const n = name.toLowerCase();
  if (/whoosh|swoosh|swish|transi|swipe|wipe/.test(n)) return "transicao";
  if (/rise|riser|subida|build|tension/.test(n)) return "subida";
  return "impacto";
}

export interface Picked {
  id: string;
  file: File;
  role?: BrandSfxRole;
}

export type PickedMap = Record<BrandAssetKind, Picked[]>;

const EMPTY: PickedMap = { logos: [], guides: [], fonts: [], sfx: [], music: [], images: [] };

/** Arquivos da marca escolhidos no navegador (ainda não enviados). Usado aqui e no cadastro da empresa. */
export function useBrandPicker() {
  const [picked, setPicked] = useState<PickedMap>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const counter = useRef(0);
  const total = Object.values(picked).reduce((n, list) => n + list.length, 0);

  function add(section: Section, files: FileList | null) {
    setProblem(null);
    if (!files?.length) return;
    const problems: string[] = [];
    const next: Picked[] = [];
    for (const file of Array.from(files)) {
      const problem = brandFileProblem(file, section.upload);
      if (problem) problems.push(problem);
      else next.push({ id: `f${counter.current++}`, file, role: section.kind === "sfx" ? guessRole(file.name) : undefined });
    }
    const merged = section.max === 1 ? next.slice(0, 1) : [...picked[section.kind], ...next];
    if (merged.length > section.max) problems.push(`${section.title}: no máximo ${section.max} arquivos.`);
    setPicked((p) => ({ ...p, [section.kind]: merged.slice(0, section.max) }));
    if (problems.length) setProblem(problems.join(" "));
  }

  function remove(kind: BrandAssetKind, id: string) {
    setPicked((p) => ({ ...p, [kind]: p[kind].filter((f) => f.id !== id) }));
  }

  function setRole(id: string, role: BrandSfxRole) {
    setPicked((p) => ({ ...p, sfx: p.sfx.map((f) => (f.id === id ? { ...f, role } : f)) }));
  }

  return { picked, total, problem, add, remove, setRole, reset: () => setPicked(EMPTY) };
}

/** Sobe tudo pro Blob (uma pasta nova) e devolve o material no formato do template. */
export async function uploadPicked(picked: PickedMap, onProgress: (done: number, total: number) => void): Promise<BrandAssets> {
  const total = Object.values(picked).reduce((n, list) => n + list.length, 0);
  const folder = newBrandFolder();
  const assets: BrandAssets = { logos: [], guides: [], fonts: [], sfx: [], music: [], images: [] };
  let done = 0;
  for (const section of SECTIONS) {
    for (const p of picked[section.kind]) {
      onProgress(done + 1, total);
      const url = await uploadBrandFile(p.file, section.upload, folder);
      assets[section.kind].push({ url, name: p.file.name, ...(p.role ? { role: p.role } : {}) });
      done++;
    }
  }
  return assets;
}

/** Grade com uma caixa por tipo de arquivo (arrastar e soltar ou escolher, vários por tipo). */
export function BrandMaterialGrid({ picker, disabled }: { picker: ReturnType<typeof useBrandPicker>; disabled: boolean }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {SECTIONS.map((section) => (
        <AssetSection
          key={section.kind}
          section={section}
          files={picker.picked[section.kind]}
          disabled={disabled}
          onAdd={(files) => picker.add(section, files)}
          onRemove={(id) => picker.remove(section.kind, id)}
          onRole={picker.setRole}
        />
      ))}
    </div>
  );
}

const IDEA_EXAMPLES = [
  "Animações suaves, títulos entrando com desfoque",
  "Cortes rápidos com chicote, bem energético",
  "Trilha acústica lo-fi, clima de manhã",
  "Logo pequeno no canto de cima o vídeo todo",
];

export function BrandTemplateForm({ onCreated }: { onCreated: (t: VideoTemplateDTO) => void }) {
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const picker = useBrandPicker();
  const { picked, total } = picker;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [submitError, setError] = useState<string | null>(null);
  const error = submitError ?? picker.problem;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!brief.trim() && total === 0) {
      setError("Envie o material da marca ou escreva a ideia do template.");
      document.getElementById("brand-brief")?.focus();
      return;
    }
    setBusy(true);
    try {
      const assets = await uploadPicked(picked, (done, n) => setStatus(`Enviando arquivos… ${done} de ${n}`));
      setStatus("Criando o template…");
      const res = await fetch("/api/videogen/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "brand", name, brief, brandAssets: assets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar o template.");
      onCreated(data.template);
      setName("");
      setBrief("");
      picker.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado no envio.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={`${cardClass} min-w-0 space-y-5`} aria-busy={busy}>
      <h2 className={sectionTitle}>Template da sua marca</h2>

      <div>
        <label htmlFor="brand-brief" className="block text-sm font-medium">
          Ideia do template <span aria-hidden>*</span>
        </label>
        <p className="mt-0.5 text-xs text-text-secondary">
          Descreva como você imagina os vídeos: animações, ritmo dos cortes, clima, trilha, onde vai o logo, o que evitar.
        </p>
        <AutoTextarea
          id="brand-brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={4000}
          minRows={4}
          disabled={busy}
          placeholder="Ex.: vídeos acolhedores para o Instagram do café, com animações suaves, títulos entrando com desfoque, partículas douradas e trilha acústica lo-fi. Logo pequeno no canto de cima."
          className={`mt-2 ${fieldClass}`}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {IDEA_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={busy}
              onClick={() => setBrief((b) => (b.trim() ? `${b.trim()}. ${ex}` : ex))}
              className="min-h-8 rounded-full border border-border px-3 text-xs text-text-secondary transition hover:border-accent-yellow hover:text-foreground"
            >
              + {ex}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium">Material da marca</span>
        <p className="mt-0.5 text-xs text-text-secondary">
          Tudo opcional, mas quanto mais material, mais a cara da marca. Cores e tom de voz saem do guia.
        </p>
        <BrandMaterialGrid picker={picker} disabled={busy} />
      </div>

      <div>
        <label htmlFor="brand-name" className="block text-sm font-medium">
          Nome do estilo <span className="font-normal text-text-secondary">(opcional)</span>
        </label>
        <input
          id="brand-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          disabled={busy}
          placeholder="A IA sugere um se ficar vazio"
          className={`mt-2 ${fieldClass}`}
        />
      </div>

      {error && (
        <div role="alert" className="flex gap-2 rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
        </div>
      )}

      <button type="submit" disabled={busy} className={`w-full py-3.5 ${primaryButton}`}>
        {busy ? <Spinner className="h-4 w-4" /> : <Icon name="sparkles" className="h-4 w-4" />}
        {busy ? status ?? "Enviando…" : "Criar template com IA"}
      </button>
      <p className="text-center text-xs text-text-secondary">
        A IA estuda o material e o servidor de render monta um exemplo de 8s (2 a 5 minutos). Depois você pede ajustes até aprovar.
      </p>
    </form>
  );
}

function AssetSection({
  section,
  files,
  disabled,
  onAdd,
  onRemove,
  onRole,
}: {
  section: Section;
  files: Picked[];
  disabled: boolean;
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onRole: (id: string, role: BrandSfxRole) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = files.length >= section.max;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) onAdd(e.dataTransfer.files);
      }}
      className={`min-w-0 rounded-xl border p-3 transition ${dragging ? "border-accent-yellow bg-accent-yellow/5" : "border-border"}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-secondary">
          <Icon name={section.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{section.title}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{section.hint}</p>
        </div>
      </div>
      {files.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs" title={f.file.name}>
                  {f.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  disabled={disabled}
                  aria-label={`Tirar ${f.file.name}`}
                  className={`-my-1 -mr-1.5 h-8 w-8 ${iconButton}`}
                >
                  <Icon name="x" className="h-3.5 w-3.5" />
                </button>
              </div>
              {section.kind === "sfx" && (
                <select
                  value={f.role}
                  onChange={(e) => onRole(f.id, e.target.value as BrandSfxRole)}
                  disabled={disabled}
                  aria-label={`Quando ${f.file.name} toca`}
                  className="mt-1 min-h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
                >
                  {SFX_ROLES.map((r) => (
                    <option key={r.value} value={r.value} className="bg-background text-foreground">
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple={section.max > 1}
        accept={brandAccept(section.upload)}
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
        disabled={disabled || full}
        className="sr-only"
        aria-label={`Adicionar ${section.title.toLowerCase()}`}
      />
      {!full && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="mt-2.5 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs font-medium text-text-secondary transition hover:border-accent-yellow hover:text-foreground"
        >
          <Icon name="plus" className="h-3.5 w-3.5" /> {files.length ? "Adicionar mais" : "Adicionar"}
        </button>
      )}
    </div>
  );
}

"use client";

// Inspector da cena: grafismo animado (motion graphics) desenhado na tela no lugar da imagem.
// Formato em src/lib/videogen/graphics.ts (espelho de worker/render/mograph.py).
import { useState } from "react";
import { AutoTextarea } from "./ui";
import {
  GRAPHIC_LABELS,
  GRAPHIC_TYPES,
  type GraphicItem,
  type GraphicType,
  type SceneGraphic,
} from "@/lib/videogen/graphics";

const field =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-secondary/70 focus:border-[#FF3B3B] focus-visible:ring-2 focus-visible:ring-[#FF3B3B]/25 disabled:cursor-not-allowed disabled:opacity-50";
const label =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary";
const small = "text-[11px] font-medium text-text-secondary";

/** Exemplo ao trocar de tipo, para a pessoa ver o formato. */
const STARTERS: Record<GraphicType, SceneGraphic> = {
  counter: { type: "counter", value: "87%", label: "" },
  donut: { type: "donut", value: "64%", label: "" },
  bars: {
    type: "bars",
    items: [
      { label: "A", value: "10" },
      { label: "B", value: "20" },
    ],
  },
  ranking: {
    type: "ranking",
    items: [{ label: "Primeiro" }, { label: "Segundo" }, { label: "Terceiro" }],
  },
  rank_item: {
    type: "rank_item",
    rank: "1",
    label: "",
    value: "",
    sub: "",
    header: "",
  },
  line_chart: {
    type: "line_chart",
    points: [10, 14, 22, 41],
    labels: [],
    label: "",
  },
  steps: { type: "steps", items: [{ label: "Passo 1" }, { label: "Passo 2" }] },
  checklist: {
    type: "checklist",
    items: [{ label: "Item 1" }, { label: "Item 2" }],
  },
  versus: {
    type: "versus",
    left: { label: "Antes" },
    right: { label: "Depois" },
  },
  timeline: {
    type: "timeline",
    items: [
      { label: "2024", text: "" },
      { label: "2025", text: "" },
    ],
  },
  icon: { type: "icon", icon: "rocket", label: "" },
  icons: {
    type: "icons",
    items: [
      { icon: "clock", label: "Rápido" },
      { icon: "shield", label: "Seguro" },
    ],
  },
};

/** Como cada tipo de lista vira linhas "a | b" no textarea. */
const LIST_SHAPE: Partial<
  Record<
    GraphicType,
    { keys: [keyof GraphicItem, keyof GraphicItem]; hint: string }
  >
> = {
  bars: { keys: ["label", "value"], hint: "Uma barra por linha: nome | valor" },
  ranking: {
    keys: ["label", "value"],
    hint: "1º lugar na primeira linha: nome | valor (opcional)",
  },
  steps: {
    keys: ["label", "icon"],
    hint: "Uma etapa por linha: texto | ícone (opcional, em inglês)",
  },
  checklist: { keys: ["label", "icon"], hint: "Um item por linha" },
  icons: {
    keys: ["icon", "label"],
    hint: "Um por linha: ícone em inglês | texto",
  },
  timeline: {
    keys: ["label", "text"],
    hint: "Um marco por linha: ano | texto",
  },
};

function toLines(
  items: GraphicItem[] | undefined,
  keys: [keyof GraphicItem, keyof GraphicItem],
): string {
  return (items ?? [])
    .map((i) =>
      [i[keys[0]] ?? "", i[keys[1]] ?? ""]
        .filter((x, n) => n === 0 || x)
        .join(" | "),
    )
    .join("\n");
}

function fromLines(
  text: string,
  keys: [keyof GraphicItem, keyof GraphicItem],
): GraphicItem[] {
  return text
    .split("\n")
    .map((l) => l.split("|").map((p) => p.trim()))
    .filter((p) => p[0] || p[1])
    .slice(0, 6)
    .map((p) => ({
      ...(p[0] ? { [keys[0]]: p[0] } : {}),
      ...(p[1] ? { [keys[1]]: p[1] } : {}),
    }));
}

export function GraphicFields({
  index,
  graphic,
  disabled,
  onChange,
}: {
  index: number;
  graphic: SceneGraphic | undefined;
  disabled: boolean;
  onChange: (g: SceneGraphic | undefined) => void;
}) {
  const id = (k: string) => `scene-${index}-g-${k}`;
  const set = (patch: Partial<SceneGraphic>) =>
    graphic && onChange({ ...graphic, ...patch });
  const text = (
    k: keyof SceneGraphic,
    title: string,
    placeholder = "",
    max = 40,
  ) => (
    <div>
      <label htmlFor={id(k)} className={small}>
        {title}
      </label>
      <input
        id={id(k)}
        value={(graphic?.[k] as string | undefined) ?? ""}
        placeholder={placeholder}
        maxLength={max}
        disabled={disabled}
        onChange={(e) => set({ [k]: e.target.value })}
        className={`mt-1 ${field}`}
      />
    </div>
  );
  const shape = graphic ? LIST_SHAPE[graphic.type] : undefined;

  return (
    <div>
      <label htmlFor={id("type")} className={label}>
        Grafismo animado
      </label>
      <select
        id={id("type")}
        value={graphic?.type ?? ""}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            e.target.value
              ? STARTERS[e.target.value as GraphicType]
              : undefined,
          )
        }
        className={`mt-1.5 h-10 !py-0 ${field.replace("bg-surface", "bg-background")}`}
      >
        <option value="" className="bg-background text-foreground">
          Nenhum (usa a imagem)
        </option>
        {GRAPHIC_TYPES.map((t) => (
          <option key={t} value={t} className="bg-background text-foreground">
            {GRAPHIC_LABELS[t]}
          </option>
        ))}
      </select>
      {graphic && (
        <div className="mt-2.5 space-y-2.5 rounded-xl border border-border p-3">
          {(graphic.type === "counter" || graphic.type === "donut") && (
            <>
              {text(
                "value",
                graphic.type === "donut" ? "Porcentagem" : "Número",
                graphic.type === "donut" ? "64%" : "R$ 1,2 mi",
                24,
              )}
              {graphic.type === "counter" &&
                text("from", "Começa em (opcional)", "0", 24)}
              {text("label", "Legenda do número")}
            </>
          )}
          {graphic.type === "rank_item" && (
            <>
              <div className="grid grid-cols-[72px_1fr] gap-2">
                {text("rank", "Posição", "1", 6)}
                {text("label", "Nome")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {text("value", "Valor", "25 anos", 24)}
                {text("sub", "Detalhe", "273 dias")}
              </div>
              {text("header", "Título fixo do ranking", "Mais jovens campeões")}
              <p className={small}>
                Use cenas seguidas com o mesmo título: a posição e o valor rolam
                de uma para a outra. A imagem da cena atravessa a tela.
              </p>
            </>
          )}
          {shape && (
            <ListField
              key={`${index}-${graphic.type}`}
              id={id("items")}
              hint={shape.hint}
              initial={toLines(graphic.items, shape.keys)}
              disabled={disabled}
              onChange={(t) => set({ items: fromLines(t, shape.keys) })}
            />
          )}
          {graphic.type === "bars" &&
            text("unit", "Unidade (opcional)", "mi", 12)}
          {graphic.type === "line_chart" && (
            <>
              <ListField
                key={`${index}-points`}
                id={id("points")}
                hint="Valores separados por vírgula"
                initial={(graphic.points ?? []).join(", ")}
                disabled={disabled}
                onChange={(t) =>
                  set({
                    points: t
                      .split(/[,;\s]+/)
                      .map((x) => Number(x))
                      .filter((x) => Number.isFinite(x))
                      .slice(0, 12),
                  })
                }
              />
              <ListField
                key={`${index}-labels`}
                id={id("labels")}
                hint="Rótulos do eixo, separados por vírgula (opcional)"
                initial={(graphic.labels ?? []).join(", ")}
                disabled={disabled}
                onChange={(t) =>
                  set({
                    labels: t
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .slice(0, 12),
                  })
                }
              />
              {text("label", "Título do gráfico")}
            </>
          )}
          {graphic.type === "versus" && (
            <div className="grid grid-cols-2 gap-2">
              {(["left", "right"] as const).map((side) => (
                <div key={side} className="space-y-1.5">
                  <p className={small}>
                    {side === "left" ? "Esquerda" : "Direita (destaque)"}
                  </p>
                  {(["label", "value", "icon"] as const).map((k) => (
                    <input
                      key={k}
                      aria-label={`${side === "left" ? "Esquerda" : "Direita"}: ${k === "label" ? "nome" : k === "value" ? "valor" : "ícone"}`}
                      value={graphic[side]?.[k] ?? ""}
                      placeholder={
                        k === "label"
                          ? "Nome"
                          : k === "value"
                            ? "Valor"
                            : "Ícone (inglês)"
                      }
                      maxLength={30}
                      disabled={disabled}
                      onChange={(e) =>
                        set({
                          [side]: { ...graphic[side], [k]: e.target.value },
                        })
                      }
                      className={field}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
          {graphic.type === "icon" && (
            <>
              {text("icon", "Ícone (nome em inglês)", "rocket", 30)}
              {text("label", "Texto embaixo")}
            </>
          )}
          <p className={small}>
            O grafismo é desenhado ao vivo no meio da tela, no lugar da imagem.
            Ícones: nomes da biblioteca Lucide em inglês (search, heart,
            trophy...).
          </p>
        </div>
      )}
    </div>
  );
}

/** Textarea com texto próprio (não reformata enquanto a pessoa digita). */
function ListField({
  id,
  hint,
  initial,
  disabled,
  onChange,
}: {
  id: string;
  hint: string;
  initial: string;
  disabled: boolean;
  onChange: (t: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <label htmlFor={id} className={small}>
        {hint}
      </label>
      <AutoTextarea
        id={id}
        minRows={2}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        className={`mt-1 ${field}`}
      />
    </div>
  );
}

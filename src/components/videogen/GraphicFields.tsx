"use client";

// Inspector da cena: grafismo animado (motion graphics) desenhado na tela no lugar da imagem.
// Formato em src/lib/videogen/graphics.ts (espelho de worker/render/mograph.py).
import { useState } from "react";
import { AutoTextarea } from "./ui";
import {
  FX_GRAPHICS,
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
  particle_text: { type: "particle_text", text: "Motion", sub: "" },
  liquid_text: { type: "liquid_text", text: "Energia", sub: "" },
  split_reveal: { type: "split_reveal", text: "Surpresa", sub: "" },
  kinetic_poster: {
    type: "kinetic_poster",
    items: [{ label: "Rápido" }, { label: "Bonito" }, { label: "Seu" }],
  },
  morph: {
    type: "morph",
    items: [{ label: "Forma" }, { label: "Cor" }, { label: "Ritmo" }],
  },
  globe: { type: "globe", label: "Alcance global", sub: "" },
  route: { type: "route", from: "São Paulo", to: "Lisboa", value: "" },
  flip_clock: { type: "flip_clock", value: "2026", label: "" },
  chat: {
    type: "chat",
    items: [{ text: "Oi! Tudo bem?" }, { text: "Tudo ótimo!", side: "right" }],
  },
  phone: {
    type: "phone",
    label: "",
    items: [{ label: "Curtidas", text: "+1.240 no seu Reel", icon: "heart" }],
  },
  iso_bars: {
    type: "iso_bars",
    items: [
      { label: "2024", value: "28" },
      { label: "2025", value: "47" },
    ],
  },
  equalizer: { type: "equalizer", text: "", icon: "mic" },
  burst: { type: "burst", text: "Lançou!", icon: "rocket" },
  loader: { type: "loader", text: "Pronto" },
  card_stack: {
    type: "card_stack",
    items: [
      { label: "Passo 1", text: "" },
      { label: "Passo 2", text: "" },
    ],
  },
  code: { type: "code", lines: ["const ideia = 'vídeo'", "render(ideia)"], output: "" },
  orbit: {
    type: "orbit",
    text: "Você",
    items: [{ icon: "camera" }, { icon: "music" }, { icon: "mail" }],
  },
  search: {
    type: "search",
    text: "como fazer um vídeo",
    items: [{ label: "Resultado", text: "" }],
  },
  glitch_text: { type: "glitch_text", text: "Glitch", sub: "" },
  stretch_text: { type: "stretch_text", text: "Elástico", sub: "" },
  wave_text: { type: "wave_text", text: "Onda", sub: "" },
  echo_text: { type: "echo_text", text: "Eco", sub: "" },
  scramble_text: { type: "scramble_text", text: "Segredo", sub: "" },
  marquee: { type: "marquee", items: [{ label: "Rápido" }, { label: "Fácil" }] },
  highlight_text: { type: "highlight_text", text: "O segredo é o ritmo", value: "ritmo" },
  quote: { type: "quote", text: "", label: "" },
  countdown: { type: "countdown", value: "3", text: "Já!" },
  kaleidoscope: { type: "kaleidoscope", text: "Padrão", sub: "" },
  tunnel: { type: "tunnel", text: "Velocidade", sub: "" },
  dot_wave: { type: "dot_wave", text: "Pulso", sub: "" },
  blob: { type: "blob", text: "Fluido", sub: "" },
  spiro: { type: "spiro", text: "Precisão", sub: "" },
  helix: { type: "helix", text: "DNA", sub: "" },
  fireworks: { type: "fireworks", text: "Parabéns!" },
  cube: { type: "cube", items: [{ label: "Ideia" }, { label: "Vídeo" }] },
  activity_rings: { type: "activity_rings", label: "", items: [{ label: "Meta", value: "80%" }] },
  pie: {
    type: "pie",
    label: "",
    items: [
      { label: "A", value: "60" },
      { label: "B", value: "40" },
    ],
  },
  bubbles: {
    type: "bubbles",
    label: "",
    items: [
      { label: "A", value: "10" },
      { label: "B", value: "5" },
    ],
  },
  funnel: {
    type: "funnel",
    label: "",
    items: [
      { label: "Visitas", value: "10 mil" },
      { label: "Clientes", value: "300" },
    ],
  },
  venn: { type: "venn", items: [{ label: "A" }, { label: "B" }], text: "" },
  calendar_grid: { type: "calendar_grid", label: "", value: "30 dias" },
  candles: { type: "candles", label: "", value: "+120%" },
  gauge: { type: "gauge", label: "", value: "87%" },
  battery: { type: "battery", label: "", value: "100%" },
  thermometer: { type: "thermometer", label: "", value: "40°" },
  rating: { type: "rating", value: "4.9", label: "", text: "" },
  cursor_click: { type: "cursor_click", label: "", text: "Clique aqui" },
  like_button: { type: "like_button", value: "1.000", label: "" },
  price_tag: { type: "price_tag", from: "R$ 199", to: "R$ 99", label: "" },
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
  kinetic_poster: { keys: ["label", "text"], hint: "Uma palavra por linha" },
  morph: { keys: ["label", "text"], hint: "Uma palavra por linha (uma forma cada)" },
  chat: {
    keys: ["text", "side"],
    hint: "Uma mensagem por linha; termine com | right para o balão da direita",
  },
  phone: {
    keys: ["label", "text"],
    hint: "Uma notificação por linha: título | texto",
  },
  iso_bars: { keys: ["label", "value"], hint: "Uma barra por linha: nome | valor" },
  card_stack: { keys: ["label", "text"], hint: "Um cartão por linha: título | texto" },
  orbit: { keys: ["icon", "label"], hint: "Um por linha: ícone em inglês | texto" },
  search: { keys: ["label", "text"], hint: "Um resultado por linha: título | texto" },
  marquee: { keys: ["label", "text"], hint: "Uma palavra por linha" },
  cube: { keys: ["label", "text"], hint: "Uma palavra por face (2 a 4)" },
  activity_rings: { keys: ["label", "value"], hint: "Um anel por linha: nome | porcentagem" },
  pie: { keys: ["label", "value"], hint: "Uma fatia por linha: nome | valor" },
  bubbles: { keys: ["label", "value"], hint: "Uma bolha por linha: nome | valor" },
  funnel: { keys: ["label", "value"], hint: "Uma etapa por linha: nome | valor" },
  venn: { keys: ["label", "text"], hint: "Um círculo por linha (2 ou 3)" },
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
          {(graphic.type === "particle_text" ||
            graphic.type === "liquid_text" ||
            graphic.type === "split_reveal") && (
            <>
              {text("text", "Palavra", "Motion", 24)}
              {text("sub", "Linha embaixo (opcional)")}
            </>
          )}
          {graphic.type === "globe" && (
            <>
              {text("label", "Título")}
              {text("sub", "Linha embaixo (opcional)")}
            </>
          )}
          {graphic.type === "route" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {text("from", "Saída", "São Paulo", 24)}
                {text("to", "Chegada", "Lisboa", 24)}
              </div>
              {text("value", "Distância (opcional)", "7.900 km", 20)}
            </>
          )}
          {graphic.type === "flip_clock" && (
            <>
              {text("value", "Número (só dígitos e :)", "2026", 8)}
              {text("label", "Legenda (opcional)")}
            </>
          )}
          {graphic.type === "phone" && text("label", "Título em cima (opcional)")}
          {graphic.type === "iso_bars" && text("unit", "Unidade (opcional)", "mil", 10)}
          {(graphic.type === "equalizer" ||
            graphic.type === "burst" ||
            graphic.type === "loader") && (
            <>
              {text("text", "Texto", "Pronto", 30)}
              {graphic.type !== "loader" &&
                text("icon", "Ícone (nome em inglês)", "rocket", 30)}
            </>
          )}
          {graphic.type === "orbit" && text("text", "Texto do centro", "Você", 12)}
          {[
            "glitch_text",
            "stretch_text",
            "wave_text",
            "echo_text",
            "scramble_text",
            "kaleidoscope",
            "tunnel",
            "dot_wave",
            "blob",
            "spiro",
            "helix",
          ].includes(graphic.type) && (
            <>
              {text("text", "Palavra", "Motion", 24)}
              {text("sub", "Linha embaixo (opcional)")}
            </>
          )}
          {graphic.type === "fireworks" && text("text", "Texto", "Parabéns!", 24)}
          {graphic.type === "highlight_text" && (
            <>
              {text("text", "Frase", "O segredo é o ritmo", 70)}
              {text("value", "Palavra destacada", "ritmo", 20)}
            </>
          )}
          {graphic.type === "quote" && (
            <>
              {text("text", "Citação", "", 120)}
              {text("label", "Autor")}
            </>
          )}
          {graphic.type === "countdown" && (
            <>
              {text("value", "Começa em (1 a 10)", "3", 2)}
              {text("text", "Texto no fim", "Já!", 24)}
            </>
          )}
          {graphic.type === "venn" && text("text", "Texto no meio (opcional)", "", 20)}
          {[
            "activity_rings",
            "pie",
            "bubbles",
            "funnel",
            "calendar_grid",
            "candles",
            "gauge",
            "battery",
            "thermometer",
            "rating",
            "cursor_click",
            "like_button",
            "price_tag",
          ].includes(graphic.type) && text("label", "Título (opcional)")}
          {["calendar_grid", "candles", "gauge", "battery", "thermometer", "rating", "like_button"].includes(
            graphic.type,
          ) && text("value", "Número", "87%", 20)}
          {graphic.type === "rating" && text("text", "Comentário (opcional)", "", 80)}
          {graphic.type === "cursor_click" && text("text", "Texto do botão", "Clique aqui", 24)}
          {graphic.type === "price_tag" && (
            <div className="grid grid-cols-2 gap-2">
              {text("from", "Preço antigo", "R$ 199", 16)}
              {text("to", "Preço novo", "R$ 99", 16)}
            </div>
          )}
          {graphic.type === "search" && text("text", "O que é pesquisado", "", 40)}
          {graphic.type === "code" && (
            <>
              <ListField
                key={`${index}-lines`}
                id={id("lines")}
                hint="Código, uma linha por linha (até 9)"
                initial={(graphic.lines ?? []).join("\n")}
                disabled={disabled}
                onChange={(t) =>
                  set({
                    lines: t
                      .split("\n")
                      .filter((l) => l.trim())
                      .map((l) => l.slice(0, 46))
                      .slice(0, 9),
                  })
                }
              />
              {text("output", "Resultado (opcional)", "pronto!", 40)}
            </>
          )}
          {graphic.type === "icon" && (
            <>
              {text("icon", "Ícone (nome em inglês)", "rocket", 30)}
              {text("label", "Texto embaixo")}
            </>
          )}
          <p className={small}>
            {FX_GRAPHICS.includes(graphic.type)
              ? "Cena de tela cheia: a animação ocupa a tela toda (deixe o texto da tela vazio)."
              : "O grafismo é desenhado ao vivo no meio da tela, no lugar da imagem."}{" "}
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

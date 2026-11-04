// Grafismos (motion graphics) por cena: contador, barras, ranking, gráfico, passos, versus...
// Espelho de worker/render/mograph.py (normalize_graphic é a fonte da verdade do formato; o worker
// descarta qualquer grafismo inválido e a cena fica como sem grafismo). Só vale nos estilos que
// rodam no motor genérico (estilo livre e templates); os embutidos ignoram.
// Arquivo puro (sem imports de servidor): o editor também usa.

export const GRAPHIC_TYPES = [
  "counter",
  "bars",
  "ranking",
  "rank_item",
  "line_chart",
  "donut",
  "steps",
  "checklist",
  "versus",
  "timeline",
  "icon",
  "icons",
] as const;
export type GraphicType = (typeof GRAPHIC_TYPES)[number];

export const GRAPHIC_LABELS: Record<GraphicType, string> = {
  counter: "Número contando",
  bars: "Barras",
  ranking: "Ranking (lista)",
  rank_item: "Item de ranking",
  line_chart: "Gráfico de linha",
  donut: "Porcentagem (rosca)",
  steps: "Passo a passo",
  checklist: "Checklist",
  versus: "Comparação (versus)",
  timeline: "Linha do tempo",
  icon: "Ícone desenhado",
  icons: "Ícones",
};

export interface GraphicItem {
  label?: string;
  value?: string;
  icon?: string;
  text?: string;
}

export interface SceneGraphic {
  type: GraphicType;
  value?: string;
  from?: string;
  label?: string;
  unit?: string;
  rank?: string;
  sub?: string;
  header?: string;
  icon?: string;
  items?: GraphicItem[];
  points?: number[];
  labels?: string[];
  left?: GraphicItem;
  right?: GraphicItem;
}

/** Item de ranking mostra a imagem da cena numa faixa larga; os outros grafismos não usam imagem. */
export function graphicNeedsImage(g: SceneGraphic | undefined | null): boolean {
  return g?.type === "rank_item";
}

function s(v: unknown, n: number): string {
  return typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim().slice(0, n) : "";
}

function item(v: unknown): GraphicItem {
  const o = (typeof v === "string" ? { label: v } : v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: GraphicItem = {};
  for (const k of ["label", "value", "icon", "text"] as const) {
    const x = s(o[k], 40);
    if (x) out[k] = x;
  }
  return out;
}

/** Limpa o grafismo vindo da IA ou do editor. undefined = cena sem grafismo. */
export function sanitizeGraphic(raw: unknown): SceneGraphic | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const type = o.type as GraphicType;
  if (!GRAPHIC_TYPES.includes(type)) return undefined;
  const g: SceneGraphic = { type };
  for (const k of ["value", "from", "label", "unit", "rank", "sub", "header", "icon"] as const) {
    const x = s(o[k], 60);
    if (x) g[k] = x;
  }
  if (Array.isArray(o.items)) {
    const items = o.items.map(item).filter((i) => i.label || i.icon || i.text).slice(0, 6);
    if (items.length) g.items = items;
  }
  if (Array.isArray(o.points)) {
    const pts = o.points
      .map((p) => (typeof p === "number" ? p : Number(String(p).replace(/[^\d.,-]/g, "").replace(",", "."))))
      .filter((p) => Number.isFinite(p))
      .slice(0, 12);
    if (pts.length) g.points = pts;
  }
  if (Array.isArray(o.labels)) g.labels = o.labels.map((l) => s(l, 10)).slice(0, 12);
  if (o.left) g.left = item(o.left);
  if (o.right) g.right = item(o.right);
  return g;
}

/** Quantos grafismos o estilo pede (spec.graphics.usage); padrão "some". */
export function graphicsUsage(spec: unknown): "none" | "some" | "many" {
  const g = ((spec ?? {}) as Record<string, unknown>).graphics as Record<string, unknown> | undefined;
  const u = g?.usage;
  return u === "none" || u === "many" ? u : "some";
}

/** Grupo "graphics" da ficha de estilo (espelho de GRAPHICS_CHOICES em mograph.py). */
export const GRAPHICS_SPEC_HELP = `"graphics": {"style": clean | hand (traço limpo ou rabiscado à mão, que treme de leve), "stroke": 3-26 (espessura do traço), "color": accent | text (cor dos traços), "glow": true/false (brilho no traço, bom em fundo escuro), "decor": none | grid | lines | dots | shapes | rings (fundo vivo atrás dos grafismos: grade, linhas diagonais, pontos, formas que se transformam, anéis), "pen": true/false (ponta de caneta desenhando), "usage": none | some | many (quantas cenas com grafismo)}`;

const USAGE_TEXT = {
  none: "",
  some: "Use grafismo em 1 a 3 cenas, só onde o conteúdo pede (número, lista, comparação, etapas).",
  many: "Este estilo é de motion graphics: use grafismo na maioria das cenas (pelo menos metade), variando os tipos.",
};

/**
 * Regra do roteiro para os estilos do motor genérico. O grafismo é desenhado AO VIVO na tela
 * (traço a traço, números contando, barras crescendo) no lugar da imagem da cena.
 */
export function graphicsPromptRule(usage: "none" | "some" | "many"): string {
  if (usage === "none") return "";
  return `
- Grafismos (motion graphics desenhados ao vivo na tela, no lugar da imagem da cena): coloque "graphic" nas cenas em que o conteúdo é um dado, lista, comparação ou etapa. ${USAGE_TEXT[usage]} Nas outras cenas, não coloque o campo. Tipos e formato:
  - {"type":"counter","value":"87%","from":"0","label":"..."}: número grande contando (value com o número; pode ter prefixo/sufixo: "R$ 1,2 mi", "3x", "45%")
  - {"type":"donut","value":"64%","label":"..."}: porcentagem que completa um círculo
  - {"type":"bars","items":[{"label":"Brasil","value":"120"},...],"unit":"mi"}: 2 a 6 barras crescendo (a maior em destaque)
  - {"type":"ranking","items":[{"label":"..."},...]}: lista numerada (1º em destaque); com "value" em cada item vira barras com posição
  - {"type":"rank_item","rank":"5","label":"nome","value":"25 anos","sub":"273 dias","header":"título do ranking"}: UMA posição de um ranking por cena, em sequência (5, 4, 3, 2, 1), com o mesmo "header" em todas: a posição e o valor rolam como odômetro de uma cena para a outra (valores com o mesmo sufixo) e a imagem da cena atravessa a tela numa faixa larga (o "imagePrompt" dessas cenas descreve o item, enquadramento horizontal, assunto de lado). Use para rankings e "top N" contados item a item.
  - {"type":"line_chart","points":[10,14,22,41],"labels":["2022","2023","2024","2025"],"label":"..."}: linha que se desenha
  - {"type":"steps","items":[{"label":"Pesquise","icon":"search"},...]}: 2 a 5 etapas numeradas ligadas por setas
  - {"type":"checklist","items":["...","..."]}: itens que vão sendo marcados
  - {"type":"versus","left":{"label":"SEO","value":"10 links","icon":"search"},"right":{"label":"GEO","value":"1 resposta","icon":"bot"}}: comparação lado a lado
  - {"type":"timeline","items":[{"label":"1985","text":"..."},...]}: 2 a 5 marcos no tempo
  - {"type":"icon","icon":"rocket","label":"..."} e {"type":"icons","items":[{"icon":"clock","label":"Rápido"},...]}: 1 a 3 ícones desenhados traço a traço
  Ícones: nome em inglês da biblioteca Lucide (search, rocket, heart, star, clock, shield, users, brain, banknote, trending-up, lightbulb, globe, smartphone, car, trophy, gamepad-2, camera, music, check, x, zap, target...). Textos dos grafismos curtos (até 3 palavras por rótulo). Números só se forem verdadeiros e sustentáveis (do tema, da notícia ou de conhecimento geral consolidado); sem número confiável, prefira steps, checklist, icons ou versus. Cena com grafismo: o "onScreen" vira um título curto em cima (até 4 palavras) ou fica vazio, e o "imagePrompt" fica vazio (exceto rank_item). Em rank_item, "onScreen" fica vazio (o "header" já é o título fixo). Não use layout text_only junto com grafismo.`;
}

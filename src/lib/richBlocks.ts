// Elementos visuais opcionais da matéria de Portal (tabela, gráfico, infográficos...).
// Ficam dentro do próprio JSON de cada seção (`section.blocks`), então não precisam de coluna
// nova no banco. Este arquivo é "puro" (sem imports de servidor) pra poder ser usado tanto na
// tela de geração (client) quanto na geração, na renderização e na publicação no WordPress.

export const RICH_BLOCK_OPTIONS = [
  { id: "table", label: "Tabela", description: "Dados comparativos em linhas e colunas" },
  { id: "chart", label: "Gráfico", description: "Barras, linha ou pizza com números das fontes" },
  { id: "stats", label: "Infográfico: números em destaque", description: "Cartões com os números-chave" },
  { id: "timeline", label: "Infográfico: linha do tempo", description: "Sequência de datas e acontecimentos" },
  { id: "quote", label: "Citação em destaque", description: "Trecho marcante de uma fala" },
  { id: "callout", label: 'Box "Você sabia?"', description: "Curiosidade ou contexto extra" },
] as const;

export type RichBlockType = (typeof RICH_BLOCK_OPTIONS)[number]["id"];

export type RichBlock =
  | { type: "table"; title?: string; headers: string[]; rows: string[][] }
  | {
      type: "chart";
      chartType: "bar" | "line" | "pie";
      title?: string;
      unit?: string;
      labels: string[];
      values: number[];
    }
  | { type: "stats"; title?: string; items: { value: string; label: string }[] }
  | { type: "timeline"; title?: string; items: { date: string; text: string }[] }
  | { type: "quote"; text: string; author?: string }
  | { type: "callout"; title: string; text: string };

export function parseRichBlockTypes(value: unknown): RichBlockType[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<string>(RICH_BLOCK_OPTIONS.map((o) => o.id));
  return [...new Set(value.filter((v): v is RichBlockType => typeof v === "string" && valid.has(v)))];
}

const BLOCK_PROMPTS: Record<RichBlockType, string> = {
  table: `- "table" — tabela de dados reais das fontes: { "type": "table", "title": "string", "headers": ["col1", "col2"], "rows": [["...", "..."]] } (2 a 6 colunas, 2 a 10 linhas, todas as linhas com o mesmo número de colunas)`,
  chart: `- "chart" — gráfico com números reais das fontes: { "type": "chart", "chartType": "bar" | "line" | "pie", "title": "string", "unit": "string opcional (ex.: %, R$, mil)", "labels": ["A", "B"], "values": [10, 20] } (2 a 10 pontos; "values" são números puros, sem texto; use "pie" só quando os valores forem partes de um todo; "line" para evolução no tempo)`,
  stats: `- "stats" — infográfico de números em destaque: { "type": "stats", "title": "string opcional", "items": [{ "value": "string curta (ex.: 2,5 mi, 87%)", "label": "o que o número significa" }] } (2 a 4 itens, números que aparecem nas fontes)`,
  timeline: `- "timeline" — infográfico de linha do tempo: { "type": "timeline", "title": "string opcional", "items": [{ "date": "string curta (ex.: 2019, março de 2024)", "text": "o que aconteceu" }] } (3 a 7 itens em ordem cronológica, só eventos que as fontes citam)`,
  quote: `- "quote" — citação em destaque, trecho literal e marcante de uma fala presente nas fontes: { "type": "quote", "text": "string", "author": "quem disse (opcional)" }`,
  callout: `- "callout" — box "Você sabia?" com uma curiosidade ou contexto extra vindo das fontes: { "type": "callout", "title": "string curto", "text": "1 a 3 frases" }`,
};

export function buildRichBlocksInstruction(types: RichBlockType[]): string {
  return [
    `Elementos visuais extras da matéria de portal — o usuário pediu os tipos abaixo. Cada seção pode ter o campo "blocks" (array) com elementos que aparecem depois do texto daquela seção:`,
    ...types.map((t) => BLOCK_PROMPTS[t]),
    `Regras dos elementos visuais:`,
    `- O usuário marcou cada tipo acima de propósito: CRIE um elemento de cada tipo pedido sempre que as fontes tiverem material minimamente suficiente (por exemplo: 2 ou mais números comparáveis para tabela ou gráfico; uma fala entre aspas para citação; 2 ou mais datas para linha do tempo). Só pule um tipo se as fontes realmente não tiverem nenhum material para ele.`,
    `- No máximo um elemento de cada tipo pedido, na seção onde ele fizer mais sentido (seções sem elemento levam "blocks": []). Não crie tipos que não foram pedidos acima.`,
    `- Use SOMENTE dados, números, datas e falas que estejam de fato nas fontes. Nunca invente, estime nem arredonde de forma que mude o sentido.`,
    `- Os elementos complementam o texto, não o substituem: o texto da seção continua completo e autoexplicativo.`,
    `- Todo texto dos elementos em português do Brasil.`,
  ].join("\n");
}

function str(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strList(value: unknown, maxItems: number, max = 300): string[] {
  return Array.isArray(value) ? value.slice(0, maxItems).map((v) => str(typeof v === "number" ? String(v) : v, max)) : [];
}

// A IA pode errar o formato ou incluir tipos que não foram pedidos: aqui só passa o que está
// bem formado e foi pedido; o resto é descartado em vez de quebrar a geração inteira.
export function sanitizeBlocks(raw: unknown, allowed: RichBlockType[]): RichBlock[] {
  if (!Array.isArray(raw) || allowed.length === 0) return [];
  const used = new Set<string>();
  const out: RichBlock[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const type = b.type as RichBlockType;
    if (!allowed.includes(type) || used.has(type)) continue;

    if (type === "table") {
      const headers = strList(b.headers, 6, 60);
      const rows = (Array.isArray(b.rows) ? b.rows.slice(0, 10) : [])
        .filter(Array.isArray)
        .map((r) => {
          const cells = strList(r, headers.length, 120);
          while (cells.length < headers.length) cells.push("");
          return cells;
        });
      if (headers.length >= 2 && headers.every(Boolean) && rows.length >= 1) {
        out.push({ type, title: str(b.title, 120) || undefined, headers, rows });
        used.add(type);
      }
    } else if (type === "chart") {
      const labels = strList(b.labels, 10, 40);
      const values = (Array.isArray(b.values) ? b.values.slice(0, 10) : []).map((v) =>
        typeof v === "string" ? Number(v.replace(",", ".")) : v
      );
      const n = Math.min(labels.length, values.length);
      const nums = values.slice(0, n) as number[];
      const chartType = b.chartType === "line" || b.chartType === "pie" ? b.chartType : "bar";
      if (n >= 2 && nums.every((v) => typeof v === "number" && Number.isFinite(v)) && (chartType !== "pie" || nums.every((v) => v >= 0))) {
        out.push({
          type,
          chartType,
          title: str(b.title, 120) || undefined,
          unit: str(b.unit, 12) || undefined,
          labels: labels.slice(0, n),
          values: nums,
        });
        used.add(type);
      }
    } else if (type === "stats") {
      const items = (Array.isArray(b.items) ? b.items.slice(0, 4) : [])
        .map((i) => ({ value: str((i as Record<string, unknown>)?.value, 24), label: str((i as Record<string, unknown>)?.label, 100) }))
        .filter((i) => i.value && i.label);
      if (items.length >= 2) {
        out.push({ type, title: str(b.title, 120) || undefined, items });
        used.add(type);
      }
    } else if (type === "timeline") {
      const items = (Array.isArray(b.items) ? b.items.slice(0, 7) : [])
        .map((i) => ({ date: str((i as Record<string, unknown>)?.date, 40), text: str((i as Record<string, unknown>)?.text, 200) }))
        .filter((i) => i.date && i.text);
      if (items.length >= 2) {
        out.push({ type, title: str(b.title, 120) || undefined, items });
        used.add(type);
      }
    } else if (type === "quote") {
      const text = str(b.text, 400);
      if (text) {
        out.push({ type, text, author: str(b.author, 80) || undefined });
        used.add(type);
      }
    } else if (type === "callout") {
      const title = str(b.title, 80);
      const text = str(b.text, 500);
      if (title && text) {
        out.push({ type, title, text });
        used.add(type);
      }
    }
  }

  return out;
}

export const CHART_COLORS = ["#f10000", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#6b7280"];

export function formatChartValue(value: number, unit?: string): string {
  const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
  if (!unit) return n;
  return unit === "%" ? `${n}%` : /^R\$/.test(unit) ? `${unit} ${n}` : `${n} ${unit}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const WP_BOX = "margin:1.5em 0;padding:1em 1.25em;border:1px solid #e5e1d8;border-radius:12px;background:#fbf9f5;";
const WP_TITLE = "margin:0 0 .75em;font-weight:700;color:#f10000;";

// HTML autocontido (estilos inline, sem JS/CSS externo) pro post do WordPress. Gráficos viram
// barras horizontais (funcionam em qualquer tema); pizza mostra o percentual de cada parte.
export function blocksToHtml(blocks: RichBlock[]): string {
  return blocks
    .map((block) => {
      const title = "title" in block && block.title ? `<p style="${WP_TITLE}">${escapeHtml(block.title)}</p>` : "";

      if (block.type === "table") {
        const head = block.headers
          .map((h) => `<th style="text-align:left;padding:8px;border-bottom:2px solid #f10000;">${escapeHtml(h)}</th>`)
          .join("");
        const rows = block.rows
          .map(
            (r) =>
              `<tr>${r.map((c) => `<td style="padding:8px;border-bottom:1px solid #e5e1d8;">${escapeHtml(c)}</td>`).join("")}</tr>`
          )
          .join("");
        return `<div style="${WP_BOX}">${title}<table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }

      if (block.type === "chart") {
        const total = block.values.reduce((s, v) => s + v, 0);
        const max = Math.max(...block.values.map((v) => Math.abs(v)), 1);
        const bars = block.labels
          .map((label, i) => {
            const v = block.values[i];
            const pct = block.chartType === "pie" && total > 0 ? (v / total) * 100 : (Math.abs(v) / max) * 100;
            const pctText = `${pct.toFixed(1).replace(".", ",")}%`;
            const text = block.chartType === "pie" && total > 0 ? (block.unit === "%" ? pctText : `${pctText} (${formatChartValue(v, block.unit)})`) : formatChartValue(v, block.unit);
            return `<div style="margin:6px 0;"><div style="font-size:.9em;margin-bottom:2px;">${escapeHtml(label)} — <strong>${escapeHtml(text)}</strong></div><div style="background:#e5e1d8;border-radius:6px;"><div style="width:${Math.max(pct, 1).toFixed(1)}%;height:14px;border-radius:6px;background:${CHART_COLORS[i % CHART_COLORS.length]};"></div></div></div>`;
          })
          .join("");
        return `<div style="${WP_BOX}">${title}${bars}</div>`;
      }

      if (block.type === "stats") {
        const cards = block.items
          .map(
            (i) =>
              `<div style="flex:1 1 140px;text-align:center;padding:12px;background:#fff;border-radius:10px;border:1px solid #e5e1d8;"><div style="font-size:1.8em;font-weight:800;color:#f10000;line-height:1.1;">${escapeHtml(i.value)}</div><div style="font-size:.9em;margin-top:4px;">${escapeHtml(i.label)}</div></div>`
          )
          .join("");
        return `<div style="${WP_BOX}">${title}<div style="display:flex;flex-wrap:wrap;gap:12px;">${cards}</div></div>`;
      }

      if (block.type === "timeline") {
        const items = block.items
          .map(
            (i) =>
              `<li style="margin:0 0 12px;"><strong style="color:#f10000;">${escapeHtml(i.date)}</strong><br>${escapeHtml(i.text)}</li>`
          )
          .join("");
        return `<div style="${WP_BOX}">${title}<ul style="list-style:none;margin:0;padding:0 0 0 14px;border-left:3px solid #f10000;">${items}</ul></div>`;
      }

      if (block.type === "quote") {
        const author = block.author ? `<cite style="display:block;margin-top:.5em;font-size:.9em;">— ${escapeHtml(block.author)}</cite>` : "";
        return `<blockquote style="margin:1.5em 0;padding:.5em 1.25em;border-left:4px solid #f10000;font-size:1.15em;font-style:italic;">${escapeHtml(block.text)}${author}</blockquote>`;
      }

      return `<div style="${WP_BOX}"><p style="${WP_TITLE}">${escapeHtml(block.title)}</p><p style="margin:0;">${escapeHtml(block.text)}</p></div>`;
    })
    .join("\n");
}

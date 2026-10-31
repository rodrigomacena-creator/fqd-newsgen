// Gera src/lib/videogen/patterns.json (resumo, usado no client) e
// src/lib/videogen/patternGuides.json (markdown completo, usado só no servidor
// pra montar o prompt do roteiro) a partir de videogen/padroes/*.md.
// Rode de novo sempre que adicionar ou editar um padrão: node scripts/videogen-patterns.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "videogen/padroes";
const OUT = "src/lib/videogen";

// Tabela principal do README: | # | Nome | Id | Tom | Ritmo | Arquivo |
const readme = readFileSync(join(DIR, "README.md"), "utf8");
const table = {};
for (const line of readme.split("\n")) {
  const cells = line.split("|").map((c) => c.trim());
  if (cells.length < 7 || !/^\d+$/.test(cells[1])) continue;
  const id = cells[3].replace(/`/g, "");
  table[id] = { tom: cells[4], ritmo: cells[5] };
}

function field(front, key) {
  const m = front.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^"(.*)"$/, "$1") : "";
}

function numbers(text) {
  return (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

const summary = [];
const guides = {};
for (const file of readdirSync(DIR).filter((f) => /^\d+-.+\.md$/.test(f)).sort()) {
  const raw = readFileSync(join(DIR, file), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Sem front matter: ${file}`);
  const [, front, body] = m;
  const id = field(front, "id");
  const formato = field(front, "formato");
  const dur = numbers((formato.match(/duracao_s:\s*(\[[^\]]*\]|[\d.]+)/) || [])[1] || "");
  const cena = numbers(field(front, "cena_s"));
  const legenda = field(front, "legenda");
  const tom = table[id]?.tom ?? "";
  summary.push({
    id,
    numero: Number(field(front, "numero")),
    nome: field(front, "nome"),
    tom,
    ritmo: table[id]?.ritmo ?? "",
    duracaoReferenciaS: dur,
    cenaS: cena.length ? [cena[0], cena[cena.length - 1]] : [1.5, 3],
    // Padrões cuja referência não tem narração (o texto é só gráfico na tela).
    semNarracao: /sem narração/i.test(tom) || /^sem legenda falada/i.test(legenda),
    cta: field(front, "cta"),
  });
  guides[id] = `${front}\n\n${body.trim()}`;
}

writeFileSync(join(OUT, "patterns.json"), JSON.stringify(summary, null, 2) + "\n");
writeFileSync(join(OUT, "patternGuides.json"), JSON.stringify(guides, null, 2) + "\n");
console.log(`${summary.length} padrões gerados.`);

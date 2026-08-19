export interface TextModelOption {
  id: string;
  name: string;
  contextLength: number | null;
  promptPricePerMTok: number;
  completionPricePerMTok: number;
}

export interface ImageModelOption {
  id: string;
  name: string;
  description: string;
}

interface OpenRouterModelEntry {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
}

const CACHE_TTL_MS = 60 * 60 * 1000;

let textModelsCache: { data: TextModelOption[]; fetchedAt: number } | null = null;
let imageModelsCache: { data: ImageModelOption[]; fetchedAt: number } | null = null;

async function fetchJson(url: string): Promise<{ data: OpenRouterModelEntry[] }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao buscar modelos da OpenRouter (${res.status}).`);
  }
  return res.json();
}

function sortKey(pricePerMTok: number): number {
  // Router/variable-priced models report a negative sentinel (e.g. -1) instead
  // of a real price — push them to the end instead of sorting as "cheapest".
  return pricePerMTok < 0 ? Infinity : pricePerMTok;
}

export async function fetchTextModels(): Promise<TextModelOption[]> {
  if (textModelsCache && Date.now() - textModelsCache.fetchedAt < CACHE_TTL_MS) {
    return textModelsCache.data;
  }

  const { data } = await fetchJson("https://openrouter.ai/api/v1/models");

  const models = data
    .filter(
      (m) =>
        m.architecture?.output_modalities?.includes("text") &&
        m.architecture?.input_modalities?.includes("text") &&
        m.pricing?.prompt !== undefined
    )
    .map((m) => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length ?? null,
      promptPricePerMTok: Number(m.pricing!.prompt) * 1_000_000,
      completionPricePerMTok: Number(m.pricing!.completion) * 1_000_000,
    }))
    .sort((a, b) => sortKey(a.promptPricePerMTok) - sortKey(b.promptPricePerMTok));

  textModelsCache = { data: models, fetchedAt: Date.now() };
  return models;
}

export async function fetchImageModels(): Promise<ImageModelOption[]> {
  if (imageModelsCache && Date.now() - imageModelsCache.fetchedAt < CACHE_TTL_MS) {
    return imageModelsCache.data;
  }

  const { data } = await fetchJson("https://openrouter.ai/api/v1/images/models");

  const models = data
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  imageModelsCache = { data: models, fetchedAt: Date.now() };
  return models;
}

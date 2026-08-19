import sharp from "sharp";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

export interface StyleguideExtraction {
  colors: string[];
  summary: string | null;
}

const HEX_COLOR_REGEX = /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g;
const MAX_COLORS = 6;
const MAX_SUMMARY_CHARS = 800;
const COLOR_BUCKET_STEP = 32;

function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return hex.toUpperCase();
}

function extractHexFromText(text: string): string[] {
  const matches = text.match(HEX_COLOR_REGEX) ?? [];
  return Array.from(new Set(matches.map(normalizeHex)));
}

function cleanSummary(text: string): string | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, MAX_SUMMARY_CHARS) : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/**
 * Amostra os pixels de uma imagem e agrupa por faixas de cor pra achar as
 * predominantes, ignorando tons quase-brancos/pretos/cinzas (fundo comum de
 * styleguide) pra priorizar cores de marca de verdade.
 */
async function dominantColorsFromImageBuffer(
  buffer: Buffer,
  limit = MAX_COLORS
): Promise<string[]> {
  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = info.channels === 4 ? data[i + 3] : 255;
    if (alpha < 32) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isNearWhite = min > 235;
    const isNearBlack = max < 20;
    const isGray = max - min < 12;
    if (isNearWhite || isNearBlack || isGray) continue;

    const key = [
      Math.min(255, Math.round(r / COLOR_BUCKET_STEP) * COLOR_BUCKET_STEP),
      Math.min(255, Math.round(g / COLOR_BUCKET_STEP) * COLOR_BUCKET_STEP),
      Math.min(255, Math.round(b / COLOR_BUCKET_STEP) * COLOR_BUCKET_STEP),
    ].join(",");

    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { count: 1, r, g, b });
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((b) => rgbToHex(b.r, b.g, b.b));
}

export async function extractStyleguideInfo(
  buffer: Buffer,
  ext: "pdf" | "png" | "jpg" | "svg"
): Promise<StyleguideExtraction> {
  if (ext === "svg") {
    const svgText = buffer.toString("utf8");
    const colors = extractHexFromText(svgText).slice(0, MAX_COLORS);
    const titleMatch = svgText.match(/<title>([^<]+)<\/title>/i);
    const descMatch = svgText.match(/<desc>([^<]+)<\/desc>/i);
    const summaryParts = [titleMatch?.[1], descMatch?.[1]].filter((v): v is string => Boolean(v));
    return {
      colors,
      summary: summaryParts.length ? cleanSummary(summaryParts.join(". ")) : null,
    };
  }

  if (ext === "png" || ext === "jpg") {
    const colors = await dominantColorsFromImageBuffer(buffer);
    return { colors, summary: null };
  }

  // pdf
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText({ first: 5 });
    const textColors = extractHexFromText(textResult.text);
    const summary = cleanSummary(textResult.text);

    let visualColors: string[] = [];
    try {
      const shot = await parser.getScreenshot({
        first: 1,
        desiredWidth: 400,
        imageBuffer: true,
        imageDataUrl: false,
      });
      const page = shot.pages[0];
      if (page) {
        visualColors = await dominantColorsFromImageBuffer(Buffer.from(page.data));
      }
    } catch {
      // renderização da página falhou — segue só com as cores extraídas do texto
    }

    const colors = Array.from(new Set([...textColors, ...visualColors])).slice(0, MAX_COLORS);
    return { colors, summary };
  } finally {
    await parser.destroy();
  }
}

export function buildStyleguidePromptContext(
  profile:
    | { styleguideColors?: string | null; styleguideSummary?: string | null }
    | null
    | undefined
): string | null {
  if (!profile) return null;

  let colors: string[] = [];
  if (profile.styleguideColors) {
    try {
      colors = JSON.parse(profile.styleguideColors);
    } catch {
      colors = [];
    }
  }
  const summary = profile.styleguideSummary?.trim();

  if (colors.length === 0 && !summary) return null;

  const parts: string[] = [];
  if (colors.length > 0) {
    parts.push(`Paleta de cores da marca (extraída do styleguide do perfil): ${colors.join(", ")}.`);
  }
  if (summary) {
    parts.push(`Contexto adicional extraído do styleguide: "${summary}"`);
  }
  parts.push(
    'Ao escrever os prompts de imagem (capa, seções e Instagram), incorpore essas cores de forma sutil e natural quando fizer sentido para a cena (iluminação, objetos, roupas, elementos de fundo) — não force cores que fiquem artificiais ou destoem do conteúdo real da fotografia.'
  );

  return parts.join("\n");
}

import { getOpenRouterClient, OPENROUTER_TEXT_MODEL, extractCompletionText } from "./openrouter";
import {
  DEFAULT_ARTICLE_PROMPT,
  MULTI_SOURCE_INSTRUCTION,
  buildDestinationsInstruction,
  buildStructureInstruction,
} from "./prompts";

export interface ArticleStructure {
  wantPortal: boolean;
  wantInstagram: boolean;
  subtitleCount: number;
  paragraphCount: number;
  photoCount: number;
  instagramPhotoCount: number;
  extraInstructions?: string;
}

export interface ArticleSectionDraft {
  heading: string;
  text: string;
  imagePrompt: string;
}

export interface InstagramPostDraft {
  caption: string;
  imagePrompts: string[];
}

export interface ArticleDraft {
  title: string;
  subtitle: string;
  coverImagePrompt: string;
  sections: ArticleSectionDraft[];
  instagram: InstagramPostDraft;
}

const JSON_FORMAT_INSTRUCTIONS = `Formato de resposta:
- "instagram.caption": legenda envolvente em português do Brasil, linguagem direta e atraente para redes sociais (pode usar emojis com moderação), resumindo o essencial da notícia, terminando com 3 a 5 hashtags relevantes ao tema.
- "instagram.imagePrompts": array de prompts em inglês, cada um para uma imagem quadrada em estilo fotografia realista (igual às imagens da matéria) — NÃO é uma peça de design gráfico, banner ou capa de rede social, é uma foto.

IMPORTANTE sobre todos os prompts de imagem (capa, seções e Instagram): nunca peça texto, palavras, títulos, legendas, logos, marcas d'água ou letras escritas dentro da imagem, e nunca descreva a imagem como "banner", "graphic", "poster", "thumbnail" ou "cover" — isso induz o gerador de imagem a desenhar texto sozinho, mesmo sem pedir. Descreva sempre como uma fotografia realista de uma cena, sem nenhum elemento gráfico ou de texto. O texto da notícia já aparece separadamente na página.

Responda APENAS com um JSON válido, sem markdown, sem comentários, seguindo exatamente este formato:

{
  "title": "string",
  "subtitle": "string",
  "coverImagePrompt": "string",
  "sections": [
    { "heading": "string", "text": "string", "imagePrompt": "string" }
  ],
  "instagram": { "caption": "string", "imagePrompts": ["string"] }
}`;

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }

  return raw.trim();
}

export async function generateArticleDraft(
  sourcesText: string,
  structure: ArticleStructure,
  model: string = OPENROUTER_TEXT_MODEL,
  instructionPrompt: string = DEFAULT_ARTICLE_PROMPT,
  styleguideContext: string | null = null
): Promise<ArticleDraft> {
  const client = getOpenRouterClient();

  const systemPrompt = [
    instructionPrompt,
    MULTI_SOURCE_INSTRUCTION,
    buildDestinationsInstruction(structure),
    structure.wantPortal ? buildStructureInstruction(structure) : null,
    styleguideContext,
    JSON_FORMAT_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.6,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Conteúdo das fontes:\n\n${sourcesText}`,
      },
    ],
  });

  const raw = extractCompletionText(completion);

  let parsed: ArticleDraft;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    console.error("Resposta da IA não é JSON válido:", raw);
    throw new Error(
      "Não foi possível interpretar a resposta da IA como JSON válido."
    );
  }

  if (!Array.isArray(parsed.sections)) parsed.sections = [];
  if (!parsed.instagram) parsed.instagram = { caption: "", imagePrompts: [] };
  if (!Array.isArray(parsed.instagram.imagePrompts)) parsed.instagram.imagePrompts = [];

  if (
    !parsed.title ||
    !parsed.subtitle ||
    (structure.wantPortal && parsed.sections.length === 0) ||
    (structure.wantInstagram && (!parsed.instagram.caption || parsed.instagram.imagePrompts.length === 0))
  ) {
    console.error("Resposta da IA incompleta:", raw);
    throw new Error("A resposta da IA está incompleta.");
  }

  return parsed;
}

import { getOpenRouterClient, OPENROUTER_TEXT_MODEL, extractCompletionText } from "./openrouter";
import {
  DEFAULT_ARTICLE_PROMPT,
  MULTI_SOURCE_INSTRUCTION,
  PROMPT_SOURCE_INSTRUCTION,
  buildDestinationsInstruction,
  buildStructureInstruction,
} from "./prompts";
import {
  buildRichBlocksInstruction,
  groundBlocksInText,
  sanitizeBlocks,
  type RichBlock,
  type RichBlockType,
} from "./richBlocks";

export interface ArticleStructure {
  wantPortal: boolean;
  wantInstagram: boolean;
  subtitleCount: number;
  paragraphCount: number;
  photoCount: number;
  instagramPhotoCount: number;
  richBlocks: RichBlockType[];
  extraInstructions?: string;
  hasPromptSource?: boolean;
  // Só prompt, sem links: elementos ricos precisam estar literalmente no texto do prompt.
  promptOnly?: boolean;
}

export interface ArticleSectionDraft {
  heading: string;
  text: string;
  imagePrompt: string;
  blocks?: RichBlock[];
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
- "instagram.imagePrompts": array de prompts em inglês, um por imagem do carrossel/post — ver regras específicas abaixo.

IMPORTANTE sobre "coverImagePrompt" e o "imagePrompt" de cada seção (Portal): nunca peça texto, palavras, títulos, legendas, logos, marcas d'água ou letras escritas dentro da imagem, e nunca descreva a imagem como "banner", "graphic", "poster", "thumbnail" ou "cover" — isso induz o gerador de imagem a desenhar texto sozinho, mesmo sem pedir, e ele erra a ortografia. Descreva sempre como uma fotografia jornalística realista de uma cena, sem nenhum elemento gráfico ou de texto. O texto da notícia já aparece separadamente na página.

IMPORTANTE sobre "instagram.imagePrompts" (regra OPOSTA à de cima — aqui o texto é desejado): cada prompt deve descrever um card gráfico de notícia com texto embutido de verdade, no estilo "breaking news"/manchete de Instagram — não uma foto pura. Sempre inclua no prompt, entre aspas, o texto exato (curto: 3 a 8 palavras, em português do Brasil) que deve aparecer em destaque, tipografia bold/condensada, alto contraste contra o fundo (ex.: texto branco ou amarelo sobre uma foto escurecida/com overlay, ou um bloco de cor sólida atrás do texto), preenchendo boa parte do quadrado. Descreva também a cena/foto de fundo relacionada ao assunto. Quanto mais curto o texto pedido, melhor o modelo de imagem consegue renderizar sem erro de ortografia — nunca peça parágrafos ou frases longas na imagem, só uma manchete curta. Se houver mais de uma imagem (carrossel), cada uma pode trazer um trecho/ângulo de texto diferente, mas todas mantendo o mesmo estilo visual de card de notícia.

Responda APENAS com um JSON válido, sem markdown, sem comentários, seguindo exatamente este formato:

{
  "title": "string",
  "subtitle": "string",
  "coverImagePrompt": "string",
  "sections": [
    { "heading": "string", "text": "string", "imagePrompt": "string", "blocks": [] }
  ],
  "instagram": { "caption": "string", "imagePrompts": ["string"] }
}

"blocks" de cada seção só leva elementos quando houver instrução de elementos visuais acima; caso contrário, sempre [].`;

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
    structure.hasPromptSource ? PROMPT_SOURCE_INSTRUCTION : null,
    buildDestinationsInstruction(structure),
    structure.wantPortal ? buildStructureInstruction(structure) : null,
    structure.wantPortal && structure.richBlocks.length > 0
      ? buildRichBlocksInstruction(structure.richBlocks)
      : null,
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
  const richBlocks = structure.wantPortal ? structure.richBlocks : [];
  parsed.sections = parsed.sections.map((section) => ({
    ...section,
    blocks: structure.promptOnly
      ? groundBlocksInText(sanitizeBlocks(section.blocks, richBlocks), sourcesText)
      : sanitizeBlocks(section.blocks, richBlocks),
  }));
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

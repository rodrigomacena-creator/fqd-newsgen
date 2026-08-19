import { getOpenRouterClient, OPENROUTER_TEXT_MODEL, extractCompletionText } from "./openrouter";
import { DEFAULT_ARTICLE_PROMPT } from "./prompts";

export interface ArticleSectionDraft {
  heading: string;
  text: string;
  imagePrompt: string;
}

export interface InstagramPostDraft {
  caption: string;
  imagePrompt: string;
}

export interface ArticleDraft {
  title: string;
  subtitle: string;
  coverImagePrompt: string;
  sections: ArticleSectionDraft[];
  instagram: InstagramPostDraft;
}

const JSON_FORMAT_INSTRUCTIONS = `Além da matéria, escreva também um post para o Instagram resumindo a notícia:
- "instagram.caption": legenda envolvente em português do Brasil, linguagem direta e atraente para redes sociais (pode usar emojis com moderação), resumindo o essencial da notícia, terminando com 3 a 5 hashtags relevantes ao tema.
- "instagram.imagePrompt": prompt em inglês para uma imagem quadrada que resuma visualmente a notícia, em estilo fotografia realista (igual às imagens da matéria) — NÃO é uma peça de design gráfico, banner ou capa de rede social, é uma foto.

IMPORTANTE sobre todos os prompts de imagem (capa, seções e Instagram): nunca peça texto, palavras, títulos, legendas, logos, marcas d'água ou letras escritas dentro da imagem, e nunca descreva a imagem como "banner", "graphic", "poster", "thumbnail" ou "cover" — isso induz o gerador de imagem a desenhar texto sozinho, mesmo sem pedir. Descreva sempre como uma fotografia realista de uma cena, sem nenhum elemento gráfico ou de texto. O texto da notícia já aparece separadamente na página.

Responda APENAS com um JSON válido, sem markdown, sem comentários, seguindo exatamente este formato:

{
  "title": "string",
  "subtitle": "string",
  "coverImagePrompt": "string",
  "sections": [
    { "heading": "string", "text": "string", "imagePrompt": "string" }
  ],
  "instagram": { "caption": "string", "imagePrompt": "string" }
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
  model: string = OPENROUTER_TEXT_MODEL,
  instructionPrompt: string = DEFAULT_ARTICLE_PROMPT,
  styleguideContext: string | null = null
): Promise<ArticleDraft> {
  const client = getOpenRouterClient();

  const systemPrompt = [instructionPrompt, styleguideContext, JSON_FORMAT_INSTRUCTIONS]
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

  if (
    !parsed.title ||
    !parsed.subtitle ||
    !Array.isArray(parsed.sections) ||
    parsed.sections.length === 0 ||
    !parsed.instagram?.caption ||
    !parsed.instagram?.imagePrompt
  ) {
    console.error("Resposta da IA incompleta:", raw);
    throw new Error("A resposta da IA está incompleta.");
  }

  return parsed;
}

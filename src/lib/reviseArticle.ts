import { getOpenRouterClient, OPENROUTER_TEXT_MODEL, extractCompletionText } from "./openrouter";

export interface CurrentArticleSection {
  heading: string;
  text: string;
}

export interface ImageChange {
  target: "cover" | "instagram" | number;
  imagePrompt: string;
}

export interface RevisionResult {
  title: string;
  subtitle: string;
  sections: CurrentArticleSection[];
  instagramCaption: string;
  imageChanges: ImageChange[];
}

const SYSTEM_PROMPT = `Você é um editor de um portal de notícias. Você recebe o estado atual de uma matéria (título, subtítulo, seções e a legenda do post de Instagram associado) e um pedido do jornalista para ajustar algo. Aplique exatamente o que foi pedido e mantenha tudo o mais igual possível.

Regras:
- Mantenha o mesmo número de seções que foi enviado, na mesma ordem. Não adicione nem remova seções.
- Se o pedido for sobre texto (título, subtítulo, corpo de uma seção, ou a legenda do Instagram), edite apenas o que foi pedido e mantenha o restante idêntico ao original.
- Se o pedido for para trocar/gerar uma imagem (capa, de uma seção específica, ou a imagem do post de Instagram), inclua uma entrada em "imageChanges" com um prompt de imagem em inglês descrevendo a nova imagem pedida, sempre em estilo fotografia realista (nunca banner, graphic, poster, thumbnail ou cover). Use "target": "instagram" para a imagem do Instagram. Só inclua em "imageChanges" as imagens que devem ser trocadas.
- IMPORTANTE: a chave "imageChanges" deve SEMPRE aparecer no JSON, mesmo que vazia ([]) quando nenhuma imagem precisa mudar.
- IMPORTANTE sobre prompts de imagem: nunca peça texto, palavras, títulos, logos, marcas d'água ou letras escritas dentro da imagem, e nunca descreva a imagem como "banner", "graphic", "poster", "thumbnail" ou "cover" — isso induz o gerador de imagem a desenhar texto sozinho, mesmo sem pedir, e geradores de imagem erram a ortografia de texto renderizado. Se o pedido for para corrigir um erro de ortografia ou texto que apareceu numa imagem gerada anteriormente, gere um novo prompt puramente fotográfico para essa imagem, sem nenhum elemento gráfico ou de texto, já que o texto correto já está na legenda/matéria.
- Se o pedido não for claro sobre qual seção/imagem, use o contexto (título, texto de cada seção, legenda do Instagram) para decidir a mais provável.
- Sempre retorne "instagramCaption" com a legenda atual (editada ou não).
- Responda APENAS com um JSON válido, sem markdown, sem comentários, neste formato exato:

{
  "title": "string",
  "subtitle": "string",
  "sections": [ { "heading": "string", "text": "string" } ],
  "instagramCaption": "string",
  "imageChanges": [ { "target": "cover" | "instagram" | 0, "imagePrompt": "string" } ]
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

export async function reviseArticle(
  current: {
    title: string;
    subtitle: string;
    sections: CurrentArticleSection[];
    instagramCaption: string;
  },
  instruction: string,
  model: string = OPENROUTER_TEXT_MODEL,
  styleguideContext: string | null = null
): Promise<RevisionResult> {
  const client = getOpenRouterClient();

  const systemPrompt = styleguideContext
    ? `${SYSTEM_PROMPT}\n\n${styleguideContext}`
    : SYSTEM_PROMPT;

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Matéria atual (JSON):\n${JSON.stringify(
          {
            title: current.title,
            subtitle: current.subtitle,
            sections: current.sections,
            instagramCaption: current.instagramCaption,
          },
          null,
          2
        )}\n\nPedido do jornalista:\n${instruction}`,
      },
    ],
  });

  const raw = extractCompletionText(completion);

  let parsed: RevisionResult;
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
    parsed.sections.length !== current.sections.length ||
    !parsed.instagramCaption
  ) {
    console.error("Resposta da IA incompleta:", raw);
    throw new Error(
      "A resposta da IA está incompleta ou alterou o número de seções."
    );
  }

  // O modelo às vezes omite "imageChanges" quando não há troca de imagem —
  // trata como lista vazia em vez de falhar o ajuste inteiro por isso.
  if (!Array.isArray(parsed.imageChanges)) {
    parsed.imageChanges = [];
  }

  return parsed;
}

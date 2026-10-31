import { getOpenRouterClient, extractCompletionText } from "@/lib/openrouter";
import patternGuides from "./patternGuides.json";
import type { VideoPattern } from "./patterns";
import { WORDS_PER_SECOND, type VideoScript, type VideoScene, type Pronunciation } from "./types";
import { DEFAULT_PRONUNCIATIONS } from "./pronunciation";

// Claude via OpenRouter (Rodrigo quer um provedor só pra LLM).
export const VIDEOGEN_TEXT_MODEL = process.env.VIDEOGEN_TEXT_MODEL || "anthropic/claude-sonnet-5.5";

const SITE = "oxyngroup.com.br";

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function buildSystemPrompt(pattern: VideoPattern, durationS: number): string {
  const guide = (patternGuides as Record<string, string>)[pattern.id] ?? "";
  const words = Math.round(durationS * WORDS_PER_SECOND);
  const avgScene = (pattern.cenaS[0] + pattern.cenaS[1]) / 2;
  const sceneCount = Math.max(1, Math.round(durationS / avgScene));
  const dictionary = DEFAULT_PRONUNCIATIONS.map((p) => `"${p.display}" → "${p.spoken}"`).join(", ");

  return `Você é roteirista e diretor de arte de vídeos curtos verticais (Reels/Shorts, 9:16) para o perfil profissional do Rodrigo (marca Oxyn Group, site ${SITE}), que fala de marketing digital, IA, SEO/GEO e negócios.

Você vai escrever o roteiro de UM vídeo no padrão visual "${pattern.nome}" (id ${pattern.id}). Siga à risca o guia do padrão abaixo: ritmo, tipo de texto na tela, estilo das imagens e CTA.

=== GUIA DO PADRÃO ===
${guide}
=== FIM DO GUIA ===

Regras do roteiro:
- Duração alvo: ${durationS}s. ${
    pattern.semNarracao
      ? `Este padrão NÃO tem narração: deixe "narration" vazio em todas as cenas e no CTA, e conte a história só com "onScreen" e com "durationS" de cada cena (a soma deve dar ~${durationS}s).`
      : `A narração inteira (cenas + CTA) deve ter cerca de ${words} palavras (≈${WORDS_PER_SECOND} palavras/s). Português do Brasil, falado, frases curtas, sem jargão desnecessário.`
  }
- Cerca de ${sceneCount} cenas (ritmo do padrão: ${pattern.ritmo || `${pattern.cenaS[0]}–${pattern.cenaS[1]}s por cena`}). A primeira cena é o gancho: em 1–2s precisa prender quem está rolando o feed.
- "narration" de cada cena é o trecho falado naquela cena, com a grafia normal (é também a legenda). Não repita o texto entre cenas.
- "onScreen" é o texto grande na tela quando o padrão usa (palavra-chave, número, título curto); pode ser vazio.
- "imagePrompt" é em INGLÊS, para um modelo de imagem (Gemini/nano banana), formato vertical 9:16. Descreva só a imagem estática da cena no estilo do padrão (fundo, materiais, luz, composição, paleta). NUNCA peça texto, letras, logotipos ou números dentro da imagem: o texto é colocado depois pelo render. Mantenha o mesmo estilo visual em todas as cenas para o vídeo parecer uma peça só.
- "visual" é uma descrição curta em português do que aparece, para revisão humana.
- CTA: siga o formato de CTA do padrão. Quando o padrão pede site, use ${SITE}. Quando pede "comenta PALAVRA", escolha uma palavra curta ligada ao tema.
- Pronúncia: siglas e nomes em inglês são falados como em inglês (SEO e GEO letra por letra). Escreva na narração a grafia normal; o sistema já converte estes termos: ${dictionary}. Se usar outro termo/marca em inglês que um narrador brasileiro leria errado, adicione em "pronunciations" com uma grafia fonética em português (ex.: {"display": "Claude", "spoken": "Clód"}).
- "keywords": 3 a 8 palavras da narração/tela que merecem destaque visual.
- "musicPrompt": em inglês, descreve a trilha instrumental no clima do padrão (sem vocais), para o ElevenLabs Music.
- "postCaption": legenda do post em português, 2–4 linhas, com CTA e 3–6 hashtags.
- Não invente números, estatísticas ou citações específicas que você não possa sustentar; prefira afirmações gerais e verdadeiras.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, neste formato:
{
  "title": "título interno curto do vídeo",
  "scenes": [
    { "narration": "...", "onScreen": "...", "visual": "...", "imagePrompt": "...", "durationS": 2 }
  ],
  "cta": { "narration": "...", "onScreen": "..." },
  "keywords": ["..."],
  "musicPrompt": "...",
  "postCaption": "...",
  "pronunciations": [{ "display": "...", "spoken": "..." }]
}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Normaliza o que veio da IA (ou do formulário de edição) pro formato VideoScript. */
export function normalizeScript(input: unknown): VideoScript {
  const d = (input ?? {}) as Record<string, unknown>;
  const scenesRaw = Array.isArray(d.scenes) ? d.scenes : [];
  const scenes: VideoScene[] = scenesRaw.map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const dur = Number(o.durationS);
    return {
      narration: str(o.narration),
      onScreen: str(o.onScreen),
      visual: str(o.visual),
      imagePrompt: str(o.imagePrompt),
      durationS: Number.isFinite(dur) && dur > 0 ? Math.min(dur, 60) : 2,
    };
  });
  const cta = (d.cta ?? {}) as Record<string, unknown>;
  const pronunciations: Pronunciation[] = (Array.isArray(d.pronunciations) ? d.pronunciations : [])
    .map((p) => ({ display: str((p as Pronunciation)?.display), spoken: str((p as Pronunciation)?.spoken) }))
    .filter((p) => p.display && p.spoken);
  return {
    title: str(d.title) || "Vídeo sem título",
    scenes,
    cta: { narration: str(cta.narration), onScreen: str(cta.onScreen) },
    keywords: (Array.isArray(d.keywords) ? d.keywords : []).map(str).filter(Boolean),
    musicPrompt: str(d.musicPrompt),
    postCaption: str(d.postCaption),
    pronunciations,
  };
}

export async function generateVideoScript(params: {
  pattern: VideoPattern;
  topic: string;
  durationS: number;
  extraInstructions?: string | null;
  model?: string;
}): Promise<VideoScript> {
  const client = getOpenRouterClient();
  const userParts = [`Tema do vídeo: ${params.topic}`];
  if (params.extraInstructions?.trim()) userParts.push(`Instruções extras: ${params.extraInstructions.trim()}`);

  const completion = await client.chat.completions.create({
    model: params.model || VIDEOGEN_TEXT_MODEL,
    temperature: 0.7,
    max_tokens: 6000,
    messages: [
      { role: "system", content: buildSystemPrompt(params.pattern, params.durationS) },
      { role: "user", content: userParts.join("\n\n") },
    ],
  });
  const raw = extractCompletionText(completion);
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    console.error("Roteiro da IA não é JSON válido:", raw);
    throw new Error("Não foi possível interpretar o roteiro da IA como JSON válido.");
  }
  const script = normalizeScript(parsed);
  if (script.scenes.length === 0) throw new Error("A IA não retornou nenhuma cena.");
  return script;
}

import { getOpenRouterClient, extractCompletionText } from "@/lib/openrouter";
import type { VideoPattern } from "./patterns";
import sharp from "sharp";
import {
  WORDS_PER_SECOND,
  fullNarration,
  type BriefingImage,
  type VideoProfileDTO,
  type VideoScript,
  type VideoScene,
  type Pronunciation,
} from "./types";
import { mergePronunciations } from "./pronunciation";
import { isAllowedImageUrl } from "./profiles";

// Claude via OpenRouter (Rodrigo quer um provedor só pra LLM).
export const VIDEOGEN_TEXT_MODEL = process.env.VIDEOGEN_TEXT_MODEL || "anthropic/claude-sonnet-5.5";

/** Bloco do prompt que descreve quem fala (pessoa) e para quem é o conteúdo (empresa). */
function buildProfilesSection(person: VideoProfileDTO | null, company: VideoProfileDTO | null): string {
  const lines = (pairs: [string, string | null | undefined][]) =>
    pairs.filter(([, v]) => v && v.trim()).map(([k, v]) => `- ${k}: ${v!.trim()}`).join("\n");
  const parts: string[] = [];
  if (person) {
    parts.push(`=== QUEM FALA NO VÍDEO (narrador, primeira pessoa) ===
- Nome: ${person.name}
${lines([
  ["Quem é", person.description],
  ["Tom e humor", person.tone],
  ["Jeito de falar (vocabulário, bordões, o que evitar)", person.speech],
  ["CTA preferido", person.cta],
  ["Instagram pessoal", person.instagram],
])}
Escreva a narração como se fosse ${person.name} falando, com esse tom e esse jeito de falar.`);
  } else {
    parts.push(`=== QUEM FALA NO VÍDEO ===
Narrador neutro e simpático, em primeira pessoa, sem se apresentar por nome.`);
  }
  if (company) {
    parts.push(`=== PARA QUAL EMPRESA É O CONTEÚDO (marca dona do vídeo) ===
- Empresa: ${company.name}
${lines([
  ["Sobre a empresa", company.description],
  ["Tom de voz da marca", company.tone],
  ["Regras de comunicação da marca", company.speech],
  ["Site", company.site],
  ["Instagram", company.instagram],
  ["CTA padrão", company.cta],
  ["Cores da marca (use como referência de paleta nas imagens quando combinar com o estilo)", company.colors],
])}
O vídeo é conteúdo da ${company.name}: o assunto, os exemplos e o CTA servem aos objetivos dessa marca, respeitando o tom dela. Se o tom da pessoa e o da marca conflitarem, a pessoa mantém o jeito de falar, mas sem quebrar as regras da marca.`);
  } else {
    parts.push(`=== EMPRESA ===
Nenhuma empresa definida: não cite marca, site nem @ no vídeo.`);
  }
  return parts.join("\n\n");
}

function ctaRule(person: VideoProfileDTO | null, company: VideoProfileDTO | null): string {
  const site = company?.site?.trim();
  const ig = company?.instagram?.trim() || person?.instagram?.trim();
  const refs = [site && `site ${site}`, ig && `Instagram ${ig}`].filter(Boolean).join(" ou ");
  return `- CTA: siga o formato de CTA do padrão${company?.cta ? ` e o CTA padrão da empresa ("${company.cta}") quando couber` : ""}. ${
    refs
      ? `Quando o CTA pedir site ou perfil, use exatamente: ${refs}.`
      : "Não há site nem @ cadastrado: não invente endereço nem perfil; use um CTA de engajamento (seguir, salvar, comentar)."
  } Nunca invente sites, @ ou telefones. Quando pede "comenta PALAVRA", escolha uma palavra curta ligada ao tema.`;
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

interface ScriptContext {
  person: VideoProfileDTO | null;
  company: VideoProfileDTO | null;
  /** Quantas imagens do briefing foram anexadas (numeradas a partir de 1). */
  imageCount: number;
}

function buildSystemPrompt(pattern: VideoPattern, guide: string, durationS: number, ctx: ScriptContext): string {
  const words = Math.round(durationS * WORDS_PER_SECOND);
  const avgScene = (pattern.cenaS[0] + pattern.cenaS[1]) / 2;
  const sceneCount = Math.max(1, Math.round(durationS / avgScene));
  const dictionary = mergePronunciations(ctx.person?.pronunciations ?? [], ctx.company?.pronunciations ?? [])
    .map((p) => `"${p.display}" → "${p.spoken}"`)
    .join(", ");
  const imagesRule = ctx.imageCount
    ? `
- Imagens do briefing: o usuário anexou ${ctx.imageCount} imagem(ns), numeradas de 1 a ${ctx.imageCount} na mensagem dele. Use-as para entender o assunto e, nas cenas em que uma delas combina com o que é dito, coloque o número dela em "userImage" (essa cena usa a foto real em vez de uma imagem gerada). Use cada imagem do briefing em pelo menos uma cena, a não ser que não tenha nada a ver com o roteiro; pode repetir uma imagem se fizer sentido. Nas cenas com "userImage", "imagePrompt" pode ficar vazio e "visual" descreve a foto. Nas outras cenas, deixe "userImage" como null e escreva o "imagePrompt" normalmente, no mesmo clima das fotos.`
    : "";

  return `Você é roteirista e diretor de arte de vídeos curtos verticais (Reels/Shorts, 9:16).

${buildProfilesSection(ctx.person, ctx.company)}

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
${ctaRule(ctx.person, ctx.company)}${imagesRule}
- Pronúncia: siglas e nomes em inglês são falados como em inglês (SEO e GEO letra por letra). Escreva na narração a grafia normal; o sistema já converte estes termos: ${dictionary}. Se usar outro termo/marca em inglês que um narrador brasileiro leria errado, adicione em "pronunciations" com uma grafia fonética em português (ex.: {"display": "Claude", "spoken": "Clód"}).
- "keywords": 3 a 8 palavras da narração/tela que merecem destaque visual.
- "musicPrompt": em inglês, descreve a trilha instrumental no clima do padrão (sem vocais), para o ElevenLabs Music.
- "postCaption": legenda do post em português, 2–4 linhas, com CTA e 3–6 hashtags.
- Não invente números, estatísticas ou citações específicas que você não possa sustentar; prefira afirmações gerais e verdadeiras.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, neste formato:
{
  "title": "título interno curto do vídeo",
  "scenes": [
    { "narration": "...", "onScreen": "...", "visual": "...", "imagePrompt": "...", "durationS": 2${ctx.imageCount ? ', "userImage": null' : ""} }
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
    const scene: VideoScene = {
      narration: str(o.narration),
      onScreen: str(o.onScreen),
      visual: str(o.visual),
      imagePrompt: str(o.imagePrompt),
      durationS: Number.isFinite(dur) && dur > 0 ? Math.min(dur, 60) : 2,
    };
    const imageUrl = str(o.imageUrl);
    if (imageUrl && isAllowedImageUrl(imageUrl)) scene.imageUrl = imageUrl;
    return scene;
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

/** Baixa a imagem e devolve um data URL JPEG de até 1024px (null se falhar). */
async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const jpg = await sharp(buf).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch (err) {
    console.error("Imagem do briefing ignorada:", url, err);
    return null;
  }
}

/** Troca o número "userImage" que a IA escolheu pela URL da imagem do briefing. */
function attachUserImages(raw: unknown, script: VideoScript, urls: string[]): VideoScript {
  if (urls.length === 0) return script;
  const rawScenes = Array.isArray((raw as { scenes?: unknown })?.scenes) ? (raw as { scenes: unknown[] }).scenes : [];
  script.scenes.forEach((scene, i) => {
    const n = Number((rawScenes[i] as { userImage?: unknown } | undefined)?.userImage);
    if (Number.isInteger(n) && n >= 1 && n <= urls.length) scene.imageUrl = urls[n - 1];
  });
  return script;
}

export async function generateVideoScript(params: {
  pattern: VideoPattern;
  /** Guia do estilo (markdown do padrão embutido ou o guia que a IA escreveu ao montar o template). */
  guide: string;
  topic: string;
  durationS: number;
  extraInstructions?: string | null;
  model?: string;
  person?: VideoProfileDTO | null;
  company?: VideoProfileDTO | null;
  briefingImages?: BriefingImage[];
}): Promise<{ script: VideoScript; usd: number }> {
  const client = getOpenRouterClient();
  const userParts = [`Tema do vídeo: ${params.topic}`];
  if (params.extraInstructions?.trim()) userParts.push(`Instruções extras: ${params.extraInstructions.trim()}`);

  // Imagens do briefing vão como entrada de visão (reduzidas, em base64: o modelo não precisa
  // de resolução total e a URL do blob pode não ser acessível pelo provedor).
  const briefing = params.briefingImages ?? [];
  const attached: { image: BriefingImage; dataUrl: string }[] = [];
  for (const image of briefing) {
    const dataUrl = await imageToDataUrl(image.url);
    if (dataUrl) attached.push({ image, dataUrl });
  }
  type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  const userContent: Part[] = [{ type: "text", text: userParts.join("\n\n") }];
  attached.forEach(({ image, dataUrl }, i) => {
    userContent.push({ type: "text", text: `Imagem ${i + 1}${image.note ? ` (observação do usuário: ${image.note})` : ""}:` });
    userContent.push({ type: "image_url", image_url: { url: dataUrl } });
  });

  const ctx: ScriptContext = { person: params.person ?? null, company: params.company ?? null, imageCount: attached.length };
  const messages: { role: "system" | "user" | "assistant"; content: string | Part[] }[] = [
    { role: "system", content: buildSystemPrompt(params.pattern, params.guide, params.durationS, ctx) },
    { role: "user", content: attached.length ? userContent : userParts.join("\n\n") },
  ];
  const model = params.model || VIDEOGEN_TEXT_MODEL;

  let usd = 0; // soma o custo das chamadas (usage.cost da OpenRouter), inclusive a de encurtar
  async function ask(): Promise<{ raw: string; script: VideoScript }> {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 6000,
      messages: messages as Parameters<typeof client.chat.completions.create>[0]["messages"],
      // parâmetro da OpenRouter (fora do tipo do SDK): devolve usage.cost em dólar
      ...({ usage: { include: true } } as object),
    });
    usd += Number((completion.usage as { cost?: number } | undefined)?.cost) || 0;
    const raw = extractCompletionText(completion);
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      console.error("Roteiro da IA não é JSON válido:", raw);
      throw new Error("Não foi possível interpretar o roteiro da IA como JSON válido.");
    }
    return { raw, script: attachUserImages(parsed, normalizeScript(parsed), attached.map((a) => a.image.url)) };
  }

  const first = await ask();
  const raw = first.raw;
  let script = first.script;
  if (script.scenes.length === 0) throw new Error("A IA não retornou nenhuma cena.");

  // O modelo costuma passar do tamanho pedido; narração longa estoura a duração do vídeo.
  // Uma segunda rodada pedindo para cortar resolve na maioria dos casos.
  const target = Math.round(params.durationS * WORDS_PER_SECOND);
  const count = fullNarration(script).split(/\s+/).filter(Boolean).length;
  if (!params.pattern.semNarracao && count > target * 1.25) {
    messages.push(
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `A narração ficou com ${count} palavras, mas o máximo para ${params.durationS}s é ${target}. Reescreva o roteiro mais curto (no máximo ${target} palavras somando cenas e CTA), juntando ou removendo cenas se precisar. Mesmo formato JSON${attached.length ? ' (mantenha "userImage" nas cenas que usam imagens do briefing)' : ''}.`,
      }
    );
    try {
      const shorter = (await ask()).script;
      if (shorter.scenes.length > 0) script = shorter;
    } catch (err) {
      console.error("Falha ao encurtar o roteiro, mantendo o original:", err);
    }
  }
  return { script, usd };
}

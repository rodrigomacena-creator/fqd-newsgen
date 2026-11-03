// "Criar com IA" do campo Tema: transforma um pedido livre num tema pronto para o roteiro.
// Com pesquisa na web (plugin "web" da OpenRouter) para assuntos recentes, com as fontes citadas.
import { getOpenRouterClient, extractCompletionText } from "@/lib/openrouter";
import { VIDEOGEN_TEXT_MODEL } from "./generateScript";

export const MAX_TOPIC_REQUEST = 1000;
const MAX_TOPIC = 2000;

export interface TopicSource {
  url: string;
  title: string;
}

export interface TopicResult {
  topic: string;
  sources: TopicSource[];
  usd: number;
}

function systemPrompt(durationS: number, web: boolean) {
  const today = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  return `Você prepara o TEMA de um vídeo curto narrado (Reels/Shorts/YouTube) de cerca de ${durationS} segundos, em português do Brasil. Hoje é ${today}.
O usuário escreve um pedido solto. Você devolve um tema bem formatado que outra IA vai usar para escrever o roteiro: quase um resumo do roteiro.

Formato (texto simples, sem markdown, sem asteriscos, sem emojis), no máximo ${MAX_TOPIC - 200} caracteres:
1ª linha: o título do vídeo, curto e chamativo.
Linha em branco.
Um parágrafo de 2 a 4 frases com o assunto e o ângulo: o que aconteceu (ou o que é), por que importa para quem assiste.
Linha em branco.
"Pontos do vídeo:" e de 3 a 5 linhas começando com "- ", na ordem em que o vídeo deve contar: gancho de abertura, fatos principais (com números, nomes e datas concretos), fechamento.
${web ? `
Use a pesquisa na web para trazer os fatos MAIS RECENTES. Só escreva fatos que estejam nas fontes encontradas; cite datas reais. Se as fontes divergirem, fique com o que for confirmado por mais de uma. Não invente números nem declarações. Não coloque links nem nomes de sites no texto.` : `
Sem pesquisa na web: use só conhecimento geral e estável. Se o pedido for sobre notícia recente, escreva o tema sem afirmar fatos que você não tem certeza que são atuais.`}
Tom neutro e informativo, a não ser que o pedido peça outra coisa. Responda só com o tema.`;
}

export async function createTopic(request: string, opts: { web: boolean; durationS: number }): Promise<TopicResult> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: VIDEOGEN_TEXT_MODEL,
    max_tokens: 3000,
    messages: [
      { role: "system", content: systemPrompt(opts.durationS, opts.web) },
      { role: "user", content: request },
    ],
    // parâmetros da OpenRouter fora do tipo do SDK: custo em dólar e pesquisa na web
    ...({ usage: { include: true }, ...(opts.web ? { plugins: [{ id: "web", max_results: 6 }] } : {}) } as object),
  });
  const usd = Number((completion.usage as { cost?: number } | undefined)?.cost) || 0;
  const topic = extractCompletionText(completion)
    .replace(/\*\*?|__|^#+\s*/gm, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .trim()
    .slice(0, MAX_TOPIC);
  if (!topic) throw new Error("A IA não devolveu um tema. Tente de novo.");
  const annotations =
    (completion.choices?.[0]?.message as { annotations?: { type: string; url_citation?: { url?: string; title?: string } }[] } | undefined)
      ?.annotations ?? [];
  const seen = new Set<string>();
  const sources: TopicSource[] = [];
  for (const a of annotations) {
    const url = a.url_citation?.url;
    if (a.type !== "url_citation" || !url || seen.has(url)) continue;
    seen.add(url);
    let title = a.url_citation?.title?.trim() || "";
    if (!title) {
      try {
        title = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        title = url;
      }
    }
    sources.push({ url, title });
  }
  return { topic, sources: sources.slice(0, 8), usd };
}

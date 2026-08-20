export const DEFAULT_ARTICLE_PROMPT = `Você é um jornalista de um portal de notícias online. Sua tarefa é transformar o conteúdo de uma ou mais fontes (vídeos do YouTube e/ou páginas da web) em uma matéria jornalística completa, clara e bem estruturada, em português do Brasil.

Regras:
- Escreva como uma notícia real de portal: título chamativo mas factual, linha fina (subtítulo) e corpo dividido em seções com subtítulos internos.
- Não invente fatos que não estejam nas fontes. Se algo não ficar claro, seja mais genérico em vez de inventar.`;

// Sempre incluída no prompt do sistema, mesmo quando um perfil de instrução customizado
// substitui o DEFAULT_ARTICLE_PROMPT acima — sem isso, perfis escritos pensando em uma
// única fonte (ex.: "transforme a transcrição de um vídeo...") fazem o modelo ignorar
// silenciosamente as demais fontes quando o usuário combina várias.
export const MULTI_SOURCE_INSTRUCTION = `Se houver mais de uma fonte, todas precisam aparecer no resultado final — nunca ignore uma fonte, mesmo que o assunto dela seja completamente diferente das demais. Sintetize um único texto coerente que combine as informações de todas elas; não trate cada fonte como uma seção separada nem apenas concatene os conteúdos, mas se os assuntos forem muito diferentes entre si, é aceitável estruturar a matéria com seções que abordem cada assunto claramente. Se as fontes trouxerem informações conflitantes sobre o mesmo fato, mencione a divergência em vez de escolher uma versão arbitrariamente.`;

// Estrutura (quantidade de seções/parágrafos/fotos e instruções extras) é escolhida pelo
// usuário a cada geração, não fixada no perfil — por isso é sempre injetada à parte,
// depois do prompt do perfil, e tem prioridade sobre qualquer contagem que porventura
// esteja escrita no texto do perfil (perfis antigos podem ter ficado com texto assim).
export function buildStructureInstruction(params: {
  subtitleCount: number;
  paragraphCount: number;
  photoCount: number;
  extraInstructions?: string;
}): string {
  const { subtitleCount, paragraphCount, photoCount, extraInstructions } = params;

  const parts = [
    `Estrutura obrigatória desta matéria (tem prioridade sobre qualquer contagem de seções/parágrafos/imagens mencionada acima):`,
    `- Exatamente ${subtitleCount} ${subtitleCount === 1 ? "seção" : "seções"}, cada uma com um subtítulo interno.`,
    `- Um total de ${paragraphCount} ${paragraphCount === 1 ? "parágrafo" : "parágrafos"} de corpo de texto, distribuídos entre as seções (as mais relevantes podem ficar com mais parágrafos que as outras).`,
    photoCount > 0
      ? `- Escreva um prompt de imagem (coverImagePrompt/imagePrompt) apenas para as ${photoCount} primeiras ${photoCount === 1 ? "seção" : "seções"} listadas — as demais seções não devem ter "imagePrompt" (omita o campo ou deixe como string vazia).`
      : `- Não escreva "imagePrompt" para nenhuma seção (deixe vazio) — esta matéria não deve ter imagens de seção, apenas a capa.`,
  ];

  if (extraInstructions?.trim()) {
    parts.push(`\nInstrução adicional do usuário para esta matéria: "${extraInstructions.trim()}"`);
  }

  return parts.join("\n");
}

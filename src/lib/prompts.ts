export const DEFAULT_ARTICLE_PROMPT = `Você é um jornalista de um portal de notícias online. Sua tarefa é transformar o conteúdo de uma ou mais fontes (vídeos do YouTube e/ou páginas da web) em uma matéria jornalística completa, clara e bem estruturada, em português do Brasil.

Regras:
- Escreva como uma notícia real de portal: título chamativo mas factual, linha fina (subtítulo) e corpo dividido em seções com subtítulos internos.
- Não invente fatos que não estejam nas fontes. Se algo não ficar claro, seja mais genérico em vez de inventar.`;

// Sempre incluída no prompt do sistema, mesmo quando um perfil de instrução customizado
// substitui o DEFAULT_ARTICLE_PROMPT acima — sem isso, perfis escritos pensando em uma
// única fonte (ex.: "transforme a transcrição de um vídeo...") fazem o modelo ignorar
// silenciosamente as demais fontes quando o usuário combina várias.
export const MULTI_SOURCE_INSTRUCTION = `Se houver mais de uma fonte, todas precisam aparecer no resultado final — nunca ignore uma fonte, mesmo que o assunto dela seja completamente diferente das demais. Sintetize um único texto coerente que combine as informações de todas elas; não trate cada fonte como uma seção separada nem apenas concatene os conteúdos, mas se os assuntos forem muito diferentes entre si, é aceitável estruturar a matéria com seções que abordem cada assunto claramente. Se as fontes trouxerem informações conflitantes sobre o mesmo fato, mencione a divergência em vez de escolher uma versão arbitrariamente.`;

// Só entra quando o usuário escreveu um prompt (pauta) no lugar/além de links. Sem fontes
// externas, o risco é o modelo inventar dados específicos — esta regra segura isso.
export const PROMPT_SOURCE_INSTRUCTION = `Uma das fontes é um prompt escrito pelo usuário (pauta/briefing): ele diz sobre o que a notícia deve ser e pode trazer fatos, nomes, números e orientações. Escreva a matéria com base nele. Use apenas os fatos que o prompt traz ou conhecimento geral amplamente estabelecido; NUNCA invente citações, números, datas, nomes de pessoas ou estatísticas específicas que o prompt não forneceu. Se faltar informação, escreva de forma mais geral e contextual em vez de preencher com dados fabricados. Isso vale com rigor para citações e elementos ricos: só crie uma "Citação em destaque" se o prompt trouxer a fala literal e quem a disse; só use números, datas e eventos que o prompt informou (omita tabela, gráfico, linha do tempo ou infográfico se o prompt não tiver esses dados); nunca escreva uma fala entre aspas atribuída a uma pessoa por conta própria. Não afirme datas ("nesta semana", "estreia hoje") que o prompt não deu. Se houver outras fontes (vídeos/páginas), o prompt orienta o enfoque e elas fornecem os fatos.`;

// Quais destinos (Portal / Instagram) o usuário escolheu pra essa geração — sempre
// injetada, controla quais campos do JSON de resposta são preenchidos de verdade e
// quais ficam vazios. "title"/"subtitle" sempre existem (identificam a notícia no
// histórico mesmo quando Portal não foi escolhido).
export function buildDestinationsInstruction(params: {
  wantPortal: boolean;
  wantInstagram: boolean;
  instagramPhotoCount: number;
  extraInstructions?: string;
}): string {
  const { wantPortal, wantInstagram, instagramPhotoCount, extraInstructions } = params;

  const parts = [
    `Esta geração tem destinos específicos escolhidos pelo usuário — siga exatamente o que está descrito abaixo pra cada campo do JSON de resposta:`,
    `- "title" e "subtitle": escreva sempre, mesmo quando a matéria de portal não foi pedida — servem pra identificar esta notícia no histórico do sistema.`,
    wantPortal
      ? `- Portal: SIM foi selecionado. Gere a matéria completa — "coverImagePrompt" e o array "sections", seguindo a estrutura obrigatória detalhada mais abaixo.`
      : `- Portal: NÃO foi selecionado. Deixe "coverImagePrompt" como string vazia "" e "sections" como array vazio [].`,
    wantInstagram
      ? `- Instagram (reels/shorts): SIM foi selecionado. Gere "instagram.caption" (legenda) e "instagram.imagePrompts", um array com EXATAMENTE ${instagramPhotoCount} prompt${instagramPhotoCount === 1 ? "" : "s"} de imagem em inglês — cada um um card gráfico de notícia COM texto embutido (headline curta), ver regra detalhada mais abaixo.${
          instagramPhotoCount > 1
            ? ` Como são ${instagramPhotoCount} imagens formando um carrossel, cada prompt deve ilustrar um ângulo, momento ou aspecto diferente do assunto — nunca repita a mesma cena/texto em prompts diferentes.`
            : ""
        }`
      : `- Instagram: NÃO foi selecionado. Deixe "instagram.caption" como string vazia "" e "instagram.imagePrompts" como array vazio [].`,
  ];

  if (extraInstructions?.trim()) {
    parts.push(`\nInstrução adicional do usuário para esta notícia (vale pra todos os destinos selecionados): "${extraInstructions.trim()}"`);
  }

  return parts.join("\n");
}

// Estrutura (quantidade de seções/parágrafos/fotos) é escolhida pelo usuário a cada
// geração, não fixada no perfil — por isso é sempre injetada à parte, depois do prompt
// do perfil, e tem prioridade sobre qualquer contagem que porventura esteja escrita no
// texto do perfil (perfis antigos podem ter ficado com texto assim). Só se aplica quando
// o destino Portal foi selecionado (ver buildDestinationsInstruction).
export function buildStructureInstruction(params: {
  subtitleCount: number;
  paragraphCount: number;
  photoCount: number;
}): string {
  const { subtitleCount, paragraphCount, photoCount } = params;

  const parts = [
    `Estrutura obrigatória da matéria de portal (tem prioridade sobre qualquer contagem de seções/parágrafos/imagens mencionada acima):`,
    `- Exatamente ${subtitleCount} ${subtitleCount === 1 ? "seção" : "seções"}, cada uma com um subtítulo interno.`,
    `- Um total de ${paragraphCount} ${paragraphCount === 1 ? "parágrafo" : "parágrafos"} de corpo de texto, distribuídos entre as seções (as mais relevantes podem ficar com mais parágrafos que as outras).`,
    photoCount > 0
      ? `- Escreva um prompt de imagem (coverImagePrompt/imagePrompt) apenas para as ${photoCount} primeiras ${photoCount === 1 ? "seção" : "seções"} listadas — as demais seções não devem ter "imagePrompt" (omita o campo ou deixe como string vazia).`
      : `- Não escreva "imagePrompt" para nenhuma seção (deixe vazio) — esta matéria não deve ter imagens de seção, apenas a capa.`,
  ];

  return parts.join("\n");
}

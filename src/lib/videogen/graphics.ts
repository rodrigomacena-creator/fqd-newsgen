// Grafismos (motion graphics) por cena: contador, barras, ranking, gráfico, passos, versus...
// Espelho de worker/render/mograph.py (normalize_graphic é a fonte da verdade do formato; o worker
// descarta qualquer grafismo inválido e a cena fica como sem grafismo). Só vale nos estilos que
// rodam no motor genérico (estilo livre e templates); os embutidos ignoram.
// Arquivo puro (sem imports de servidor): o editor também usa.

export const GRAPHIC_TYPES = [
  "counter",
  "bars",
  "ranking",
  "rank_item",
  "line_chart",
  "donut",
  "steps",
  "checklist",
  "versus",
  "timeline",
  "icon",
  "icons",
  // cenas de motion de tela cheia (worker/render/mograph_fx.py)
  "particle_text",
  "liquid_text",
  "kinetic_poster",
  "split_reveal",
  "morph",
  "globe",
  "route",
  "flip_clock",
  "chat",
  "phone",
  "iso_bars",
  "equalizer",
  "burst",
  "card_stack",
  "loader",
  "code",
  "orbit",
  "search",
  // segunda leva (worker/render/mograph_fx2.py)
  "glitch_text",
  "stretch_text",
  "wave_text",
  "echo_text",
  "scramble_text",
  "marquee",
  "highlight_text",
  "quote",
  "countdown",
  "kaleidoscope",
  "tunnel",
  "dot_wave",
  "blob",
  "spiro",
  "fireworks",
  "cube",
  "helix",
  "activity_rings",
  "pie",
  "calendar_grid",
  "candles",
  "gauge",
  "bubbles",
  "venn",
  "funnel",
  "rating",
  "battery",
  "thermometer",
  "cursor_click",
  "like_button",
  "price_tag",
] as const;
export type GraphicType = (typeof GRAPHIC_TYPES)[number];

export const GRAPHIC_LABELS: Record<GraphicType, string> = {
  counter: "Número contando",
  bars: "Barras",
  ranking: "Ranking (lista)",
  rank_item: "Item de ranking",
  line_chart: "Gráfico de linha",
  donut: "Porcentagem (rosca)",
  steps: "Passo a passo",
  checklist: "Checklist",
  versus: "Comparação (versus)",
  timeline: "Linha do tempo",
  icon: "Ícone desenhado",
  icons: "Ícones",
  particle_text: "Palavra de partículas",
  liquid_text: "Palavra enchendo",
  kinetic_poster: "Pôster tipográfico",
  split_reveal: "Tela abrindo em fatias",
  morph: "Forma que se transforma",
  globe: "Globo com rotas",
  route: "Mapa com trajeto",
  flip_clock: "Relógio de placas",
  chat: "Conversa de chat",
  phone: "Celular com notificações",
  iso_bars: "Barras 3D",
  equalizer: "Espectro de som",
  burst: "Explosão",
  card_stack: "Pilha de cartões",
  loader: "Carregando → pronto",
  code: "Código digitando",
  orbit: "Órbita de ícones",
  search: "Busca com resultados",
  glitch_text: "Texto com glitch",
  stretch_text: "Letras elásticas",
  wave_text: "Texto em onda",
  echo_text: "Texto em eco",
  scramble_text: "Texto decodificando",
  marquee: "Letreiro correndo",
  highlight_text: "Frase com marca-texto",
  quote: "Citação",
  countdown: "Contagem regressiva",
  kaleidoscope: "Caleidoscópio",
  tunnel: "Túnel de velocidade",
  dot_wave: "Onda de pontos",
  blob: "Gota líquida",
  spiro: "Espirógrafo",
  fireworks: "Fogos de artifício",
  cube: "Cubo 3D girando",
  helix: "Hélice de DNA",
  activity_rings: "Anéis de metas",
  pie: "Gráfico de pizza",
  calendar_grid: "Calendário enchendo",
  candles: "Gráfico da bolsa",
  gauge: "Velocímetro",
  bubbles: "Bolhas de dados",
  venn: "Diagrama de Venn",
  funnel: "Funil",
  rating: "Avaliação com estrelas",
  battery: "Bateria carregando",
  thermometer: "Termômetro",
  cursor_click: "Cursor clicando",
  like_button: "Curtida explodindo",
  price_tag: "Etiqueta de preço",
};

/** Tipos que ocupam a tela inteira (pintam o próprio fundo; título e legenda da cena ficam por cima). */
export const FX_GRAPHICS: readonly GraphicType[] = GRAPHIC_TYPES.slice(GRAPHIC_TYPES.indexOf("particle_text"));

export interface GraphicItem {
  label?: string;
  value?: string;
  icon?: string;
  text?: string;
  /** chat: "right" = balão da direita */
  side?: string;
}

export interface SceneGraphic {
  type: GraphicType;
  /** Foto da cena no fundo, escurecida, com o grafismo por cima (tipos base, menos rank_item). */
  backdrop?: boolean;
  value?: string;
  from?: string;
  label?: string;
  unit?: string;
  rank?: string;
  sub?: string;
  header?: string;
  icon?: string;
  text?: string;
  to?: string;
  lines?: string[];
  output?: string;
  items?: GraphicItem[];
  points?: number[];
  labels?: string[];
  left?: GraphicItem;
  right?: GraphicItem;
}

/** Item de ranking mostra a imagem da cena numa faixa larga; os outros grafismos não usam imagem. */
export function graphicNeedsImage(g: SceneGraphic | undefined | null): boolean {
  return g?.type === "rank_item" || Boolean(g?.backdrop);
}

/** Tipos que podem ter a foto da cena no fundo ("backdrop"): os base, menos rank_item (espelho de mograph.py). */
export const BACKDROP_GRAPHICS: GraphicType[] = ["counter", "bars", "ranking", "line_chart", "donut", "steps", "checklist", "versus", "timeline", "icon", "icons"];

// ---------- motion por cima da foto (worker/render/overlay.py, normalize() é a fonte da verdade) ----------

export const OVERLAY_TYPES = ["callout", "stat", "tags", "progress", "focus"] as const;
export type OverlayType = (typeof OVERLAY_TYPES)[number];

export const OVERLAY_LABELS: Record<OverlayType, string> = {
  callout: "Anotação apontando na foto",
  stat: "Painel com número contando",
  tags: "Etiquetas com ícone",
  progress: "Barra de progresso",
  focus: "Mira de foco",
};

export interface SceneOverlay {
  type: OverlayType;
  label?: string;
  text?: string;
  value?: string;
  x?: number;
  y?: number;
  items?: { label: string; icon?: string }[];
}

/** Limpa o overlay vindo da IA ou do editor. undefined = cena só com a foto. */
export function sanitizeOverlay(raw: unknown): SceneOverlay | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const type = o.type as OverlayType;
  if (!OVERLAY_TYPES.includes(type)) return undefined;
  const out: SceneOverlay = { type };
  for (const k of ["label", "text", "value"] as const) {
    const x = s(o[k], 40);
    if (x) out[k] = x;
  }
  for (const k of ["x", "y"] as const) {
    const n = Number(o[k]);
    if (Number.isFinite(n)) out[k] = Math.min(Math.max(n, 0.15), 0.85);
  }
  if (Array.isArray(o.items)) {
    const items = o.items
      .map((i) => item(i))
      .filter((i) => i.label)
      .slice(0, 3)
      .map((i) => (i.icon ? { label: i.label!, icon: i.icon } : { label: i.label! }));
    if (items.length) out.items = items;
  }
  if ((type === "stat" || type === "progress") && !out.value) return undefined;
  if (type === "callout" && !out.label) return undefined;
  if (type === "tags" && !out.items) return undefined;
  return out;
}

function s(v: unknown, n: number): string {
  return typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim().slice(0, n) : "";
}

function item(v: unknown): GraphicItem {
  const o = (typeof v === "string" ? { label: v } : v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: GraphicItem = {};
  for (const k of ["label", "value", "icon", "text", "side"] as const) {
    const x = s(o[k], k === "text" ? 80 : 40);
    if (x) out[k] = x;
  }
  return out;
}

/** Limpa o grafismo vindo da IA ou do editor. undefined = cena sem grafismo. */
export function sanitizeGraphic(raw: unknown): SceneGraphic | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const type = o.type as GraphicType;
  if (!GRAPHIC_TYPES.includes(type)) return undefined;
  const g: SceneGraphic = { type };
  for (const k of ["value", "from", "to", "label", "unit", "rank", "sub", "header", "icon", "text", "output"] as const) {
    const x = s(o[k], 60);
    if (x) g[k] = x;
  }
  if (Array.isArray(o.items)) {
    const items = o.items.map(item).filter((i) => i.label || i.icon || i.text).slice(0, 6);
    if (items.length) g.items = items;
  }
  if (Array.isArray(o.points)) {
    const pts = o.points
      .map((p) => (typeof p === "number" ? p : Number(String(p).replace(/[^\d.,-]/g, "").replace(",", "."))))
      .filter((p) => Number.isFinite(p))
      .slice(0, 12);
    if (pts.length) g.points = pts;
  }
  if (Array.isArray(o.labels)) g.labels = o.labels.map((l) => s(l, 10)).slice(0, 12);
  if (Array.isArray(o.lines)) {
    const lines = o.lines.map((l) => (typeof l === "string" ? l.slice(0, 46) : "")).filter((l) => l.trim()).slice(0, 9);
    if (lines.length) g.lines = lines;
  }
  if (o.left) g.left = item(o.left);
  if (o.right) g.right = item(o.right);
  if (o.backdrop === true && BACKDROP_GRAPHICS.includes(type)) g.backdrop = true;
  return g;
}

/** Quantos grafismos o estilo pede (spec.graphics.usage); padrão "some". */
export function graphicsUsage(spec: unknown): "none" | "some" | "many" {
  const g = ((spec ?? {}) as Record<string, unknown>).graphics as Record<string, unknown> | undefined;
  const u = g?.usage;
  return u === "none" || u === "many" ? u : "some";
}

/** Grupo "graphics" da ficha de estilo (espelho de GRAPHICS_CHOICES em mograph.py). */
export const GRAPHICS_SPEC_HELP = `"graphics": {"style": clean | hand (traço limpo ou rabiscado à mão, que treme de leve), "stroke": 3-26 (espessura do traço), "color": accent | text (cor dos traços), "glow": true/false (brilho no traço, bom em fundo escuro), "decor": none | grid | lines | dots | shapes | rings (fundo vivo atrás dos grafismos: grade, linhas diagonais, pontos, formas que se transformam, anéis), "pen": true/false (ponta de caneta desenhando), "usage": none | some | many (quantas cenas com grafismo)}`;

const USAGE_TEXT = {
  none: "",
  some: "Use grafismo em 2 a 4 cenas, onde o conteúdo pede (número, lista, comparação, etapas, virada de assunto).",
  many: "Este vídeo é de motion graphics: use grafismo em PELO MENOS METADE das cenas, variando os tipos (misture infográficos com cenas de tela cheia, com pelo menos 3 tipos de tela cheia diferentes no vídeo).",
};

/**
 * Regra do "motion por cima da foto" (worker/render/overlay.py) e do ritmo de motion: nenhuma cena com
 * imagem fica só com a foto e o texto. Vale para os estilos do motor genérico (estilo livre e templates).
 */
export function overlayPromptRule(): string {
  return `
- Motion em TODA cena: nenhuma cena pode ser só a foto com o texto em cima. Cena que não tem "graphic" e mostra imagem leva "overlay", um elemento desenhado AO VIVO por cima da foto, no meio da tela, que reforça o que é dito naquele trecho:
  - {"type":"callout","label":"até 3 palavras","text":"detalhe curto (opcional)","x":0.5,"y":0.45}: ponto pulsando num lugar da foto (x/y de 0.15 a 0.85, na área do assunto principal) e uma linha até uma etiqueta, como uma anotação
  - {"type":"stat","value":"+58%","label":"..."}: painel com um número contando (só número verdadeiro)
  - {"type":"tags","items":[{"label":"...","icon":"..."}]}: 1 a 3 etiquetas com ícone entrando uma a uma (os conceitos da fala)
  - {"type":"progress","value":"72%","label":"..."}: barra enchendo até a porcentagem
  - {"type":"focus","label":"até 3 palavras"}: mira se fechando em volta do assunto, com varredura e etiqueta
  Varie os tipos (nunca o mesmo em duas cenas seguidas). Só as cenas text_only e as com "graphic" ficam sem "overlay".`;
}

/** Regra das imagens das cenas: conceito visual concreto, com pessoas e situações, em vez de objetos soltos. */
export const IMAGE_CONCEPT_RULE = `
- Conceito das imagens (o "imagePrompt"): cada imagem é uma SITUAÇÃO concreta que mostra o que a frase diz, nunca um objeto solto, um ícone ou uma abstração genérica. Pense como um diretor de fotografia de documentário: QUEM aparece (pessoas reais e específicas: um time, um cliente, um profissional, de idade, roupa e jeito definidos), FAZENDO O QUÊ (uma ação que tem a ver com a fala: discutindo em volta de uma tela, comemorando um resultado, comparando dois produtos, atendendo um cliente), ONDE (lugar específico) e COMO (enquadramento variado entre as cenas: plano aberto, médio, close nas mãos, por cima do ombro, vista de cima; luz e lente). Prefira pessoas interagindo entre si ou com a tecnologia, equipes, bastidores e resultados visíveis. Mantenha o mesmo "elenco" e o mesmo mundo do começo ao fim, para o vídeo contar uma história. Metáfora visual só quando for clara de primeira (ex.: uma fila enorme numa loja vazia ao lado = concorrência).`;

/**
 * Regra do roteiro para os estilos do motor genérico. O grafismo é desenhado AO VIVO na tela
 * (traço a traço, números contando, barras crescendo) no lugar da imagem da cena.
 */
export function graphicsPromptRule(usage: "none" | "some" | "many"): string {
  if (usage === "none") return "";
  return `
- Grafismos (motion graphics desenhados ao vivo na tela, no lugar da imagem da cena): coloque "graphic" nas cenas em que o conteúdo é um dado, lista, comparação ou etapa. ${USAGE_TEXT[usage]} Nas outras cenas, não coloque o campo. Tipos e formato:
  - {"type":"counter","value":"87%","from":"0","label":"..."}: número grande contando (value com o número; pode ter prefixo/sufixo: "R$ 1,2 mi", "3x", "45%")
  - {"type":"donut","value":"64%","label":"..."}: porcentagem que completa um círculo
  - {"type":"bars","items":[{"label":"Brasil","value":"120"},...],"unit":"mi"}: 2 a 6 barras crescendo (a maior em destaque)
  - {"type":"ranking","items":[{"label":"..."},...]}: lista numerada (1º em destaque); com "value" em cada item vira barras com posição
  - {"type":"rank_item","rank":"5","label":"nome","value":"25 anos","sub":"273 dias","header":"título do ranking"}: UMA posição de um ranking por cena, em sequência (5, 4, 3, 2, 1), com o mesmo "header" em todas: a posição e o valor rolam como odômetro de uma cena para a outra (valores com o mesmo sufixo) e a imagem da cena atravessa a tela numa faixa larga (o "imagePrompt" dessas cenas descreve o item, enquadramento horizontal, assunto de lado). Use para rankings e "top N" contados item a item.
  - {"type":"line_chart","points":[10,14,22,41],"labels":["2022","2023","2024","2025"],"label":"..."}: linha que se desenha
  - {"type":"steps","items":[{"label":"Pesquise","icon":"search"},...]}: 2 a 5 etapas numeradas ligadas por setas
  - {"type":"checklist","items":["...","..."]}: itens que vão sendo marcados
  - {"type":"versus","left":{"label":"SEO","value":"10 links","icon":"search"},"right":{"label":"GEO","value":"1 resposta","icon":"bot"}}: comparação lado a lado
  - {"type":"timeline","items":[{"label":"1985","text":"..."},...]}: 2 a 5 marcos no tempo
  - {"type":"icon","icon":"rocket","label":"..."} e {"type":"icons","items":[{"icon":"clock","label":"Rápido"},...]}: 1 a 3 ícones desenhados traço a traço
  Grafismo com foto no fundo: nos tipos acima (menos rank_item), "backdrop": true põe a foto da cena no fundo, desfocada e escurecida, com o grafismo desenhado por cima. Aí escreva o "imagePrompt" normalmente (a foto que dá contexto ao dado: as pessoas, o lugar, a situação). Use em boa parte dos grafismos: junta imagem e motion na mesma cena.
  Cenas de motion de TELA CHEIA (pintam o próprio fundo, ótimas para abrir, virar capítulo, dar um dado de impacto e fechar; nunca duas seguidas, sem repetir tipo no vídeo):
  - {"type":"particle_text","text":"PALAVRA","sub":"..."}: milhares de partículas voam e formam a palavra (1 palavra curta)
  - {"type":"liquid_text","text":"PALAVRA","sub":"..."}: contorno da palavra desenhado e enchendo de líquido com ondas
  - {"type":"kinetic_poster","items":["Rápido","Bonito","Seu"]}: 2 a 7 palavras batendo na tela uma a uma, trocando de cor
  - {"type":"split_reveal","text":"PALAVRA","sub":"..."}: fatias coloridas se abrem revelando a palavra
  - {"type":"morph","items":["Forma","Cor","Ritmo"]}: uma forma que vira outra (círculo, quadrado, triângulo...) a cada palavra
  - {"type":"globe","label":"...","sub":"..."}: globo girando com rotas entre cidades (alcance, mundo, internacional)
  - {"type":"route","from":"São Paulo","to":"Lisboa","value":"7.900 km"}: mapa com trajeto tracejado e pino andando
  - {"type":"flip_clock","value":"2026","label":"..."}: placas de relógio virando até o número (só dígitos, ":" e ",")
  - {"type":"chat","items":[{"text":"..."},{"text":"...","side":"right"}]}: conversa com "digitando..." e balões (2 a 5)
  - {"type":"phone","label":"...","items":[{"label":"Curtidas","text":"+1.240","icon":"heart"}]}: celular subindo com 1 a 4 notificações
  - {"type":"iso_bars","items":[{"label":"2024","value":"28"},...],"unit":"mil"}: barras 3D crescendo (2 a 5)
  - {"type":"equalizer","text":"...","icon":"mic"}: espectro de áudio circular pulsando (som, podcast, música)
  - {"type":"burst","text":"Lançou!","icon":"rocket"}: explosão de confete e raios (lançamento, conquista, fecho)
  - {"type":"card_stack","items":[{"label":"...","text":"...","icon":"..."}]}: pilha de cartões passando um a um (2 a 4)
  - {"type":"loader","text":"Pronto"}: carregamento até 100% que vira um check
  - {"type":"code","lines":["const x = 1", "..."],"output":"..."}: editor de código digitando (até 9 linhas curtas) e o resultado
  - {"type":"orbit","text":"Você","items":[{"icon":"camera","label":"Reels"},...]}: 3 a 6 ícones orbitando um centro
  - {"type":"search","text":"o que a pessoa pesquisa","items":[{"label":"...","text":"...","icon":"..."}]}: busca digitada e até 3 resultados
  Mais cenas de tela cheia (mesmas regras):
  - texto: {"type":"glitch_text"|"stretch_text"|"wave_text"|"echo_text"|"scramble_text","text":"PALAVRA","sub":"..."} (glitch digital, letras elásticas que caem e quicam, letras em onda, eco em camadas, letras decodificando); {"type":"marquee","items":["Rápido","Fácil"]} (letreiros correndo pela tela inteira); {"type":"highlight_text","text":"frase curta","value":"palavra-chave"} (frase aparecendo com marca-texto e círculo na palavra); {"type":"quote","text":"citação","label":"autor"} (só citação verdadeira); {"type":"countdown","value":"3","text":"Já!"} (contagem regressiva)
  - formas (fundo vivo para uma palavra): {"type":"kaleidoscope"|"tunnel"|"dot_wave"|"blob"|"spiro"|"helix"|"fireworks","text":"PALAVRA","sub":"..."} (caleidoscópio, túnel de velocidade, onda numa grade de pontos, gota líquida, espirógrafo se desenhando, hélice de DNA, fogos de artifício); {"type":"cube","items":["A","B","C","D"]} (cubo 3D girando, uma palavra por face, 2 a 4)
  - dados: {"type":"activity_rings","label":"...","items":[{"label":"...","value":"80%"}]} (1 a 3 anéis de meta); {"type":"pie","label":"...","items":[{"label":"...","value":"45"}]} (2 a 6 fatias); {"type":"bubbles","label":"...","items":[{"label":"...","value":"..."}]} (2 a 6 bolhas, tamanho pelo valor, mesma unidade); {"type":"funnel","label":"...","items":[{"label":"...","value":"..."}]} (2 a 6 etapas); {"type":"venn","items":[{"label":"..."},{"label":"..."}],"text":"interseção"}; {"type":"calendar_grid"|"candles"|"gauge"|"battery"|"thermometer","label":"...","value":"..."} (dias enchendo um calendário, gráfico de velas da bolsa subindo + resultado, velocímetro em %, bateria carregando em %, termômetro em graus)
  - interface: {"type":"rating","value":"4.9","label":"...","text":"comentário"}; {"type":"cursor_click","label":"título da tela","text":"texto do botão"}; {"type":"like_button","value":"12.480","label":"..."}; {"type":"price_tag","from":"R$ 199","to":"R$ 99","label":"..."}
  Cena de tela cheia: "onScreen" vazio (a própria cena já tem o texto) e "imagePrompt" vazio. Para dar ritmo, a cena pode ter "transition" (entrada própria): circle_reveal, stripes, diagonal, blocks, whip_pan, zoom_in, glitch, flash, slide_up, punch_zoom.
  Ícones: nome em inglês da biblioteca Lucide (search, rocket, heart, star, clock, shield, users, brain, banknote, trending-up, lightbulb, globe, smartphone, car, trophy, gamepad-2, camera, music, check, x, zap, target...). Textos dos grafismos curtos (até 3 palavras por rótulo). Números só se forem verdadeiros e sustentáveis (do tema, da notícia ou de conhecimento geral consolidado); sem número confiável, prefira steps, checklist, icons ou versus. Cena com grafismo: o "onScreen" vira um título curto em cima (até 4 palavras) ou fica vazio, e o "imagePrompt" fica vazio (exceto rank_item). Em rank_item, "onScreen" fica vazio (o "header" já é o título fixo). Não use layout text_only junto com grafismo.`;
}

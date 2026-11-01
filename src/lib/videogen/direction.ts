// Direção de movimento por cena (corte, câmera, objeto, traço e ênfase), escolhida pela IA num
// cardápio fixo e editável no editor de cenas. O worker só entende estes valores: nada de código
// gerado por IA. Arquivo "puro" (sem imports de servidor): serve client, servidor e prompt.

export const DIRECTION_OPTIONS = {
  cut: {
    punch: "Soco com flash",
    whip_left: "Chicote pela esquerda",
    whip_right: "Chicote pela direita",
    zoom_in: "Zoom entrando",
    zoom_out: "Zoom saindo",
    spin: "Giro rápido",
    dip: "Escurece e corta",
  },
  camera: {
    push_in: "Aproxima",
    pull_out: "Afasta",
    drift_left: "Desliza à esq.",
    drift_right: "Desliza à dir.",
    rise: "Sobe",
    still: "Parada",
  },
  object: {
    pop: "Estoura com mola",
    slide_up: "Sobe de baixo",
    drop: "Cai e quica",
    swing: "Balança pendurado",
    float: "Flutua",
  },
  mark: {
    none: "Nenhum",
    circle: "Círculo",
    arrow_left: "Seta da esq.",
    arrow_right: "Seta da dir.",
    underline: "Sublinhado",
    cross: "X (negação)",
    check: "Certo (afirmação)",
    burst: "Risquinhos",
  },
  emphasis: {
    sweep: "Faixa de cor",
    slam: "Bate grande",
    stamp: "Carimbo",
  },
} as const;

export type DirectionField = keyof typeof DIRECTION_OPTIONS;
export type SceneDirection = { [K in DirectionField]: keyof (typeof DIRECTION_OPTIONS)[K] };

export const DIRECTION_FIELD_LABEL: Record<DirectionField, string> = {
  cut: "Corte de entrada",
  camera: "Câmera",
  object: "Objeto",
  mark: "Traço à mão",
  emphasis: "Palavra-chave",
};

export const DIRECTION_FIELDS = Object.keys(DIRECTION_OPTIONS) as DirectionField[];

// Todos os estilos (embutidos e templates) entendem a direção: roteiros novos sempre saem com ela.
// Roteiros antigos sem direção renderizam como antes; o editor oferece ativar.

const CUT_ROTATION: SceneDirection["cut"][] = ["punch", "whip_right", "zoom_in", "whip_left", "spin", "zoom_out"];
const OBJECT_ROTATION: SceneDirection["object"][] = ["pop", "slide_up", "float", "drop", "swing"];
const CAMERA_ROTATION: SceneDirection["camera"][] = ["push_in", "drift_left", "pull_out", "drift_right", "rise"];

/** Direção padrão da cena i (usada quando a IA não escolheu ou numa cena nova). */
export function defaultDirection(i: number): SceneDirection {
  return {
    cut: CUT_ROTATION[i % CUT_ROTATION.length],
    camera: CAMERA_ROTATION[i % CAMERA_ROTATION.length],
    object: OBJECT_ROTATION[i % OBJECT_ROTATION.length],
    mark: "none",
    emphasis: "sweep",
  };
}

/** Lê uma direção vinda da IA ou do editor; valor desconhecido vira o padrão da cena. */
export function normalizeDirection(raw: unknown, i: number): SceneDirection | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const base = defaultDirection(i);
  const out = { ...base } as Record<DirectionField, string>;
  for (const f of DIRECTION_FIELDS) {
    const v = typeof o[f] === "string" ? (o[f] as string).trim() : "";
    if (v in DIRECTION_OPTIONS[f]) out[f] = v;
  }
  return out as SceneDirection;
}

/** O que "object" e o traço significam em cada estilo (templates usam o texto padrão). */
const STYLE_NOTES: Record<string, { object: string; mark: string; image: string }> = {
  "editorial-pb-vermelho": {
    object: "como o objeto recortado entra e se mexe sobre o papel quadriculado",
    mark: "traço de caneta vermelha em volta do objeto",
    image:
      "o \"imagePrompt\" deve pedir a imagem 100% preto e branco, um único objeto recortado bem destacado do papel, sem nenhum vermelho, sem setas, círculos ou marcas de caneta",
  },
  "estudio-serif-cinematico": {
    object: "como o objeto do estúdio entra e flutua (nas cenas cinematográficas vale só a câmera)",
    mark: "traço à mão em terracota em volta do objeto (ou do texto, nas cenas cinematográficas)",
    image: "o \"imagePrompt\" segue o guia do estilo (um objeto único no estúdio cinza, ou foto cinematográfica), sem setas, círculos ou marcas de caneta",
  },
  "papel-hera": {
    object: "como o bloco de texto entra (este estilo não usa imagem por cena)",
    mark: "traço à mão em vermelho em volta do bloco de texto",
    image: "este estilo não gera imagem por cena",
  },
};
const DEFAULT_NOTE = {
  object: "como o card/foto da cena entra e se mexe, quando o estilo usa card ou círculo (em imagem de tela cheia vale a câmera)",
  mark: "traço à mão na cor de destaque do estilo, em volta do card ou do centro da imagem",
  image: "o \"imagePrompt\" segue o estilo normalmente, sem setas, círculos ou marcas de caneta",
};

/** Regra do prompt do roteiro: direção de movimento por cena, com o sentido de cada campo no estilo. */
export function directionPromptRule(patternId: string): string {
  const note = STYLE_NOTES[patternId] ?? DEFAULT_NOTE;
  const menu = DIRECTION_FIELDS.map((f) => `"${f}": ${Object.keys(DIRECTION_OPTIONS[f]).join(" | ")}`).join("; ");
  return `
- "direction" (obrigatório em cada cena): a direção de movimento da cena, escolhendo SOMENTE destes valores: ${menu}.
  cut = como a cena entra (punch: soco de zoom com flash; whip_*: chicote lateral; zoom_in/zoom_out; spin: giro; dip: escurece e corta). camera = movimento contínuo do fundo/imagem. object = ${note.object} (pop: estoura com mola; slide_up; drop: cai e quica; swing: balança pendurado; float: flutua). mark = ${note.mark}, desenhado pelo render no momento da palavra-chave da cena (circle: circula; arrow_left/arrow_right: seta vindo daquele lado; underline; cross: X = negação; check: certo = afirmação; burst: risquinhos de impacto; none). emphasis = como a palavra-chave aparece (sweep: faixa de cor varre; slam: bate grande; stamp: carimbo).
  Varie (nunca o mesmo "cut" em duas cenas seguidas), combine com o sentido da fala (negação = cross, crescimento = arrow ou rise) e use "mark" em no máximo 70% das cenas.
- Os traços (setas, círculos, sublinhados) são DESENHADOS PELO RENDER: ${note.image}.`;
}

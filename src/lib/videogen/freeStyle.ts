// "Gerar em estilo livre": não há template. A IA do roteiro entende o assunto e monta, junto com o
// roteiro, a ficha de estilo (styleSpec) do vídeo, que o motor genérico do worker
// (worker/render/template_engine.py) renderiza. normalize_spec() do worker corrige qualquer valor
// inválido, então aqui só garantimos o formato básico.
// Arquivo puro (sem imports de servidor): o seletor de estilo do client também usa FREE_STYLE.
import type { VideoPattern } from "./patterns";

export const FREE_STYLE_ID = "estilo-livre";

export const FREE_STYLE: VideoPattern = {
  id: FREE_STYLE_ID,
  numero: 0,
  nome: "Gerar em estilo livre",
  tom: "A IA entende o assunto e cria o visual do vídeo do zero: cores, fontes, imagens, transições e movimento.",
  ritmo: "",
  duracaoReferenciaS: [],
  cenaS: [1.5, 3],
  semNarracao: false,
  cta: "",
  sampleUrl: null,
  kind: "free",
};

export const MAX_STYLE_NOTES = 1500;

// Espelho de CHOICES e FONT_DESCRIPTIONS de worker/render/template_engine.py.
// Ao adicionar uma opção lá, acrescente aqui também para a IA poder escolher.
const CHOICES: Record<string, string[]> = {
  "background.kind": ["solid", "gradient", "blurred_image"],
  "image.layout": ["fullbleed", "card", "circle", "top_half"],
  "image.filter": ["none", "bw", "duotone", "warm", "cool", "contrast", "muted"],
  "image.motion": ["push_in", "pull_out", "pan", "ken_burns", "zoom_punch", "drift", "static"],
  "caption.animation": ["word_pop", "word_reveal", "karaoke", "line_fade", "typewriter"],
  "caption.highlight": ["box", "color", "underline", "none"],
  "title.animation": ["slide_up", "fade", "pop", "typewriter", "kinetic", "blur_in"],
  "transition.kind": ["cut", "punch_zoom", "crossfade", "slide_left", "slide_up", "blur_zoom", "flash", "whip_pan", "zoom_in", "glitch"],
  "motion.energy": ["calm", "medium", "high"],
  "motion.camera": ["none", "handheld", "shake_on_beat"],
  "motion.particles": ["none", "dust", "bokeh", "sparks"],
  "motion.textIdle": ["none", "float", "pulse"],
  "cta.style": ["card", "fullscreen", "banner"],
};

const FONTS: Record<string, string> = {
  "inter-black": "sans-serif geométrica pesadíssima (estilo Helvetica Black)",
  "inter-bold": "sans-serif neutra em negrito",
  "inter-medium": "sans-serif neutra, peso médio (limpo, corporativo)",
  "montserrat-black": "sans-serif geométrica larga e pesada",
  "bebas-neue": "condensada alta, só maiúsculas (pôster)",
  "playfair-italic": "serifada itálica elegante e fina (editorial, premium)",
  "playfair-black-italic": "serifada itálica pesada (manchete de revista)",
  "eb-garamond-italic": "serifada clássica itálica (literária)",
  "serif-bold-italic": "serifada tipo Times em negrito itálico",
  "great-vibes": "manuscrita cursiva (caligráfica)",
  "allura": "manuscrita cursiva leve",
};

/** Guia que entra no prompt do roteiro no lugar do guia de um padrão. */
export function freeStyleGuide(styleNotes: string | null | undefined): string {
  const choices = Object.entries(CHOICES)
    .map(([k, v]) => `- ${k}: ${v.join(" | ")}`)
    .join("\n");
  const fonts = Object.entries(FONTS)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const notes = styleNotes?.trim();
  return `ESTILO LIVRE: não existe padrão pronto. Você é também o diretor de arte: entenda o assunto e o público e invente o visual que melhor conta ESTA história (um vídeo sobre games pode ser neon e frenético; um sobre finanças, sóbrio e elegante; um sobre natureza, calmo e quente). Fuja do óbvio e do genérico, mas mantenha legibilidade e coerência do começo ao fim.
${notes ? `
DIRECIONAMENTO DO USUÁRIO PARA O ESTILO (siga com prioridade sobre as suas escolhas; vale para movimento, música, clima, cores, ritmo e o que mais ele pedir):
${notes}
` : ""}
Você entrega, além do roteiro, o campo "styleSpec": a ficha que o motor de render usa. Como o motor funciona: cada cena mostra a imagem da cena (no layout escolhido) sobre um fundo, um texto curto na tela (title, vem do "onScreen"), a legenda da narração sincronizada palavra por palavra (caption) e, no fim, um card de CTA. Não há vídeo filmado, 3D nem logos.

Opções válidas dos campos com lista:
${choices}

Fontes (use as chaves):
${fonts}

Formato do "styleSpec" (cores sempre "#RRGGBB"; números dentro das faixas):
{
  "palette": {"background": cor de fundo, "text": cor do texto principal, "accent": cor de destaque, "accentText": cor do texto sobre o destaque},
  "background": {"kind": ..., "color2": segunda cor do gradiente},
  "image": {"layout": ..., "filter": ..., "motion": ..., "scale": 0.4-1 (largura do card/círculo), "y": 0.04-0.96 (centro vertical), "cornerRadius": 0-200, "shadow": true/false, "borderColor": cor ou "", "borderWidth": 0-30},
  "caption": {"enabled": true/false, "font": ..., "size": 40-200 (px num quadro 1080x1920), "uppercase": true/false, "color": ..., "stroke": cor do contorno ou "", "strokeWidth": 0-14, "y": 0.04-0.96, "animation": ..., "highlight": ..., "maxWordsPerLine": 1-6, "box": true/false, "boxColor": ...},
  "title": {"enabled": true/false, "font": ..., "size": 40-200, "uppercase": true/false, "color": ..., "stroke": cor ou "", "strokeWidth": 0-14, "y": 0.04-0.96, "animation": ..., "box": true/false, "boxColor": ...},
  "transition": {"kind": ..., "durationS": 0.05-0.9},
  "overlay": {"grain": 0-1, "vignette": 0-1, "tint": cor ou "", "tintStrength": 0-0.6, "letterbox": true/false},
  "cta": {"style": ..., "background": ..., "color": ..., "font": ...},
  "motion": {"energy": calm | medium | high, "camera": none | handheld | shake_on_beat, "particles": none | dust | bokeh | sparks, "beatPulse": true/false (zoom rápido a cada corte e palavra-chave), "textIdle": none | float | pulse, "textExit": true/false (texto sai antes do corte)}
}

Regras do visual:
- Texto sobre foto precisa ser legível: contorno, caixa de fundo ou posição fora da imagem. Title e caption não podem ficar na mesma altura (y).
- Movimento é o que diferencia um Reels de um slideshow: na dúvida, prefira mais movimento. Só use "static", energy "calm" e camera "none" se o assunto pedir algo contemplativo (ou se o usuário pedir).
- Os "imagePrompt" de todas as cenas seguem o MESMO estilo visual que você inventou (mesma luz, paleta, tipo de imagem: foto, ilustração, colagem, 3D render, etc.), combinando com as cores do styleSpec. Nunca peça texto, letras, números ou logos dentro da imagem.
- O "musicPrompt" combina com o clima escolhido (e com o direcionamento do usuário, se houver).`;
}

/** Ficha usada quando a IA não devolveu styleSpec (o worker completa o resto com os padrões dele). */
export const FREE_STYLE_FALLBACK_SPEC: Record<string, unknown> = {
  palette: { background: "#111111", text: "#FFFFFF", accent: "#FFD02A", accentText: "#111111" },
  background: { kind: "blurred_image" },
  image: { layout: "card", motion: "ken_burns", scale: 0.86, y: 0.42 },
  motion: { energy: "medium", camera: "handheld", particles: "dust" },
};

/** Garante só o formato básico (objeto de grupos); os valores o worker corrige. */
export function sanitizeStyleSpec(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const group of ["palette", "background", "image", "caption", "title", "transition", "overlay", "cta", "motion"]) {
    const g = (raw as Record<string, unknown>)[group];
    if (g && typeof g === "object" && !Array.isArray(g)) out[group] = g;
  }
  return Object.keys(out).length ? out : undefined;
}

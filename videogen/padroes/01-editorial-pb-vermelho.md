---
id: editorial-pb-vermelho
numero: 1
nome: "Editorial P&B + Vermelho"
apelidos: [padrao-1, colagem-grid, editorial]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: [15, 30]}
referencia: referencias/padrao-01-referencia.mp4
implementado_em:
  - /mnt/project-files/videos/teste-engenharia-reversa/
  - /mnt/project-files/videos/geo-vs-seo-30s/
paleta: {fundo: "#F2F0EA (papel quadriculado)", texto: "#111111", destaque: "#E10600", cta_alt: "verde"}
fontes: {principal: "Inter Display Black", secundaria: "serif itálica (Liberation Serif Italic)"}
cena_s: [1.0, 2.0]
transicao: "punch zoom + blur no corte, nunca corte seco"
legenda: "palavra por palavra, pop/escala; palavra-chave em caixa vermelha ou serif itálico vermelho"
musica: "drone grave/eletrônico tenso, sem melodia marcada, com whooshes nos cortes"
cta: "comenta <PALAVRA> (estilo DM-keyword) ou URL"
---

# Padrão 1: Editorial P&B + Vermelho

**Quando usar:** temas polêmicos, alertas, "o que ninguém te conta", tecnologia/IA. Passa urgência e tom de reportagem/colagem.

## Visual
- Fundo de papel quadriculado off-white, em monocromático de alto contraste com grão de filme.
- Cada cena tem um único objeto recortado em P&B (borda branca de adesivo e sombra suave), centralizado no terço do meio.
- Vermelho (#E10600) é a única cor, usada com moderação: setas e círculos de marcador, um detalhe do objeto.
- Efeitos: aberração cromática (vermelho/ciano), vinheta, push-in lento contínuo, recortes de pessoas e cenas de papéis em quadro de cortiça.

## Texto / legendas
- Tipografia cinética palavra por palavra, sincronizada com o timestamp da narração do ElevenLabs.
- Mistura uma sans black grande com uma serif itálica. Palavras-chave vão em caixa vermelha ou em serif itálico vermelho.
- O texto fica na faixa central e inferior, sem cobrir o objeto.

## Ritmo e transições
- Uma cena a cada 1 a 2 segundos.
- O corte é sempre um punch zoom com motion blur, nunca um corte seco.
- Há um push-in contínuo dentro de cada cena.

## Áudio
- Narração com a voz clonada, em ritmo rápido (TTS `speed` 1.1, cerca de 3 palavras por segundo).
- Trilha tensa e escura, com ducking de 14 dB sob a voz e loudnorm em -14 LUFS.
- Whooshes sintéticos em cada corte.

## CTA
- Card final do tipo "comenta **PALAVRA**" ou URL (ex.: oxyn.com.br), com destaque em vermelho ou verde.

## Dicas de geração (pipeline)
- **Prompt de imagem (STYLE):**
  > Editorial collage style: a single black-and-white photographic cutout object with a thin white sticker border and soft drop shadow, placed centered on off-white grid/graph paper background. High contrast monochrome, film grain. Only accent color is a vivid red (#E10600) used sparingly as {accent}. Hand-drawn red marker arrows or circle. No text, no letters, no words. Vertical 9:16 composition, object in the middle third, empty space at top and bottom.
- Cada cena é descrita como `(objeto, acento vermelho)`. Ver `videos/geo-vs-seo-30s/img.py`.
- **Modelo:** nano banana 2.1 via OpenRouter, com `aspect_ratio` 9:16.
- **Render:** `render.py` (PIL + numpy → ffmpeg), crf 23 a 27.
- **Prompt de música (ElevenLabs /v1/music):** "dark minimal electronic pulse, tense documentary underscore, low drone, subtle ticking, no vocals".

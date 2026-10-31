---
id: antes-depois-apresentador
numero: 12
nome: "Antes e Depois com Apresentador"
apelidos: [padrao-12, portfolio-de-edicao, podcast]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 19}
referencia: https://br.pinterest.com/pin/981010731370656682/
frames: referencias/padrao-12-frames.jpg
implementado_em: [exemplos/5s/p12/]
paleta: {fundo: "#8C8C8C", vermelho: "#FF0000", neon: "#EEFF00", card: "#FFFFFF", verde: "#1E9E6A"}
fontes: "Serif clássica na legenda e chamada; sans bold com brilho neon nas palavras-chave"
cena_s: [2.0, 3.0]
transicao: "Cortes secos entre fala e b-roll; o quadro do apresentador vira um cartão branco com colagem P&B"
legenda: "Serif branca, curta, sobre o peito do apresentador; palavra-chave grande com brilho neon"
musica: "A trilha fica sob a fala real; beat discreto"
cta: "Texto fixo: 'vamos trabalhar no seu reel' + 'me chama na DM'"
---

# Padrão 12: Antes e Depois com Apresentador

**Quando usar:** Usar gravação real, de podcast ou fala para a câmera, com edição profissional. É o único padrão com rosto real. Também serve para vender serviço de edição, mostrando o antes e o depois.

**Requer gravação real do Rodrigo.** A narração clonada não substitui o rosto em cena; sem gravação, este padrão não se aplica. O restante (legendas, b-roll e colagens) o pipeline faz.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/981010731370656682/), cerca de 19s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-12-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Fundo estático: parede cinza desfocada com sombras de janela.
- Duas colunas em cartões de cantos arredondados: "before" pequeno e "after" grande, com etiquetas vermelhas no topo.
- O cartão "after" alterna o apresentador com b-roll: colagem P&B em fundo branco com brilhos, TV antiga, gráfico verde em fundo escuro.
- Sem o formato de comparação, o layout vira apresentador + b-roll em cartão único.

## Texto / legendas
- Legenda curta palavra a palavra, em serif, posicionada no peito do apresentador.
- Destaques com sans bold amarela e glow neon ("**trading**").

## Ritmo e transições
- O conteúdo muda bastante só no cartão "after", enquanto o resto da tela fica fixo.
- B-roll em colagem P&B a cada ideia importante, sempre em sincronia com a fala.
- Transição: Cortes secos entre fala e b-roll; o quadro do apresentador vira um cartão branco com colagem P&B.

## Áudio
- A trilha fica sob a fala real; beat discreto. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Gancho na fala** (0–3s).
2. **Fala com b-roll** (3–16s).
3. **Fecho** (16–19s), com CTA fixo.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Black and white cut-out collage of {assunto}, halftone texture, isolated on white with thin grid and small sparkles, editorial style, no text, vertical 9:16.
  > Vintage CRT television on wooden legs showing a black and white image, isolated on white background, soft shadow, no text.
- **Montagem:** O pipeline precisaria de um passo novo: receber o vídeo gravado, transcrever para obter tempos das palavras e sugerir pontos de b-roll.
- **Prompt de música (ElevenLabs /v1/music):** "subtle modern hip-hop beat, low energy, unobtrusive under speech, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

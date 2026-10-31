---
id: tela-filmada
numero: 14
nome: "Tela Filmada na Mesa"
apelidos: [padrao-14, monitor-real, faca-comigo]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 28}
referencia: https://br.pinterest.com/pin/818388563572086037/
frames: referencias/padrao-14-frames.jpg
implementado_em: []
paleta: {tela: "#F1F1F4", legenda_fundo: "#161616", legenda_texto: "#FFFFFF", luz: "#39B6E8"}
fontes: "Sans bold (Inter SemiBold) em etiquetas pretas"
cena_s: [2.0, 3.0]
transicao: "A câmera empurra para dentro da tela; o zoom do programa continua o movimento da câmera; escurece para o apresentador no fim"
legenda: "Etiqueta preta retangular no topo com a instrução do passo, sempre no imperativo"
musica: "Lo-fi tech tranquilo, com sons reais de clique e teclado"
cta: "Apresentador em imagem escurecida apontando para o @ do perfil, com o ícone do Instagram no centro"
---

# Padrão 14: Tela Filmada na Mesa

**Quando usar:** Passo a passo em que o trabalho real aparece, sem parecer gravação de tela. Tom próximo e autêntico, como olhar por cima do ombro de quem faz.

**Pede filmagem real da tela e da mesa.** Dá para simular com foto gerada de uma mesa e com a captura aplicada em perspectiva, mas perde parte da naturalidade, que é justamente o forte do padrão.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/818388563572086037/), cerca de 28s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-14-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Monitor real filmado em ângulo, com mesa clara, planta no canto e luz azul de LED atrás da tela.
- A câmera se mexe levemente, com aparência de mão, e vai para muito perto da tela até o conteúdo ocupar todo o quadro.
- O que aparece é trabalho sendo feito de verdade: letra sendo editada, embalagem montada, modelo girando em 3D.

## Texto / legendas
- Um único estilo de legenda: etiqueta preta com texto branco, no topo.
- Frases de instrução: "Selecione um modelo", "Salve o vídeo para depois".

## Ritmo e transições
- Tempo acelerado no trabalho longo, com pausa nos momentos de resultado.
- O zoom da câmera disfarça os cortes entre um passo e outro.
- Transição: A câmera empurra para dentro da tela; o zoom do programa continua o movimento da câmera; escurece para o apresentador no fim.

## Áudio
- Lo-fi tech tranquilo, com sons reais de clique e teclado. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Resultado ou começo** (0–3s).
2. **Passos** (3–22s): uma instrução por etiqueta.
3. **Resultado final** (22–24s).
4. **Seguir** (24–28s), com o apresentador apontando.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Photo of a white desk with a large monitor seen at an angle, blue LED glow behind the monitor, small plant on the side, soft daylight, blank light screen, shallow depth of field, vertical 9:16.
- **Montagem:** Simulação: gerar a mesa uma vez, aplicar a captura de tela com transformação de perspectiva e animar um leve tremor de câmera. A etiqueta é desenhada por código.
- **Prompt de música (ElevenLabs /v1/music):** "calm lo-fi tech beat, soft keys, relaxed and focused, subtle, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

---
id: tipografia-rosto-3d
numero: 3
nome: "Tipografia Gigante + Rosto 3D"
apelidos: [padrao-3, rosto-vinho, manifesto]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 18}
referencia: https://br.pinterest.com/pin/1130755419048014626/
frames: referencias/padrao-03-frames.jpg
implementado_em: [exemplos/5s/p03/]
paleta: {fundo: "#8E8E8E", vinho: "#5C1F33", sombra: "#141414", x_vermelho: "#D9272E", card_final: "#000000"}
fontes: "Sans ultra-condensada em caixa alta + Didone serifada (Playfair Display / Abril Fatface)"
cena_s: [1.5, 3.0]
transicao: "Rosto se desfaz em partículas e cubos; câmera entra num close extremo do rosto; respingos de vidro ao trocar de objeto"
legenda: "Blocos de frase com pesos mistos; palavra gigante atrás do objeto, que se sobrepõe às letras"
musica: "Cinematográfica sombria, pads graves e impactos espaçados, sem bateria"
cta: "Card preto com logo branco, 'Vamos conversar hoje', telefone e site em linhas que entram uma a uma"
---

# Padrão 3: Tipografia Gigante + Rosto 3D

**Quando usar:** Manifesto de marca e posicionamento: frases curtas de impacto ("pessoas compram de rostos"). Tom dramático e sofisticado.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/1130755419048014626/), cerca de 18s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-03-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Fundo cinza com gradiente radial e faixas curvas claras, como metal escovado.
- Elemento central escultural num único tom vinho: máscara facial se desintegrando em cubos, busto de terno com um X vermelho riscado, rosto de perfil craquelado em pixels, peça de xadrez.
- A palavra-chave enche a tela e fica **atrás** do objeto (PEOPLE / DON'T / BUY), criando profundidade.
- Bloco opcional de prova: três miniaturas de vídeo dentro de um cartão vinho de cantos arredondados.

## Texto / legendas
- Duas famílias: condensada alta para o impacto e Didone para frases elegantes.
- Pesos mistos na mesma frase: "from" pequeno e "**Faces**" grande.
- Quase tudo em vinho sobre cinza. Só o X recebe vermelho vivo.

## Ritmo e transições
- O vídeo tem poucas cenas, com um movimento lento e contínuo em cada uma.
- A troca acontece por desintegração ou por um mergulho no rosto, quase nunca por corte seco.
- Transição: Rosto se desfaz em partículas e cubos; câmera entra num close extremo do rosto; respingos de vidro ao trocar de objeto.

## Áudio
- Cinematográfica sombria, pads graves e impactos espaçados, sem bateria. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Afirmação gigante** (0–2s): "Pessoas não compram de estranhos".
2. **Contraste** (2–5s): "de rostos que reconhecem".
3. **Promessa** (5–9s): "transformamos marcas em identidades reconhecíveis".
4. **Como** (9–13s): "com estratégia, com conteúdo", com peça de xadrez e miniaturas.
5. **Card de contato** (13–18s).

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Monochrome burgundy sculpture of {objeto}, matte ceramic surface breaking into small cubic fragments on one side, dramatic side light, plain mid gray background, no text, vertical 9:16.
  > Extreme close-up profile of a human face made of cracked burgundy pixel blocks, deep shadows, gray background, cinematic, no text, vertical 9:16.
- **Montagem:** Gerar o objeto sobre cinza liso, recortar e compor por cima da palavra gigante. A desintegração pode ser simulada com máscara de partículas no render.
- **Prompt de música (ElevenLabs /v1/music):** "dark cinematic ambient, deep pads, sparse sub-bass hits, tense and elegant, slow, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

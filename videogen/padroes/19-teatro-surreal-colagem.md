---
id: teatro-surreal-colagem
numero: 19
nome: "Teatro Surreal em Colagem"
apelidos: [padrao-19, cartas-de-tarot, mundo-de-papel]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 29}
referencia: https://br.pinterest.com/pin/1086986060092099876/
frames: referencias/padrao-19-frames.jpg
implementado_em: []
paleta: {vermelho: "#8E1C21", losango: "#1A1A1A", creme: "#EFE6CF", dourado: "#C9962E", azul: "#1F4E8C"}
fontes: "Condensada bold e branca em poucas palavras; quase todo o texto mora nas cartas e jornais"
cena_s: [2.0, 3.0]
transicao: "A câmera mergulha num objeto, como carta ou moldura, e sai dele em outro mundo; camadas de papel com profundidade"
legenda: "Sem legenda contínua: frases curtas no cenário, em jornais, cartas e letreiros"
musica: "Valsa de circo sombria, com caixinha de música"
cta: "Cena com o material de trabalho sobre a mesa e nome da marca em fundo liso e chapado"
---

# Padrão 19: Teatro Surreal em Colagem

**Quando usar:** Peça autoral e memorável: analogias, histórias e campanhas em que a marca quer impressionar pela criatividade. Tom teatral, lúdico e misterioso.

**Não usar personagens protegidos.** A referência usa personagens de filmes conhecidos. Nos nossos vídeos, troque por personagens próprios, como a carta "O Estrategista" ou "A Marca".

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/1086986060092099876/), cerca de 29s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-19-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Cada cena é um pequeno palco em camadas de papel: cortinas vermelhas, piso em losangos, nuvens recortadas, sol de xilogravura, mar em ondas de papel.
- Objeto simbólico como fio condutor: cartas de baralho e de tarô que vão trocando de personagem e de título (MONEY, POWER).
- Molduras douradas, relógio de bolso, correntes, jornais antigos e uma pintura em textura de pinceladas.
- Muita profundidade: várias camadas se movem em velocidades diferentes (parallax).

## Texto / legendas
- Quase toda a informação é narrada ou escrita dentro dos objetos.
- Quando há título, ele é gigante e o personagem se coloca entre as letras.

## Ritmo e transições
- Plano contínuo aparente: um mundo leva ao outro pelo mergulho da câmera.
- Movimento de câmera em 2,5D, com camadas se separando.
- Transição: A câmera mergulha num objeto, como carta ou moldura, e sai dele em outro mundo; camadas de papel com profundidade.

## Áudio
- Valsa de circo sombria, com caixinha de música. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Carta** (0–4s): apresenta o personagem.
2. **Palcos** (4–18s): cada um é uma etapa da história.
3. **Confronto** (18–23s).
4. **Título** (23–25s).
5. **Assinatura** (25–29s).

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Vintage paper theater stage, red velvet curtains, black and red diamond checkered floor, layered paper cutouts, {símbolo} in the center, surreal storybook illustration, no text, vertical 9:16.
  > Vintage tarot card illustration of {personagem próprio}, woodcut style, aged paper, ornate border, blank title area, isolated on white, no text.
- **Montagem:** Gerar cada elemento em camadas separadas (fundo, meio e frente) e animar o parallax por código. O mergulho é um zoom forte com máscara na forma do objeto. É um padrão trabalhoso, para peças especiais.
- **Prompt de música (ElevenLabs /v1/music):** "dark circus waltz, music box, pizzicato strings, mysterious and playful, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

---
id: silhueta-roxo-pop
numero: 10
nome: "Silhueta + Roxo Pop"
apelidos: [padrao-10, homem-de-terno, colagem-pop]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 36}
referencia: https://br.pinterest.com/pin/1091982240919739777/
frames: referencias/padrao-10-frames.jpg
implementado_em: [exemplos/5s/p10/]
paleta: {fundo: "#F7F7FB", roxo: "#7C3AED", preto: "#0B0B0B", destaque: "#E8173B", ciano: "#1FB6C9"}
fontes: "Poppins ExtraBold, em roxo e preto com tamanhos variados"
cena_s: [1.5, 3.0]
transicao: "Formas desfocadas passam muito perto da câmera; pop com overshoot; digitação no celular"
legenda: "Palavras entram em sequência e subindo, com tamanhos diferentes e leve blur de movimento"
musica: "Pop corporativo animado, com whooshes e pops bem marcados"
cta: "'A partir de agora, valide' com check ciano animado por cima da palavra"
---

# Padrão 10: Silhueta + Roxo Pop

**Quando usar:** Dica prática de marketing com erro e solução ("você está postando o que você gosta"). Tom animado e fácil de entender. Boa para o público de pequenas empresas.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/1091982240919739777/), cerca de 36s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-10-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

**Variação amarela** (referência: [pin 875457615082806673](https://br.pinterest.com/pin/875457615082806673/)): mesma técnica em fundo amarelo #FFC420, com personagens em silhueta e fonte Montserrat bold. Rende bem para campanhas de vendas.

## Visual
- Personagem em silhueta preta de terno, sem rosto (ou cabeça de objeto: relógio, binóculos), recortado com poses que encenam a frase.
- Colagem com objetos realistas coloridos (chave dourada, relógio de metal) e gráficos 3D em tons pastel.
- Fundo branco com grade clarinha, formas pretas e roxas desfocadas entrando pelas bordas e explosões roxas de pontas nos cantos.
- Celular real com digitação para mostrar passo a passo.

## Texto / legendas
- Poppins ExtraBold em roxo, com palavras em preto para contraste.
- Número gigante com contorno em vermelho ("10 pins a day") como grande impacto visual.

## Ritmo e transições
- Muito movimento: quase todo elemento entra com overshoot e sai com zoom.
- Formas próximas da câmera fazem as vezes de wipes, escondendo as trocas.
- Transição: Formas desfocadas passam muito perto da câmera; pop com overshoot; digitação no celular.

## Áudio
- Pop corporativo animado, com whooshes e pops bem marcados. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Erro** (0–4s): personagem carregando a caixa "ERRO".
2. **Exagero** (4–7s): "10 pins por dia".
3. **Diagnóstico** (7–15s): "você posta o que gosta, não o que procuram".
4. **Solução** (15–30s): passo a passo no celular.
5. **Ordem final** (30–36s): "valide".

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Solid black flat silhouette of a man in a suit, {pose}, white shirt and black tie details, faceless, isolated on pure white background, vector-like, no text.
  > Realistic {objeto} isolated on pure white background, soft shadow, high detail, no text.
- **Montagem:** Personagens e objetos são gerados em branco e recortados. Formas e explosões são desenhadas por código com blur. Vale criar um banco de poses reutilizáveis: pensativo, apontando, carregando, digitando, com binóculos.
- **Prompt de música (ElevenLabs /v1/music):** "upbeat corporate pop, bright plucks, claps, energetic and friendly, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

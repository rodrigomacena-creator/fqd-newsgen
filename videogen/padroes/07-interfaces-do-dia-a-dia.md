---
id: interfaces-do-dia-a-dia
numero: 7
nome: "Interfaces do Dia a Dia"
apelidos: [padrao-7, historia-em-apps, analogico-digital]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 37}
referencia: https://br.pinterest.com/pin/1086986060077699561/
frames: referencias/padrao-07-frames.jpg
implementado_em: [exemplos/5s/p07/]
paleta: {fundo: "#000000", ios: "#F2F2F7", azul: "#0A84FF", verde: "#30D158", filme: "#D9A441"}
fontes: "SF Pro / Inter, a fonte da própria interface; manuscrita sobre o Notes"
cena_s: [2.0, 3.0]
transicao: "A interface muda de formato: máscara cresce de faixa para tela cheia; digitação vira resultado; zoom para dentro de um elemento"
legenda: "O texto faz parte das telas: bolha de mensagem, busca sendo digitada, ranking, anotação"
musica: "Lo-fi com textura de vinil, batida suave, nostálgica"
cta: "Busca sendo digitada que retorna o site da marca como primeiro resultado"
---

# Padrão 7: Interfaces do Dia a Dia

**Quando usar:** Storytelling de marca com um argumento sobre comportamento ("confiança vence oferta"). Tom autoral e criativo. Prende pela variedade.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/1086986060077699561/), cerca de 37s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-07-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Cada frase é contada por uma interface diferente: Notes, câmera do iPhone, ranking de app, nó de fluxograma, iMessage, editor de texto, Google.
- Mistura de digital limpo com analógico: fotos de mesa vistas de cima (contrato, cartões, iPod, lápis), com vazamento de luz, grão e bordas de filme.
- Interfaces em faixa horizontal central sobre preto, alternando com tela cheia.
- Objeto 3D pequeno dentro da frase, como um globo girando entre as palavras.

## Texto / legendas
- O texto é conteúdo da interface: quase não há legenda tradicional.
- Digitação com cursor piscando, e bolhas de mensagem que aparecem no tempo da fala.
- Frase quebrada por telas: "who feel good about you" é a resposta azul no iMessage.

## Ritmo e transições
- A troca constante de contexto é o que prende. Cada interface dura o tempo de uma frase.
- O formato do quadro muda junto, de faixa para tela cheia, em vez de um corte seco.
- Transição: A interface muda de formato: máscara cresce de faixa para tela cheia; digitação vira resultado; zoom para dentro de um elemento.

## Áudio
- Lo-fi com textura de vinil, batida suave, nostálgica. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Autoridade** (0–5s): "Harvard previu isso", numa nota.
2. **Cenário** (5–10s): "no mundo de hoje…".
3. **Tese** (10–22s): "quem ganha é quem as pessoas gostam", em ranking e mensagens.
4. **Erro** (22–29s): "se você foca só em fechar…".
5. **Virada e CTA** (29–37s): busca que encontra a marca.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Top-down flat lay photo on a teal grid cutting mat, {objetos}, vintage film look, light leaks, slight grain, no readable text, vertical 9:16.
  > Close-up of a paper contract on a wooden desk with credit cards, warm hard sunlight, film grain, shallow depth of field, vertical 9:16.
- **Montagem:** As interfaces são recriadas por código (HTML/Remotion), o que evita texto distorcido pelo modelo de imagem. Só as fotos analógicas são geradas. É o padrão que dá mais trabalho, então vale um conjunto de componentes reutilizáveis: notes, imessage, busca, ranking.
- **Prompt de música (ElevenLabs /v1/music):** "nostalgic lo-fi with vinyl crackle, warm electric piano, soft boom bap, thoughtful, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

---
id: hud-tutorial-escuro
numero: 8
nome: "HUD Técnico Escuro"
apelidos: [padrao-8, tutorial-em-serie, moldura-fixa]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 34}
referencia: https://br.pinterest.com/pin/889812838901709404/
frames: referencias/padrao-08-frames.jpg
implementado_em: [exemplos/5s/p08/]
paleta: {fundo: "#000000", texto: "#FFFFFF", cinza: "#8A8A8A", card_final: "#FAF9F7"}
fontes: "Grotesca neutra (Neue Haas / Inter Tight) e logo como única fonte expressiva"
cena_s: [2.5, 4.0]
transicao: "A moldura fica parada; só o conteúdo central muda. Inversão para fundo claro no card final"
legenda: "Sem legenda falada: rótulos de interface, cursor grande clicando e campo digitando o nome do efeito"
musica: "Eletrônica minimalista com cliques de interface sincronizados"
cta: "Card claro com 'Comente PROJETO' para receber o arquivo por DM"
---

# Padrão 8: HUD Técnico Escuro

**Quando usar:** Série numerada de dicas técnicas ("11/30"). Boa para "como fazer" com ferramentas de IA e para criar hábito no perfil.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/889812838901709404/), cerca de 34s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-08-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Moldura fixa o vídeo todo: título no canto superior esquerdo, contador grande "11/30" à direita, nome da série e um ponto branco embaixo.
- Preview central em retângulo de cantos arredondados, com timecode real correndo no canto.
- Parâmetros do programa recriados de forma limpa: efeito, sliders, keyframes em losango numa régua.
- Abertura com o resultado e linhas de construção; fundo com leve ruído.

## Texto / legendas
- Texto pequeno e bem alinhado, como um painel técnico.
- Campo de busca digitando o nome do efeito, com o cursor grande indo até o controle.
- Quase nada de frase, e o único brilho de cor aparece no resultado.

## Ritmo e transições
- Sensação de sistema: nada se move além do passo atual.
- O resultado aparece em tela cheia no preview, como recompensa perto do fim.
- Transição: A moldura fica parada; só o conteúdo central muda. Inversão para fundo claro no card final.

## Áudio
- Eletrônica minimalista com cliques de interface sincronizados. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Resultado** (0–3s).
2. **Passos** (3–24s): um efeito ou parâmetro de cada vez.
3. **Resultado final** (24–26s).
4. **Isca** (26–34s): "comente PALAVRA e enviamos o arquivo".

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Quase não usa imagem gerada: tudo é interface desenhada por código. O preview pode trazer um resultado real ou uma imagem do nano banana.
- **Montagem:** Um único modelo no Remotion com parâmetros (título, número, lista de passos). Depois de pronto, a produção de cada episódio fica muito barata. Para o Rodrigo, serve para uma série como "30 dicas de GEO".
- **Prompt de música (ElevenLabs /v1/music):** "minimal dark electronic, subtle glitch clicks, soft low pulse, precise and technical, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

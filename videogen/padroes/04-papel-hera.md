---
id: papel-hera
numero: 4
nome: "Papel, Luz e Hera"
apelidos: [padrao-4, papel-creme, organico]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 22}
referencia: https://br.pinterest.com/pin/924363892285505373/
frames: referencias/padrao-04-frames.jpg
implementado_em: [exemplos/5s/p04/]
paleta: {fundo: "#EADFD3", tinta: "#1D1D1B", script: "#E8434F", folhas: "#3E8E41"}
fontes: "Sans condensada bold (Bebas Neue / Oswald) + script manuscrita fina"
cena_s: [2.0, 3.0]
transicao: "O fundo nunca muda: texto sai com blur enquanto heras e arcos entram e saem pelos cantos"
legenda: "Blocos curtos centralizados com reveal por letra e blur; palavra final em script vermelha sobreposta"
musica: "Acústica leve, violão ou piano com percussão suave, sensação de manhã"
cta: "Logo da marca centralizado com o nome, sobre o mesmo papel"
---

# Padrão 4: Papel, Luz e Hera

**Quando usar:** Conteúdo leve e reflexivo sobre marca e diferenciação. Fica bem para marcas humanas, consultoria e bem-estar. Tom calmo, sem nenhum apelo agressivo.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/924363892285505373/), cerca de 22s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-04-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Fundo único: papel creme levemente amassado, com sombra de janela projetada na diagonal e luz quente.
- Ramos de hera com sombra realista entram pelos cantos, sempre em cantos alternados.
- Arcos concêntricos pretos de linha fina giram lentamente nos cantos como elemento gráfico.
- Pictograma preto simples (vendedor numa banca) para ilustrar um exemplo. O resto do vídeo é só tipografia.

## Texto / legendas
- Condensada preta em caixa alta, com um bloco por frase no centro da tela.
- Fecho de frase em script vermelha fina, sobreposta à linha de cima: "ONE *says*", "THEY STAND OUT IN ONE WAY THAT *matters*".
- As letras aparecem da esquerda para a direita com blur, e saem com blur.

## Ritmo e transições
- Sem cortes: a sensação é de plano único, com só os elementos dos cantos se movendo.
- Cada frase fica cerca de 2 segundos na tela, com pausa curta de respiro.
- Transição: O fundo nunca muda: texto sai com blur enquanto heras e arcos entram e saem pelos cantos.

## Áudio
- Acústica leve, violão ou piano com percussão suave, sensação de manhã. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Situação** (0–4s): "dois negócios vendem a mesma coisa, pelo mesmo preço".
2. **Virada** (4–9s): "um diz: fazemos tudo; o outro: fazemos isto".
3. **Conceito** (9–13s): "as pessoas lembram do segundo; isso é diferenciação".
4. **Lição** (13–20s): "marcas fortes vencem de um jeito que importa".
5. **Logo** (20–22s).

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Top-down photo of slightly crumpled cream paper, soft warm window light casting diagonal window-frame shadows, empty, no text, vertical 9:16.
  > Single trailing green ivy branch with heart-shaped leaves, isolated on pure white background, realistic soft shadow, no text.
- **Montagem:** O fundo e a hera são gerados uma vez e reaproveitados em todos os vídeos. Os arcos são desenhados por código, assim como o movimento dos ramos (deslocamento e leve rotação).
- **Prompt de música (ElevenLabs /v1/music):** "light acoustic guitar and soft piano, gentle shaker, warm morning feeling, calm and hopeful, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

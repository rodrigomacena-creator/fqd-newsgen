---
id: documentario-dupla-exposicao
numero: 18
nome: "Documentário em Dupla Exposição"
apelidos: [padrao-18, cabeca-falante-cinema, entrevista]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 50}
referencia: https://br.pinterest.com/pin/292593307067205843/
frames: referencias/padrao-18-frames.jpg
implementado_em: []
paleta: {terracota: "#A85B40", verde: "#2F4A2C", preto: "#0A0A0A", branco: "#FFFFFF", amarelo: "#FFD400"}
fontes: "Sans simples para legenda pequena; bold grande no gancho e no CTA"
cena_s: [4.0, 6.0]
transicao: "Dupla exposição: a próxima cena surge sobre o apresentador em transparência; zoom digital entre planos"
legenda: "Uma linha pequena na altura do peito, sem animação chamativa; gancho e CTA grandes ao lado do rosto"
musica: "Piano e cordas discretos, sob a fala"
cta: "Palavra-gatilho grande em amarelo, com ícone de comentário, sobre o apresentador em close"
---

# Padrão 18: Documentário em Dupla Exposição

**Quando usar:** Fala de autoridade com aparência de documentário, para opinião e carreira. Tom pessoal, sério e cuidado. Valoriza quem aparece.

**Pede gravação real do Rodrigo em bom cenário.** Sem isso, o padrão não se aplica. Só o b-roll e a montagem podem ser gerados.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/292593307067205843/), cerca de 50s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-18-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Apresentador sentado num cenário cinematográfico: parede terracota com arco, plantas e luz quente, com vinheta preta na parte de baixo.
- Planos variam entre aberto, médio e close, com zoom digital para evitar monotonia.
- B-roll em preto e branco de pessoas no trabalho, entrando em dupla exposição sobre a imagem do apresentador.
- Ilustração simbólica ocasional: silhueta sem rosto sob uma lupa, sobre papel, com um título gigante.

## Texto / legendas
- Legenda bem menor do que o comum em Reels, o que passa uma sensação de cinema.
- Apenas gancho e CTA recebem tamanho grande.

## Ritmo e transições
- Mais pausado, guiado pela fala.
- As transições em transparência duram cerca de 1 segundo, sem whoosh.
- Transição: Dupla exposição: a próxima cena surge sobre o apresentador em transparência; zoom digital entre planos.

## Áudio
- Piano e cordas discretos, sob a fala. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Pergunta** (0–5s), com texto ao lado do rosto.
2. **Argumento** (5–30s), com b-roll.
3. **Virada** (30–40s).
4. **Oferta** (40–50s): "comente PALAVRA".

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Black and white documentary photo of {cena de trabalho}, natural window light, film grain, candid, no text, vertical 9:16.
  > Faceless dark silhouette of a person in a suit under a magnifying glass, on textured paper with a large blank area for a title, editorial illustration, no text, vertical 9:16.
- **Montagem:** O pipeline precisa receber o vídeo gravado, transcrevê-lo e aplicar b-roll em dupla exposição (mistura com opacidade animada). A narração clonada não se aplica, pois a voz é a da gravação.
- **Prompt de música (ElevenLabs /v1/music):** "restrained piano with soft strings, reflective, unobtrusive under speech, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

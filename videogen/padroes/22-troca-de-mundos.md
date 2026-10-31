---
id: troca-de-mundos
numero: 22
nome: "Troca de Mundos a Cada Frase"
apelidos: [padrao-22, um-cenario-por-frase, mix-de-materiais]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 27}
referencia: https://br.pinterest.com/pin/1086986060077186703/
frames: referencias/padrao-22-frames.jpg
implementado_em: []
paleta: {grafite: "#2E2E2E", lousa: "#1E6B45", ceu: "#2E8BE6", noite: "#0E1C2B", magenta: "#C54AD6"}
fontes: "Uma por mundo: giz na lousa, Impact em relevo, nuvem no céu, SF Pro no celular"
cena_s: [2.0, 3.0]
transicao: "Cada mundo revela o próximo por um gesto: a notificação cresce, o céu se abre, o giz apaga, o foco se ajusta"
legenda: "A frase é escrita no material do cenário: giz, nuvem, notificação, gravação na parede"
musica: "Eletrônica moderna com efeitos sonoros diferentes em cada mundo"
cta: "Fundo claro com foguete 3D e seleção de texto: 'comente LINK'"
---

# Padrão 22: Troca de Mundos a Cada Frase

**Quando usar:** Tese de marca em frases curtas, com surpresa visual constante ("as pessoas não compram o que você faz"). Tom inteligente e provocador. Costuma render alta retenção.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/1086986060077186703/), cerca de 27s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-22-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Sequência de mundos sem relação direta: planta técnica cinza com produto, tela de bloqueio de celular, notificação, tela preta com logo, céu azul com nuvens.
- Mais adiante: visor de câmera com REC, lousa verde em parede de madeira, spot de luz em parede azul-escura e mesa de trabalho com pasta.
- Um único produto 3D volta em vários mundos como fio condutor.

## Texto / legendas
- O próprio texto carrega o cenário: palavras nas nuvens, com giz, em relevo sob o spot de luz.
- As frases são curtas, sempre partidas em dois tempos.

## Ritmo e transições
- Mudança total de cor e material a cada frase, o que dá muita energia sem cortes agressivos.
- Os sons mudam junto com o material: giz, vento e clique de câmera.
- Transição: Cada mundo revela o próximo por um gesto: a notificação cresce, o céu se abre, o giz apaga, o foco se ajusta.

## Áudio
- Eletrônica moderna com efeitos sonoros diferentes em cada mundo. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Tese** (0–3s): "as pessoas não compram o seu produto".
2. **Exemplo** (3–12s): a história de uma marca, em telas.
3. **Reforço** (12–19s): lousa e parede.
4. **Oferta** (19–27s): busca, material de trabalho e CTA.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Empty green chalkboard on a dark rustic wood wall, wood frame, soft light, no text, vertical 9:16.
  > Bright blue sky with a few white fluffy clouds, soft light, lots of empty space, no text, vertical 9:16.
  > Empty dark blue wall lit by a single hanging lamp from above, moody, no text, vertical 9:16.
- **Montagem:** Os cenários são gerados vazios e o texto é aplicado por código com efeitos por material (giz por máscara animada, nuvem com deslocamento, relevo com sombra). Uma biblioteca de 8 a 10 mundos reduz muito o custo depois.
- **Prompt de música (ElevenLabs /v1/music):** "modern electronic with quirky percussive hits, dynamic and clever, changing textures, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

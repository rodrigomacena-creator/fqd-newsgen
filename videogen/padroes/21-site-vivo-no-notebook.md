---
id: site-vivo-no-notebook
numero: 21
nome: "Site Vivo no Notebook"
apelidos: [padrao-21, hero-animado, produto-em-tela]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 7}
referencia: https://br.pinterest.com/pin/1131740581423110631/
frames: referencias/padrao-21-frames.jpg
implementado_em: []
paleta: {parede: "#B9B6AE", tela: "#F2EFE9", cafe: "#6B3A1E", madeira: "#8C6A48"}
fontes: "Serif elegante no título do site simulado, sans pequena no menu"
cena_s: [7.0, 7.0]
transicao: "Sem corte: o objeto do site se transforma continuamente (cubo de gelo vira copo de café), com leve zoom da câmera"
legenda: "Sem legenda: o único texto é o layout do site na tela"
musica: "Ambient de produto, com sons do líquido escorrendo"
cta: "Nenhum na tela; o CTA fica na legenda do post"
---

# Padrão 21: Site Vivo no Notebook

**Quando usar:** Mostrar um site, landing page ou serviço de web com impacto, em loop curto de 5 a 8 segundos. Sem narração. Ideal para portfólio ou anúncio.

**O efeito principal pede modelo de vídeo**, para a transformação do objeto dentro da tela. Com imagens, dá para ter somente dissolves entre 3 ou 4 estados.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/1131740581423110631/), cerca de 7s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-21-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Notebook aberto filmado de frente, sobre um tripé pequeno, com uma sala aconchegante desfocada atrás.
- Tela exibe um site completo e fixo: menu, título grande, texto, botão.
- À esquerda do site, um único objeto muda sem parar: café caindo sobre cubo de gelo, que derrete e vira copo com a marca.
- O fio de café atravessa a borda da tela e une tudo de ponta a ponta.

## Texto / legendas
- Texto mínimo, integrado à interface.
- Nada se sobrepõe ao site, para ele parecer real.

## Ritmo e transições
- Movimento só no objeto, com um zoom suave e constante da câmera.
- O fim combina com o início, e o loop passa despercebido.
- Transição: Sem corte: o objeto do site se transforma continuamente (cubo de gelo vira copo de café), com leve zoom da câmera.

## Áudio
- Ambient de produto, com sons do líquido escorrendo. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Plano único** (0–7s): objeto transformado em produto final, em loop.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Photorealistic open laptop on a small black tripod, cozy living room softly blurred behind, warm daylight, blank light screen, centered, vertical 9:16.
  > Close product photo of {estado do objeto}, clean off-white background, high detail, no text.
- **Montagem:** Compor o site por código e aplicá-lo à tela da foto. Gerar a sequência do objeto com um modelo de vídeo. Para a Oxyn Group, o objeto pode ser uma lupa de busca que se transforma em balão de resposta da IA.
- **Prompt de música (ElevenLabs /v1/music):** "minimal warm ambient, soft liquid textures, slow and satisfying, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

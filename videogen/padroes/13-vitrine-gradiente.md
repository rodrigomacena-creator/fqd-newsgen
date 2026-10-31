---
id: vitrine-gradiente
numero: 13
nome: "Vitrine em Gradiente"
apelidos: [padrao-13, cartoes-de-vidro, holografico]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 12}
referencia: https://br.pinterest.com/pin/854769204307007889/
frames: referencias/padrao-13-frames.jpg
implementado_em: []
paleta: {fundo: "#E2E2E4", magenta: "#D42A6F", violeta: "#7A3CF0", azul: "#3E7BFA", tinta: "#1C1C22"}
fontes: "Grotesca neutra (Inter Tight) + script fluida colorida (Yellowtail / Smooch)"
cena_s: [1.0, 1.5]
transicao: "Cartões empilhados: o da frente sai deslizando e revela o próximo, com leve rotação e blur de movimento"
legenda: "Sem legenda falada: título no próprio cartão e caixa de seleção animada, como num editor de design"
musica: "Pop eletrônico brilhante e leve, com batida marcando a troca de cartão"
cta: "'Thank you' com pílulas brilhantes: 'comente para tirar dúvidas' e 'salve para depois'"
---

# Padrão 13: Vitrine em Gradiente

**Quando usar:** Mostrar uma coleção, como 5 ferramentas, 5 prompts ou 5 cases, em formato de vitrine. Tom moderno e colorido, com cara de design contemporâneo. Rende salvamentos.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/854769204307007889/), cerca de 12s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-13-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Fundo cinza-claro com grandes manchas de gradiente magenta e violeta em cantos opostos, que se movem devagar.
- Pilha central de cartões com borda branca grossa, sombra suave e arte em gradiente diferente em cada um.
- Cada cartão traz número, título e duas pílulas de vidro na parte de baixo, além de um botão redondo de brilho saindo pela borda.
- Detalhes de editor: caixa de seleção azul em volta do título e cursor colorido com o nome da marca.

## Texto / legendas
- Par fixo de fontes: grotesca escura e script colorida se sobrepondo.
- O texto do cartão é pequeno de propósito: a pessoa pausa para ler, e isso ajuda na retenção.

## Ritmo e transições
- Abertura e fechamento seguram 2 segundos cada. No meio, um cartão a cada 1,3 segundo.
- Cartões entram levemente tortos e se endireitam ao parar.
- Transição: Cartões empilhados: o da frente sai deslizando e revela o próximo, com leve rotação e blur de movimento.

## Áudio
- Pop eletrônico brilhante e leve, com batida marcando a troca de cartão. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Título** (0–2s): "5 fontes de junho".
2. **Vitrine** (2–8s): um cartão por item.
3. **Fecho** (8–12s): agradecimento e pedido de salvar.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Abstract glossy 3D gradient artwork, flowing ribbons, {cores}, soft light, no text, vertical 3:4.
- **Montagem:** A arte de cada cartão é gerada sem texto, e títulos, pílulas e bordas são desenhados por código. Para o perfil, combina com "5 ferramentas de IA para marketing". Funciona sem narração.
- **Prompt de música (ElevenLabs /v1/music):** "bright playful electronic pop, glossy synth plucks, light claps on each beat, modern, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

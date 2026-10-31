---
id: metafora-escultura-3d
numero: 9
nome: "Metáfora em Escultura 3D"
apelidos: [padrao-9, museu, frequencia]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 17}
referencia: https://br.pinterest.com/pin/882283383297698545/
frames: referencias/padrao-09-frames.jpg
implementado_em: [exemplos/5s/p09/]
paleta: {azul: "#0F1E33", creme: "#EFE7D6", gesso: "#E6DCCB", vermelho: "#B5322A"}
fontes: "Sans bold + serif itálica (Inter + EB Garamond Italic), variando por palavra"
cena_s: [1.2, 2.0]
transicao: "Morphing conceitual: uma linha vermelha contínua liga as cenas; o rosto se abre em fatias; películas de filme passam na frente"
legenda: "Frase-escada fixa embaixo: 'Then a' pequeno e a palavra-conceito grande, cada uma num estilo"
musica: "Ambient com piano esparso e tensão crescente que resolve no final"
cta: "Sem CTA: fecha na frase-título, o que favorece replay. Em uso comercial, acrescentar assinatura curta"
---

# Padrão 9: Metáfora em Escultura 3D

**Quando usar:** Reflexão curta e filosófica sobre mentalidade e identidade. Vídeo poético, de alto valor de produção, muito compartilhável.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/882283383297698545/), cerca de 17s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-09-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Uma metáfora por cena, em render 3D limpo: diapasão vibrando, busto de gesso com o cérebro surgindo entre metades do rosto, coração anatômico, mão de gesso pegando uma esfera vermelha, dominós caindo.
- Os objetos ficam centralizados, com muito espaço vazio e iluminação de museu.
- Fundo alterna entre azul-noite e papel creme, marcando o ritmo.
- Fio vermelho (onda de frequência, batimento) atravessa as cenas e costura as metáforas.
- Fecho: o busto se recompõe dentro de anéis vermelhos finos.

## Texto / legendas
- Texto sempre no mesmo lugar, no terço inferior, para o olho descansar.
- Cada palavra-conceito ganha um estilo: **thought.** em sans black, *feeling.* em serif itálica, e **who *you* are.** com o "you" em vermelho.

## Ritmo e transições
- Uma anáfora guia a edição: "then a… then a…". Cada repetição dá um corte novo na batida.
- Cortes rápidos, mas com a leveza das transições conceituais.
- Transição: Morphing conceitual: uma linha vermelha contínua liga as cenas; o rosto se abre em fatias; películas de filme passam na frente.

## Áudio
- Ambient com piano esparso e tensão crescente que resolve no final. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Início** (0–3s): "primeiro é uma frequência".
2. **Escada de conceitos** (3–13s): pensamento, sentimento, escolha, comportamento, hábito, realidade.
3. **Fecho** (13–17s): "depois, é simplesmente quem você é".

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Clean 3D render of {objeto}, museum lighting, smooth plaster and glossy red materials, centered with lots of empty space, deep navy background (or warm cream paper background), no text, vertical 9:16.
  > Classical white plaster bust with closed eyes, face split into vertical offset slices, deep navy background, soft light, no text, vertical 9:16.
- **Montagem:** Precisa de um roteiro em forma de escada, com uma ideia que se transforma passo a passo. Exemplo para o perfil: "primeiro é uma busca, depois uma pergunta para a IA, depois uma citação, depois uma venda". Sem modelo de vídeo, usar imagens 3D com zoom lento e a linha vermelha animada por código.
- **Prompt de música (ElevenLabs /v1/music):** "sparse ambient piano, soft low strings, slowly rising tension that resolves, contemplative, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

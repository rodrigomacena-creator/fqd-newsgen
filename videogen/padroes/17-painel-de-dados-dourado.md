---
id: painel-de-dados-dourado
numero: 17
nome: "Painel de Dados Dourado"
apelidos: [padrao-17, dados-e-graficos, financeiro]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 75}
referencia: https://br.pinterest.com/pin/993536367819152385/
frames: referencias/padrao-17-frames.jpg
implementado_em: []
paleta: {fundo: "#1A1F19", sage: "#8C9A8C", dourado: "#E2B659", verde: "#3DDC84", vermelho: "#F0626E"}
fontes: "Sans moderna (Rubik / Inter), números grandes em dourado e subtítulo pequeno espaçado"
cena_s: [4.0, 6.0]
transicao: "O fundo clareia e escurece em ondas; números contam até o valor; gráficos se desenham da esquerda para a direita"
legenda: "Legenda completa de duas linhas no rodapé, com título superior em dourado e letra espaçada"
musica: "Suspense eletrônico discreto, com pulsação lenta"
cta: "Retorno à abertura com os dois números: fecha o ciclo e provoca replay"
---

# Padrão 17: Painel de Dados Dourado

**Quando usar:** Conteúdo baseado em números: pesquisa, comparação, "o dado que ninguém olha". Tom investigativo e sério. Funciona em vídeos longos, de 45 a 75s.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/993536367819152385/), cerca de 75s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-17-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Fundo escuro com imagem temática muito apagada: olhos em molduras, dados, ponto de interrogação, retrato pensativo.
- Cartões retangulares escuros com borda dourada fina, com número grande e rótulo pequeno.
- Gráficos reais animados: barras em vermelho e verde, linha crescendo com pontos marcados e radar ao fundo.
- Logo pequeno no canto superior direito o tempo todo.

## Texto / legendas
- Hierarquia fixa: título espaçado dourado, frase grande branca, número em cartão, legenda no rodapé.
- Cor com significado: verde para alta, vermelho para baixa, dourado para neutro.

## Ritmo e transições
- Mais lento que os outros: cada dado tem tempo de ser lido.
- A contagem dos números é o principal movimento na tela.
- Transição: O fundo clareia e escurece em ondas; números contam até o valor; gráficos se desenham da esquerda para a direita.

## Áudio
- Suspense eletrônico discreto, com pulsação lenta. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Mistério** (0–10s): dois números quase iguais, um deles especial.
2. **Contexto** (10–25s): como foi medido.
3. **Revelação** (25–50s): a diferença em gráfico.
4. **O que fazer** (50–68s): usar e não usar, em cartões.
5. **Volta ao início** (68–75s).

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Dark moody collage of {tema}, desaturated sage green, low contrast, film grain, faded, lots of empty space, no text, vertical 9:16.
- **Montagem:** Os gráficos devem usar dados reais e ser desenhados por código, nunca por modelo de imagem. É preciso citar a fonte dos números na tela. Para o perfil, combina com dados de GEO, desde que tenham fonte confiável.
- **Prompt de música (ElevenLabs /v1/music):** "minimal dark electronic suspense, slow pulse, subtle ticking, analytical mood, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

---
id: neumorfico-tela-real
numero: 6
nome: "Neumórfico + Tela Real"
apelidos: [padrao-6, tutorial-de-ferramenta, cinza-claro]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 101}
referencia: https://br.pinterest.com/pin/901986631646846974/
frames: referencias/padrao-06-frames.jpg
implementado_em: [exemplos/5s/p06/]
paleta: {fundo: "#EFEFEF", tinta: "#141414", secundario: "#9A9A9A", tela: "#1F1F1F"}
fontes: "Sans neutra (Inter / SF Pro), com regular, bold e itálico na mesma frase"
cena_s: [3.0, 5.0]
transicao: "Janelas sobem e descem com sombra longa; ícone em moeda rola pela tela arrastando uma faixa; blur total em frases de impacto"
legenda: "Palavra por palavra, de cinza claro para preto, em pesos e tamanhos mistos"
musica: "Corporate tech suave, pulso constante e discreto"
cta: "'Não esqueça de seguir', com logo 3D da marca e o site como marca d'água fixa"
---

# Padrão 6: Neumórfico + Tela Real

**Quando usar:** Apresentar uma ferramenta ou explicar um software, em versões curtas ou longas. Tom claro e confiável de produto.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/901986631646846974/), cerca de 101s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-06-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Fundo cinza-claro com grandes anéis brancos em relevo nos cantos.
- Ícones em moedas brancas neumórficas com sombra suave, organizados em linhas.
- Captura real do software em janela escura com sombra longa, levemente em perspectiva, com cursor grande animado.
- Site da marca em cinza como marca d'água fixa no rodapé durante o vídeo inteiro.
- Lista de benefícios com ícone preto redondo em cada linha.

## Texto / legendas
- Texto sempre abaixo ou acima da janela, nunca por cima dela.
- Mistura de pesos na mesma frase: "Install it on your **computer**".
- A palavra ainda não falada aparece em cinza e escurece quando é dita, como um karaokê.

## Ritmo e transições
- O vídeo não tem corte seco: janela, moeda e texto sempre se movem para abrir espaço para o próximo elemento.
- Frase de impacto isolada: a tela inteira borra, e a frase fica sozinha por 2 segundos.
- Transição: Janelas sobem e descem com sombra longa; ícone em moeda rola pela tela arrastando uma faixa; blur total em frases de impacto.

## Áudio
- Corporate tech suave, pulso constante e discreto. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Promessa** (0–8s): "é assim que você tem tudo num lugar só".
2. **Benefícios** (8–20s): economizar tempo, dinheiro e esforço.
3. **Passo a passo com telas** (corpo).
4. **Conclusão forte**: "a configuração mais séria disponível agora".
5. **Seguir** e logo.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > White neumorphic round coin icon with {icone} in the center, soft shadow, light gray background, clean 3D UI style, no text, 1:1.
  > Glossy 3D logo of {marca}, black, floating with soft shadow, faint grid on light gray background, no text.
- **Montagem:** As telas devem ser capturas reais (é o que dá credibilidade). A janela e a sombra longa são aplicadas por código, e o karaokê de palavras usa os tempos de words.json do pipeline. Para o perfil do Rodrigo, cortar em versões de 30 a 45s.
- **Prompt de música (ElevenLabs /v1/music):** "soft modern tech corporate, steady light pulse, clean synth plucks, focused and optimistic, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

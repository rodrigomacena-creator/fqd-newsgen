---
id: icones-em-azul
numero: 16
nome: "Ícones Brilhantes em Azul"
apelidos: [padrao-16, explicador-azul, corporativo-linhas]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 30}
referencia: https://br.pinterest.com/pin/980518150145413648/
frames: referencias/padrao-16-frames.jpg
implementado_em: []
paleta: {azul: "#0A3A6B", azul_fundo: "#02101F", branco: "#FFFFFF", verde: "#22E05C", laranja: "#F47B20"}
fontes: "Montserrat Black com brilho + script fina branca (Mrs Saint Delafield / Allura)"
cena_s: [1.0, 2.0]
transicao: "Máscara em faixa vertical varre o quadro; círculos pontilhados giram e se fecham; palavras borram ao sair"
legenda: "Palavra por palavra no centro, com caixa fina ao redor do termo-chave e script branca entre as linhas"
musica: "Corporate inspirador com pulso de sintetizador e crescimento"
cta: "Logo da marca desenhado com linha animada, sobre o mesmo azul, com o lema embaixo"
---

# Padrão 16: Ícones Brilhantes em Azul

**Quando usar:** Explicar um conceito de forma simples e direta ("seu cliente é o herói, sua marca é o guia"). Tom corporativo e seguro. É um dos padrões mais simples de produzir.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/980518150145413648/), cerca de 30s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-16-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Fundo azul-marinho com listras diagonais finas e degradê para preto no rodapé.
- Ícones centrais simples com brilho branco: prancheta em círculo pontilhado, cifrão com setas girando, papel com lápis e alvo 3D.
- Caixas com contorno branco em forma de diagrama: "PÚBLICO = HERÓI", "MARCA = GUIA", conectadas por palavras.
- Seta pontilhada vertical liga duas frases, como num quadro de estratégia.

## Texto / legendas
- Caixa alta pesada com brilho suave, e uma palavra em script fina como contraste.
- Palavra de destaque em verde vivo, aparecendo letra por letra e bem espaçada.

## Ritmo e transições
- Narração guia cada elemento: uma palavra, um ícone.
- Nada fica parado: círculos giram e ícones pulsam levemente.
- Transição: Máscara em faixa vertical varre o quadro; círculos pontilhados giram e se fecham; palavras borram ao sair.

## Áudio
- Corporate inspirador com pulso de sintetizador e crescimento. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Provocação** (0–5s): "seus clientes não ligam para o seu produto".
2. **Virada** (5–12s): "só querem resolver o problema deles".
3. **Modelo** (12–25s): diagrama de herói e guia.
4. **Assinatura** (25–30s).

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Single glowing 3D icon of {objeto}, soft white glow, isolated on solid deep navy blue background, clean, no text, 1:1.
- **Montagem:** Fundo, caixas, círculos e setas são desenhados por código. Só os ícones centrais precisam de imagem, e podem formar um banco reutilizável. Baixo custo por vídeo.
- **Prompt de música (ElevenLabs /v1/music):** "inspiring corporate synth pulse, gradually building, clean and confident, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

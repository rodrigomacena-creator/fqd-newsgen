---
id: selos-maquina-de-escrever
numero: 20
nome: "Selos e Máquina de Escrever"
apelidos: [padrao-20, institucional-vintage, colecao-de-selos]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 41}
referencia: https://br.pinterest.com/pin/362539838776544543/
frames: referencias/padrao-20-frames.jpg
implementado_em: []
paleta: {vinho: "#4A0E12", papel: "#D9D5C8", tinta: "#3B3A36", carimbo: "#6A1E22"}
fontes: "Máquina de escrever (Special Elite / Courier Prime) em caixa alta"
cena_s: [3.0, 4.0]
transicao: "Papel sobe e desce como folha na máquina; selos deslizam por cima do anterior, alternando fundo vinho e papel"
legenda: "Texto datilografado, letra por letra, sobreposto à base de cada foto"
musica: "Piano clássico e cordas leves, com sons reais de máquina de escrever"
cta: "Fundo branco e limpo com o logo da marca e o site"
---

# Padrão 20: Selos e Máquina de Escrever

**Quando usar:** Peça institucional e de legado: história da empresa, marcos, cases ou datas comemorativas. Tom elegante, nostálgico e respeitoso.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/362539838776544543/), cerca de 41s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-20-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Abertura com uma máquina de escrever real, em que o título é datilografado na folha.
- Objetos de arquivo sobre papel pautado: moeda antiga, mapa em silhueta, carimbos.
- Fotos reais em formato de selo postal, com bordas serrilhadas, enchendo quase toda a tela.
- Alternância entre fundo vinho-escuro e papel a cada selo, com logo pequeno sempre no topo.

## Texto / legendas
- Uma só família de fonte, com variações de espaçamento: "T H E  L E G A C Y".
- Texto curto, centralizado, em letras claras na base da foto.

## Ritmo e transições
- Ritmo constante e calmo, sem efeitos rápidos.
- Movimento lento de zoom dentro de cada selo.
- Transição: Papel sobe e desce como folha na máquina; selos deslizam por cima do anterior, alternando fundo vinho e papel.

## Áudio
- Piano clássico e cordas leves, com sons reais de máquina de escrever. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Datilografia** (0–4s): tema.
2. **Contexto** (4–10s): objetos de arquivo.
3. **Coleção** (10–34s): um selo por item.
4. **Mensagem** (34–38s).
5. **Logo** (38–41s).

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Photorealistic picture of {assunto}, natural light, rich colors, vertical 3:4, no text.
  > Top-down photo of an old typewriter with a blank sheet of paper, grayscale, soft light, no text, vertical 9:16.
- **Montagem:** A borda serrilhada do selo é uma máscara por código, aplicada a qualquer imagem gerada. Para a Oxyn Group, pode virar "a evolução da busca: lista azul, SEO, IA, GEO", com um selo por era.
- **Prompt de música (ElevenLabs /v1/music):** "gentle classical piano, light strings, nostalgic and dignified, soft typewriter clicks, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

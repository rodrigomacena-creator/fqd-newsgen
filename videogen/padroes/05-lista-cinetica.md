---
id: lista-cinetica
numero: 5
nome: "Lista Cinética em Roleta"
apelidos: [padrao-5, roleta-de-palavras, preto-e-branco]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 8}
referencia: https://br.pinterest.com/pin/773071092334429592/
frames: referencias/padrao-05-frames.jpg
implementado_em: [exemplos/5s/p05/]
paleta: {fundo: "#000000", ativo: "#FFFFFF", inativo: "#6B6B6B"}
fontes: "Sans geométrica bold (Poppins Bold / SemiBold)"
cena_s: [0.5, 0.7]
transicao: "Plano único: a coluna rola em curva 3D e a palavra central entra em foco, sem nenhum corte"
legenda: "A própria lista é o vídeo: palavra ativa nítida e branca; vizinhas em cinza desfocado, inclinadas pela curva"
musica: "Beat eletrônico seco com clique em cada troca de palavra"
cta: "Última palavra da lista é o nome da marca ou a oferta, com um segurar de 1s"
---

# Padrão 5: Lista Cinética em Roleta

**Quando usar:** Vinheta curta para listar serviços ou temas, como abertura de perfil, intro de vídeo ou anúncio de 6 a 8 segundos. Funciona sem narração.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/773071092334429592/), cerca de 8s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-05-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Fundo totalmente preto, sem nenhum elemento além do texto.
- Coluna de palavras alinhada à esquerda, girando como um cilindro: as de cima e de baixo inclinam e diminuem.
- Seta branca fixa na borda esquerda apontando para a palavra ativa. Ela dá um pulo a cada troca.
- O desfoque cresce conforme a distância da palavra até o centro.

## Texto / legendas
- Apenas uma fonte, em Title Case: Ads, Growth, Seo, Content, Marketing.
- A palavra ativa cresce cerca de 20% e fica branca.

## Ritmo e transições
- Movimento com easing forte, parando em cada palavra por uns 0,3s.
- A lista dá uma volta completa e o loop fecha sem emenda, o que ajuda no replay.
- Transição: Plano único: a coluna rola em curva 3D e a palavra central entra em foco, sem nenhum corte.

## Áudio
- Beat eletrônico seco com clique em cada troca de palavra. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Lista de 10 a 12 palavras** (0–7s), com o que a marca faz.
2. **Loop ou palavra final** (7–8s).

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Não usa imagem gerada: é 100% tipografia por código.
- **Montagem:** Render em Pillow/Remotion: posição y por índice menos o tempo, inclinação proporcional à distância do centro e blur gaussiano também proporcional. É o padrão mais barato, sem custo de imagem e de voz.
- **Prompt de música (ElevenLabs /v1/music):** "minimal electronic beat, dry clicks, punchy kick at 100 bpm, modern and clean, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

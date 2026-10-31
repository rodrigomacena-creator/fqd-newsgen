---
id: fluxo-de-nos-ia
numero: 15
nome: "Fluxo de Nós de IA"
apelidos: [padrao-15, workflow, como-foi-feito]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 15}
referencia: https://br.pinterest.com/pin/1082975041723514816/
frames: referencias/padrao-15-frames.jpg
implementado_em: []
paleta: {fundo: "#07080C", no: "#1A1C24", linha: "#C8CCD6", roxo: "#8B5CF6", ciano: "#3FD8F2"}
fontes: "Sans de interface (Inter) em tamanho pequeno, com faixa vermelha no título"
cena_s: [1.0, 1.5]
transicao: "A câmera viaja pelas linhas de um nó para o próximo; os cortes do vídeo final seguem o mesmo ritmo"
legenda: "Sem legenda: o texto é o próprio prompt dentro dos nós, e o único título aparece como faixa vermelha na abertura"
musica: "Trailer eletrônico com impactos e speed ramps sonoros"
cta: "Título em faixa vermelha: 'copie este fluxo'. O fecho é a frase do produto no vídeo final"
---

# Padrão 15: Fluxo de Nós de IA

**Quando usar:** Mostrar como um anúncio ou vídeo foi feito com IA. Bom para vender serviço de criação com IA e atrair quem quer copiar o método ("comente para receber o fluxo").

**O efeito completo pede modelo de vídeo.** Sem ele, as cenas no topo viram imagens com zoom e speed ramp simulado. O editor de nós pode ser desenhado por código, sem usar nenhuma ferramenta real.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/1082975041723514816/), cerca de 15s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-15-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Tela dividida: no terço superior, o vídeo final em cartão arredondado; embaixo, o editor de nós que gerou aquilo.
- Nós escuros de cantos arredondados, com miniatura, seletores de modelo e o texto do prompt.
- Linhas curvas claras ligando imagem de entrada a vários nós de vídeo, com portas roxas.
- O vídeo de cima mostra a mesma peça em planos cada vez mais extremos: macro, túnel, reflexo na água.

## Texto / legendas
- Pouco texto legível, pequeno e técnico. Ele funciona como prova, e não como leitura.
- O nome do modelo aparece no seletor de cada nó.

## Ritmo e transições
- Câmera sempre em movimento pelo editor, deslizando e dando zoom ao longo das conexões.
- O vídeo no topo tem cortes rápidos na batida, com variações bruscas de velocidade.
- Transição: A câmera viaja pelas linhas de um nó para o próximo; os cortes do vídeo final seguem o mesmo ritmo.

## Áudio
- Trailer eletrônico com impactos e speed ramps sonoros. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Produto simples e título** (0–2s).
2. **Fluxo se abrindo** (2–9s): imagem de entrada, depois nós de vídeo.
3. **Clímax** (9–12s): cortes mais rápidos.
4. **Plano final** (12–15s): produto com a frase da marca.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Hero product shot of {produto}, floating over a dark reflective surface, volumetric teal light rays, splash and mist, commercial photography, no text, 16:9.
  > Extreme macro of {detalhe do produto}, tunnel perspective, cinematic metallic lighting, no text, 16:9.
- **Montagem:** Para o perfil, o produto pode ser o próprio pipeline: mostrar roteiro, voz, imagem e vídeo como nós. Desenhar os nós em HTML/Remotion garante texto legível. Evitar marcas de terceiros nas imagens.
- **Prompt de música (ElevenLabs /v1/music):** "aggressive trailer electronic, risers, hard impacts, reversed whooshes, high energy, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

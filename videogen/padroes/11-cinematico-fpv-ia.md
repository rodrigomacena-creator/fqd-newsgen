---
id: cinematico-fpv-ia
numero: 11
nome: "Cinemático FPV de IA"
apelidos: [padrao-11, plano-sequencia, mostruario-de-prompt]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: 10}
referencia: https://br.pinterest.com/pin/703124560621033079/
frames: referencias/padrao-11-frames.jpg
implementado_em: [exemplos/5s/p11/]
paleta: {ceu: "#E8B98A", azul_hora: "#3E5C8A", concreto: "#2D2F33", sobreposicao: "#FFFFFF"}
fontes: "Sans fina (Raleway Light) para gancho e prompt"
cena_s: [10.0, 10.0]
transicao: "Sem cortes aparentes: plano-sequência de drone, com aceleração e motion blur escondendo as emendas"
legenda: "Texto fixo: gancho no topo e, embaixo, cartão com imagem de referência e o prompt usado"
musica: "Cinematográfica com subida e impacto no fim, com whoosh de vento"
cta: "Fixo no topo do início ao fim: 'Comente IA para receber o guia'"
---

# Padrão 11: Cinemático FPV de IA

**Quando usar:** Demonstração do poder da IA, atraindo leads com "comente IA para receber o guia". Efeito uau imediato.

**Requer modelo de vídeo.** O pipeline atual não tem nenhum, e Ken Burns não reproduz o efeito. Antes de produzir, precisamos escolher um modelo com bom suporte a plano contínuo e considerar o custo por segundo.

Referência analisada: [pin no Pinterest](https://br.pinterest.com/pin/703124560621033079/), cerca de 10s, 720x1280, em 12 quadros distribuídos ao longo do vídeo (ver `referencias/padrao-11-frames.jpg`). A análise foi só visual: o vídeo não foi baixado nem ouvido, e por isso o áudio abaixo é uma sugestão.

## Visual
- Um único plano contínuo em vídeo de IA: janela de avião abrindo, torre sobre as nuvens, mergulho de drone até o prédio, passagem pela rua com pessoa, revelação final.
- Motivo central fixo, um prédio de arquitetura marcante, que serve de âncora ao longo do voo.
- Sobreposição permanente embaixo: miniatura da imagem de referência e o texto do prompt, com cara de making of.

## Texto / legendas
- Texto mínimo e pequeno, em branco e com baixa opacidade para não competir com a imagem.
- Só a palavra-gatilho recebe vermelho: "Comente *IA*".

## Ritmo e transições
- Variação de velocidade conduz a emoção: devagar na janela, rápido no mergulho, devagar na revelação.
- O desfoque de movimento nas acelerações esconde as emendas entre trechos gerados.
- Transição: Sem cortes aparentes: plano-sequência de drone, com aceleração e motion blur escondendo as emendas.

## Áudio
- Cinematográfica com subida e impacto no fim, com whoosh de vento. (Sugestão, não observado na referência.)

## Estrutura narrativa (template)
1. **Abertura íntima** (0–2s): mão abrindo a janela.
2. **Revelação** (2–3s): o prédio entre as nuvens.
3. **Mergulho** (3–6s): drone desce até a fachada.
4. **Chegada** (6–8s): rua e pessoa.
5. **Clímax** (8–10s): prédio inteiro.

## Dicas de geração (pipeline)
- **Imagens (prompt):**
  > Cinematic, photorealistic single continuous shot, 10 seconds, shot on ARRI Alexa with anamorphic lens, shallow depth of field, natural film grain, soft realistic lighting. {cena em etapas com tempos}.
  > Imagem de referência: photorealistic architectural photo of {prédio}, blue hour, vertical 9:16.
- **Montagem:** O próprio prompt aparece no vídeo, e por isso ele vira conteúdo. Para o perfil, funciona bem como isca de leads em temas de IA. Sem narração.
- **Prompt de música (ElevenLabs /v1/music):** "epic cinematic rise, airy wind textures, deep impact on the final hit, no vocals". Ducking de cerca de 16 dB sob a voz, quando houver narração.

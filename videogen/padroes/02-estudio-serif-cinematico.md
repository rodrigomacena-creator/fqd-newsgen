---
id: estudio-serif-cinematico
numero: 2
nome: "Estúdio Serif + Cinemático"
apelidos: [padrao-2, branding-elegante, serif-italico]
formato: {aspecto: "9:16", resolucao: "1080x1920", fps: 30, duracao_s: [25, 35]}
referencia: referencias/padrao-02-referencia.mp4
frames: referencias/padrao-02-frames.jpg
implementado_em: []
paleta: {fundo: "gradiente radial #F4F4F4 (centro) → #D6D6D6 (bordas)", texto_estudio: "#1A1A1A", texto_video: "#FFFFFF", destaque_palavra: "#B5543A (terracota)", cta_marca: "#D7EA2B (verde-limão da marca)"}
fontes: {principal: "Playfair Display Italic (Regular + Black)", secundaria: "sans geométrica heavy italic, só para nomes de marca"}
cena_s: [2.0, 3.5]
transicao: "sem cortes no estúdio: elementos entram e saem com fade+blur sobre o mesmo fundo; dissolve ou corte suave para os trechos de vídeo"
legenda: "frase montada letra por letra com fade+blur da esquerda para a direita; pesos e tamanhos mistos; saída com blur"
musica: "lo-fi/corporate suave e contínua, piano + beat leve, sem pausas"
cta: "Siga <PERFIL> para mais dicas de <TEMA>, com logo da marca"
---

# Padrão 2: Estúdio Serif + Cinemático

**Quando usar:** conteúdo educativo ou explicativo de negócios, marketing e branding ("o que é X", "como a marca Y faz Z"). Tom calmo, elegante e premium, com exemplos de marcas conhecidas.

Referência analisada: 32s, 720x1280 a 30fps, narração masculina em inglês sobre trilha contínua, sem nenhum silêncio.

## Visual
O vídeo alterna entre dois "mundos":

**A. Estúdio limpo (cerca de 60% do tempo)**
- Fundo cinza-claro com gradiente radial (centro mais claro, bordas escuras), sempre o mesmo, o que dá a sensação de plano contínuo.
- Estrelas 3D metálicas escuras de 8 pontas nos cantos, cortadas pela borda do quadro. Elas giram e derivam devagar e entram e saem de foco (profundidade de campo). Funcionam como assinatura visual.
- No centro fica **um** objeto real e colorido (lata, tênis), flutuando inclinado uns 25 a 30°, com sombra projetada suave.
- Variações do objeto: miniaturas de foto em cards arredondados (tipo ícone de app, com sombra), ilustração com borda de adesivo e ícone P&B (alvo com dardo e texto "BRAND").
- A cor vem apenas dos objetos. O resto é neutro.

**B. Vídeo de banco cinematográfico (cerca de 40% do tempo)**
- Imagem em tela cheia, levemente dessaturada (teal/orange), com overlay escuro de 20 a 30% para a legenda branca ler bem.
- Mostra pessoas usando o produto, prédio corporativo em contra-plongée, apresentação em escritório.

## Texto / legendas
- Fonte serif itálica de alto contraste e condensada (Playfair Display Italic).
- Pesos mistos na mesma frase: conectivos em itálico regular pequeno, palavras-chave em itálico black grande. Ex.: "if you sell more than" (pequeno) seguido de "**One Product** or **Service,**" (grande).
- O alinhamento é escalonado: as linhas deslocam à esquerda e à direita, como num layout de revista.
- A primeira frase pode vir numa tarja escura com texto branco.
- Entrada letra por letra com fade e blur, da esquerda para a direita. A saída é por blur e fade, sem corte.
- No máximo uma palavra por vídeo pode ter cor (terracota, ex.: "product").
- Nomes de marca usam uma sans heavy italic (ex.: "NIKE Running").
- No estúdio, o texto fica acima do objeto, no terço superior. No vídeo, fica centralizado em branco.
- Marca d'água discreta com @perfil, embaixo e ao centro.

## Ritmo e transições
- Cenas mais longas que as do padrão 1, de 2 a 3,5 segundos, guiadas pela frase da narração.
- No estúdio não há corte: o objeto antigo sai com blur e o novo entra com zoom e blur, enquanto as estrelas continuam no lugar.
- Entre estúdio e vídeo, a passagem é por dissolve curto ou corte suave.
- O movimento é constante e lento: drift do objeto, rotação das estrelas e Ken Burns no vídeo.

## Áudio
- Narração calma e didática, com cerca de 3 palavras por segundo (por volta de 95 palavras em 32s).
- Trilha contínua do início ao fim, suave e levemente positiva, sem whooshes agressivos.

## Estrutura narrativa (template)
1. **Gancho condicional** (0–4s): "Se você vende mais de um produto ou serviço…"
2. **Nome do conceito** (4–6s): "…é aí que entra a *Arquitetura de Marca*."
3. **Exemplo de marca famosa** (6–20s): mostrar como ela separa as linhas, usando objeto ou foto por item.
4. **Benefício** (20–25s): "cada produto apoia o mesmo objetivo".
5. **Definição-resumo** (25–28s): "Isso é X: uma empresa, papéis claros…"
6. **CTA de seguir** (28–32s): "Pra mais dicas de branding, siga **Perfil**", com logo e formas na cor da marca (blobs verde-limão no canto).

## Dicas de geração (pipeline)
- **Objetos de estúdio (prompt):**
  > Studio product photograph of {objeto}, single object isolated, floating and tilted about 25 degrees, soft realistic drop shadow below, plain light gray seamless background (#EDEDED), soft diffused light, high detail, photorealistic, no text, centered, vertical 9:16, lots of empty space around.
  Para integrar ao fundo, gerar sobre cinza ou branco e compor com blend `multiply`, ou recortar o fundo antes.
- **Estrelas (gerar uma vez e reutilizar):**
  > 3D eight-pointed star, dark gunmetal metallic, sharp faceted points, soft studio lighting, isolated on pure white background, no text.
  Compor 2 a 3 estrelas por cena nos cantos, com escala de 0,6 a 1,0, rotação lenta e blur gaussiano variável para simular profundidade.
- **Miniaturas:** gerar fotos realistas e aplicar card com cantos de 24px e sombra.
- **Cenas "cinemáticas":** como não temos banco de vídeo, gerar fotos fotorrealistas 9:16 ("cinematic film still, shallow depth of field, teal and orange grade, natural light, {cena}") e animar com Ken Burns, overlay escuro de 25% e grão leve. Um modelo de vídeo pode entrar aqui no futuro.
- **Legendas:** Playfair Display Italic (Regular e Black). Fazer o reveal por caractere com fade+blur de cerca de 40ms por letra, agrupando cada frase em 2 a 3 linhas escalonadas e destacando as palavras-chave em black.
- **Marcas reais:** usar como exemplo no texto é ok. Nas imagens, preferir objetos genéricos ou da própria marca do Rodrigo, porque o modelo distorce logos e há risco de marca registrada.
- **Prompt de música (ElevenLabs /v1/music):** "soft modern corporate lo-fi, warm piano chords, light hip-hop beat, calm and optimistic, minimal, no vocals". Ducking de cerca de 16 dB sob a voz.
- **TTS:** `speed` 1.0, tom didático.

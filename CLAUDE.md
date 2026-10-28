@AGENTS.md

# FQD News GEN

Protótipo Next.js que transforma vídeos do YouTube e/ou páginas da web em notícias completas
geradas por IA (título, subtítulos, texto, imagens e post de Instagram), com edição inline,
histórico paginado, perfis de instrução por "destino" (só tom/estilo — estrutura é escolhida
por notícia, ver abaixo) e extração de paleta de cores a partir de um styleguide (PDF/imagem/SVG)
por perfil.

Leia este arquivo por inteiro antes de mexer no código — ele documenta decisões e armadilhas
reais encontradas ao construir o projeto, não só a estrutura.

## Stack

- **Next.js 16.3.1** (App Router, Turbopack) + TypeScript — **atenção**: `AGENTS.md` (importado
  acima) avisa que esta versão do Next.js tem breaking changes vs. o que você conhece por
  treinamento. Antes de usar uma API que não tiver certeza (params assíncronos, route handlers,
  metadata, etc.), confira `node_modules/next/dist/docs/`.
- **Tailwind CSS v4** — tema definido como variáveis CSS em `src/app/globals.css`
  (`@theme inline`), **não** existe `tailwind.config.ts`.
- **Prisma 7.9.1 + Postgres** (Prisma Postgres), generator `"prisma-client"` (não o antigo
  `"prisma-client-js"`), saída em `src/generated/prisma` (gitignored, gerado via
  `npx prisma generate`). Adapter `@prisma/adapter-pg` (não `better-sqlite3` — projeto migrou
  de SQLite local pra Postgres pra rodar na Vercel, ver armadilha #12).
- **Vercel Blob** (`@vercel/blob`) pra armazenar imagens geradas e styleguides enviados —
  filesystem local não persiste em runtime serverless da Vercel.
- **OpenRouter** (SDK `openai` apontando pra `https://openrouter.ai/api/v1`) pra texto (chat
  completions) e imagem (API dedicada `/api/v1/images`, formato diferente do chat).
- **@mozilla/readability + jsdom** pra extrair texto de páginas genéricas (fontes não-YouTube).
- **pdf-parse (v2, API por classe) + sharp + @napi-rs/canvas** pra extrair cor/texto de
  styleguides enviados nos perfis.

## Armadilhas já resolvidas (não redescobrir)

1. **Prisma 7 exige driver adapter.** `new PrismaClient()` sozinho não funciona em runtime —
   precisa de `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) })`.
   Já configurado em `src/lib/prisma.ts`. Isso só vale para o client em runtime; o `prisma.config.ts`
   e os comandos de CLI (`migrate`, `generate`) continuam usando `DATABASE_URL` direto.

2. **Depois de QUALQUER mudança de schema**: `npx prisma migrate dev --create-only` costuma
   travar/falhar neste shell não-interativo quando há risco de perda de dado (ex.: coluna
   NOT NULL nova). Quando isso acontecer, escreva a migration.sql manualmente (veja os exemplos
   em `prisma/migrations/`, vários foram escritos à mão pra preservar dados existentes em vez de
   descartar) e aplique com `npx prisma migrate deploy` (não trava, não é interativo), depois
   `npx prisma generate`.

3. **Depois de adicionar/mudar rotas** (novo `route.ts`, novo segmento dinâmico, uso de
   `searchParams`): rode `npx next typegen` antes de `tsc --noEmit`, senão os tipos
   `PageProps<...>` / `RouteContext<...>` ficam desatualizados e o build reclama.

4. **Cache do Turbopack pode ficar rançoso** depois de certas mudanças (erros estranhos tipo
   "export duplicado" ou Prisma reclamando de coluna que já foi migrada). Se aparecer um erro
   que não faz sentido com o código atual: pare o servidor, `rm -rf .next`, suba de novo.

5. **A OpenRouter pode responder HTTP 200 com `{ error: {...} }`** no lugar de
   `{ choices: [...] }` (ex.: filtro de segurança do modelo bloqueou o conteúdo). NUNCA indexe
   `completion.choices[0]` direto — use `extractCompletionText()` de `src/lib/openrouter.ts`,
   que já trata isso e propaga a mensagem de erro real em vez de um TypeError genérico.

6. **Geração de imagem por IA geralmente não sabe escrever texto/logo direito — mas alguns
   modelos sabem, e o Instagram conta com isso de propósito.** Regra vale só pras imagens do
   **Portal** (`coverImagePrompt`/`imagePrompt` de seção): nunca inclua "banner", "graphic",
   "poster", "thumbnail" nem peça texto/logo dentro da imagem — a maioria dos modelos tenta
   desenhar o texto e erra a ortografia, então essas imagens continuam fotografia realista pura,
   geradas com `imageModel` (padrão Gemini). As imagens do **Instagram** são o oposto de
   propósito: o card É um design gráfico com uma manchete curta renderizada de verdade dentro da
   imagem, gerado com `instagramImageModel` (padrão `krea/krea-2-medium-turbo` — testado e
   confirmado que renderiza texto em português corretamente, ao contrário do modelo padrão de
   imagem). Essa distinção (texto proibido no Portal, texto pedido no Instagram) está reforçada
   nas instruções fixas em `src/lib/generateArticle.ts` (`JSON_FORMAT_INSTRUCTIONS`) e
   `src/lib/reviseArticle.ts` (`SYSTEM_PROMPT`, que diferencia por `target: "cover"/número` vs
   `target: "instagram"`) — não remover nem unificar essa regra.

7. **Edição inline (`EditableText`, contentEditable)**: usar `el.innerText` (não `textContent`)
   pra ler o valor editado, e aplicar `white-space: pre-wrap` (prop `multiline`) em campos que
   podem ter quebra de linha — `textContent` engole quebras de linha/parágrafos e `white-space`
   normal colapsa espaços múltiplos.

8. **pdf-parse dentro do Next.js/Turbopack** só funciona com dois ajustes: `import "pdf-parse/worker"`
   antes de importar `PDFParse` (já em `src/lib/styleguide.ts`), e
   `serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"]` em `next.config.ts`. Sem isso dá
   erro "Setting up fake worker failed".

9. **`<select>` nativo no tema escuro**: o dropdown aberto usa fundo branco do SO por padrão,
   mesmo com a caixa fechada estilizada. Precisa de `bg-background text-foreground` explícito
   tanto no `<select>` quanto em cada `<option>`.

10. **Ações com `window.confirm()`** (excluir notícia/perfil/imagem, exclusão em massa) não dão
    pra testar via automação de navegador — o confirm é sempre descartado automaticamente. Isso é
    esperado, não é bug. Pra validar a lógica em si, chame a API diretamente (fetch/curl) e
    confira o resultado no banco/disco.

11. **Identidade visual**: claro é o tema padrão, escuro é opcional via alternador no header
    (`ThemeToggle.tsx`) — tokens de cor como CSS vars em `globals.css`, com `:root` definindo os
    valores claros e `[data-theme="dark"]` sobrescrevendo pros valores escuros originais
    (`--background #121214`, `--accent-yellow #FFD02A`, etc. — accent colors são os mesmos nos
    dois temas, só background/foreground/surface/border mudam). Fonte Poppins, replicado do site
    real da FQD Studios (não confundir com a paleta roxa antiga do repo local `fqd-studios`, que
    está desatualizada). Preferência salva em `localStorage("theme")`; `layout.tsx` tem um
    `<script>` inline no `<head>` que aplica `data-theme="dark"` ANTES da primeira pintura (evita
    flash do tema errado) — só precisa agir no caso escuro, já que claro é o padrão do `:root`
    sem atributo nenhum. **Importante**: o `<body>` precisa receber as cores via classes Tailwind
    (`bg-background text-foreground` no `className`), não via uma regra CSS solta tipo
    `body { background: var(--background); }` em `globals.css` — essa segunda forma se mostrou
    instável pra refletir mudanças de `data-theme` em runtime nos testes feitos aqui.

12. **Storage é 100% remoto (Postgres + Vercel Blob), nunca filesystem local.** O projeto rodava
    originalmente com SQLite (`dev.db`) e imagens em `public/generated`/`public/styleguides` —
    isso foi migrado pra Prisma Postgres + Vercel Blob porque a Vercel roda em serverless com
    filesystem efêmero (nada gravado em disco sobrevive entre requisições/deploys). `src/lib/prisma.ts`
    usa `PrismaPg` (pacote `pg` + `@prisma/adapter-pg`), e todo código que salva/apaga imagem
    (`generateImages.ts`, `blobStorage.ts`, rotas de artigos/perfis) usa `put()`/`del()`/`list()`
    do `@vercel/blob` com `addRandomSuffix: false, allowOverwrite: true` — nunca `fs.writeFile`/
    `fs.unlink`. Se precisar rodar uma migração de dados pontual (ex.: importar um dump antigo),
    **não** escreva um script `.mjs` standalone que importa o client gerado do Prisma 7 — o
    `client.ts` gerado usa imports relativos sem extensão (`from "./enums"`), que o bundler do
    Next.js resolve mas o Node ESM puro (mesmo com `--experimental-strip-types`) rejeita com
    `ERR_MODULE_NOT_FOUND`. O caminho que funcionou: criar uma rota de API temporária dentro do
    próprio app (reaproveitando `@/lib/prisma`, que o Next já sabe resolver), chamá-la uma vez
    via `curl`/`fetch`, e apagar a rota depois.

13. **`jsdom` >= 27 quebra em runtime na Vercel (funciona local, falha só em produção lá).**
    `jsdom` está na lista padrão de `serverExternalPackages` do próprio Next.js (não precisa —
    e não deve — ser adicionado manualmente; e forçá-lo pra dentro do bundle via
    `transpilePackages` quebra de outro jeito, porque o jsdom lê um `default-stylesheet.css`
    do disco relativo ao próprio pacote, e isso não sobrevive ao bundling). A partir do
    `html-encoding-sniffer@6.0.0` (dependência do jsdom 27+), o pacote passou a fazer
    `require("@exodus/bytes/encoding-lite.js")`, mas `@exodus/bytes` é ESM puro
    (`"type": "module"`) — isso funciona local (`next dev`/`next build && next start`) porque o
    Node local suporta `require(esm)`, mas quebra especificamente na Lambda da Vercel com
    `ERR_REQUIRE_ESM`, retornando um 500 com corpo vazio (o front-end aí mostra algo tipo
    `Failed to execute 'json' on 'Response': Unexpected end of JSON input"`, que é só o sintoma
    no cliente). A correção foi **fixar `jsdom` em `^26.1.0`** (última versão cuja cadeia de
    dependências usa `html-encoding-sniffer@^4.0.0` + `whatwg-encoding`, sem `@exodus/bytes`) —
    não mexer no `next.config.ts` pra isso. Se um dia for atualizar o `jsdom`, teste
    `curl -X POST` no `/api/generate` (ou outra rota que exercite scraping de página) **contra o
    deploy de produção real**, não só local — esse bug não aparece em `next dev` nem em
    `next build && next start` local.

14. **Extração de transcrição do YouTube precisa de proxy residencial em produção.**
    O YouTube trata IPs de datacenter (Vercel, VPS da Hostinger, proxies "datacenter" da
    Bright Data/Webshare) de forma diferente de IPs residenciais — bloqueia (`Transcript is
    disabled`) ou rate-limita (`429`) a extração de transcrição especificamente para esses IPs,
    mesmo em vídeos com legenda normal. Testado e confirmado: Vercel, VPS própria (Hostinger) e
    proxies "datacenter"/"Proxy List" (Bright Data, Webshare) todos falham; só um proxy
    **residencial rotativo** de verdade resolve (testado com Webshare "Residential" —
    cuidado, é um produto separado de "Proxy List" no dashboard deles, que é datacenter). A
    integração fica em `src/lib/proxyFetch.ts` (`getYoutubeFetch()`, usa `undici`'s `ProxyAgent`
    com sessão aleatória por chamada pra rotacionar IP) e é passada como `config.fetch` pro
    `YoutubeTranscript.fetchTranscript()` em `src/lib/youtube.ts`. Sem as variáveis
    `RESIDENTIAL_PROXY_*` no ambiente, cai pra fetch direto (é assim que funciona em dev local,
    onde o IP residencial de casa já passa sem problema). Scraping de página comum
    (`webpage.ts`, sites de notícia) não usa esse proxy — o problema é específico do YouTube.

## Onde as coisas ficam

- `src/lib/prisma.ts` — client Prisma (singleton + driver adapter)
- `src/lib/sources.ts`, `youtube.ts`, `webpage.ts` — busca de conteúdo multi-fonte (YouTube
  transcript e/ou página via Readability), `MAX_SOURCES = 5`
- `src/lib/generateArticle.ts` + `src/lib/prompts.ts` — geração da matéria + post de Instagram
  (uma chamada de IA só). O prompt do sistema é montado em camadas SEMPRE nesta ordem:
  `instructionPrompt` (perfil escolhido, ou `DEFAULT_ARTICLE_PROMPT` se nenhum) → sempre
  `MULTI_SOURCE_INSTRUCTION` → sempre `buildDestinationsInstruction(...)` → `buildStructureInstruction(...)`
  (só se `wantPortal`) → `styleguideContext` → `JSON_FORMAT_INSTRUCTIONS`. As camadas "sempre"
  existem porque perfis customizados SUBSTITUEM `instructionPrompt` por completo — sem injetar
  essas regras à parte, um perfil escrito sem pensar em múltiplas fontes (ou um perfil antigo com
  contagem de seção hardcoded) faz a IA ignorar regras importantes silenciosamente. **Quantidade
  de subtítulos/parágrafos/fotos e instruções extras são escolhidas pelo usuário a cada
  notícia** (campos em `src/app/page.tsx`, vão pro corpo do POST `/api/generate` como
  `subtitleCount`/`paragraphCount`/`photoCount`/`extraInstructions`) — **não** ficam mais salvas
  no perfil (isso existiu brevemente como `InstructionProfile.maxSectionImages` e foi removido;
  se vir menção a isso em versões antigas do código/migrations, é histórico, não use como
  referência). Esses 4 valores também ficam gravados no próprio `Article` (colunas nullable —
  notícias geradas antes dessa migração têm `null`) e aparecem pro usuário no botão "Exibir
  parâmetros de entrada" no fim de
  `/noticia/[id]` (`GenerationParamsModal.tsx`), que trata `null` com fallback ("—"/"Nenhuma").
- **Destinos (Portal / Instagram)**: escolhidos por checkbox na home (`wantPortal`/`wantInstagram`,
  pelo menos um obrigatório), enviados como `destinations: string[]` (`"portal"`/`"instagram"`)
  pro POST `/api/generate`. **Não existe coluna `destinations` no `Article`** — de propósito, pra
  não duplicar estado: se um destino foi gerado é derivado dos próprios dados (`hasPortal =
  sections.length > 0 || coverImage`, `hasInstagram = Boolean(instagramCaption)`), tanto em
  `/noticia/[id]/page.tsx` quanto (implicitamente) no `reviseArticle.ts`, que também nunca deve
  "ressuscitar" um destino que não existia originalmente (ver `SYSTEM_PROMPT` de
  `reviseArticle.ts`). `title`/`subtitle` são gerados sempre, mesmo sem Portal, só pra
  identificar a notícia no histórico. Instagram suporta carrossel: `instagramPhotoCount`
  (1-10) controla quantas imagens, salvas em `instagramImages` (JSON de URLs, arquivos
  `instagram-0.png`, `instagram-1.png`...). O campo antigo `instagramImage` (uma imagem só,
  arquivo `instagram.png`) é lido só como fallback pra notícias anteriores a essa mudança —
  gerações novas nunca escrevem nele. Portal e Instagram usam **modelos de imagem separados**
  (`Article.imageModel` vs `Article.instagramImageModel`, ambos com equivalente em
  `Settings.defaultImageModel`/`defaultInstagramImageModel` e seletor próprio no formulário de
  geração) — ver armadilha #6 pro motivo (Portal = foto sem texto, Instagram = card com texto).
- **Histórico sem miniatura** (`/noticias`, `pickDisplayImage()` em `src/app/noticias/page.tsx`):
  prioriza `coverImage`; se não tiver (ex.: notícia só de Instagram), cai pra qualquer imagem de
  seção e depois pra primeira imagem do Instagram; se não achar nenhuma, `HistoryList.tsx` mostra
  um ícone placeholder em vez de caixa vazia.
- **Publicar no Portal WordPress** (`src/lib/wordpress.ts`, `/api/wordpress/categories`,
  `/api/articles/[id]/publish-wordpress`, botão `WordPressPublishButton.tsx` — só aparece se
  `hasPortal`, já que precisa de matéria pra enviar). Site real em fqdtv.site, autenticação via
  **Senha de Aplicativo** do WordPress (Básic Auth com `WORDPRESS_USERNAME` +
  `WORDPRESS_APP_PASSWORD`), **nunca** a senha de login normal. Cria o post sempre como
  **rascunho** (`status: "draft"`) — nunca publica direto, pra dar chance de revisão humana antes
  de ir ao ar; se quiser mudar isso, é só o campo `status` em `createWordPressPost()`. O site NÃO
  tem uma taxonomia própria pra "programa" — as categorias do WordPress já misturam tópicos
  genéricos (Humor, Esporte) com nomes de programa específicos (Jornal do Absurdo, Bora Pescar)
  na mesma lista flat; por isso "Categoria" e "Programa" no nosso formulário são só duas seleções
  independentes da MESMA lista de categorias do WP, enviadas juntas em `categories: [id1, id2]`.
  Imagem destacada = thumbnail oficial do YouTube (`i.ytimg.com/vi/{id}/maxresdefault.jpg`) da
  primeira fonte YouTube da notícia, baixada e reenviada pra media library do WP (REST API não
  aceita URL externa direto em `featured_media`, precisa ser um ID de anexo já hospedado lá). Só
  suporta CRIAR um post por notícia — se `article.wordpressUrl` já existe, o botão vira link "Ver
  rascunho" em vez de reenviar (evita duplicar); ainda não tem um fluxo de "atualizar" o post já
  criado.
- **Listagem de vídeos de canal/playlist + geração em lote** (`src/lib/youtubeChannel.ts`,
  `POST /api/youtube/channel-videos`, UI em `src/app/page.tsx`): o usuário cola a URL de um canal
  (`youtube.com/@canal`, `/channel/UC…`) ou playlist, escolhe vídeos da lista (sem Shorts) e gera
  uma notícia por vídeo. Usa a **YouTube Data API** (`YOUTUBE_API_KEY`, cota diária — o erro
  `quotaExceeded` vira mensagem amigável). Sem a chave, a rota responde 400 com mensagem clara.
- **Elementos ricos na matéria** (`src/lib/richBlocks.ts`, `src/components/RichBlocks.tsx`):
  tabela, gráfico, infográficos (números/linha do tempo), citação e box "Você sabia?" opcionais,
  escolhidos no formulário. Ficam dentro do JSON de cada seção (`section.blocks`), sem coluna
  nova; o arquivo é "puro" (sem imports de servidor) pra servir client, geração, render e
  publicação no WordPress (`blocksToHtml`). `reviseArticle.ts` preserva `blocks`.
- **Fonte do tipo "prompt"** (`promptSource()` em `src/lib/sources.ts`, até `MAX_PROMPT_LENGTH`
  = 4000 caracteres): a notícia pode ser gerada só de um texto livre, sozinho ou junto de links.
  Com só prompt, o sistema proíbe inventar fatos e uma checagem em código descarta citações e
  números que não estejam literalmente no texto do usuário (e o box "Você sabia?").
- **Vídeo de referência embutido** (`src/lib/videoEmbed.ts`, flag `embedVideo` no POST de geração):
  incorpora o player do YouTube na notícia e no rascunho do WordPress (iframe 16:9, máx. 770px).
- **Deploy**: o projeto Vercel `fqd-newsgen` está conectado ao GitHub — todo push na `main` gera
  deploy de produção automático (pushes em outros branches geram preview, que hoje só tem
  `BLOB_READ_WRITE_TOKEN` configurado). Migrations de banco NÃO rodam sozinhas no deploy: se o
  commit traz migration nova, rode `npx prisma migrate deploy` contra o banco de produção.
- `src/lib/reviseArticle.ts` — fluxo "Pedir ajuste à IA": edita a MESMA notícia em vigor, nunca
  cria uma nova
- `src/lib/generateImages.ts` — wrapper da Images API da OpenRouter
- `src/lib/instructionProfiles.ts` + `src/lib/styleguide.ts` — perfis de instrução por destino e
  extração de cor/contexto do styleguide enviado
- `src/lib/openrouter.ts` — client + `extractCompletionText` (ver armadilha #5)
- `src/lib/settings.ts` — modelos padrão globais (linha única `Settings`)
- Rotas: `/api/generate` (criar), `/api/articles/[id]` (PATCH edição inline + remover imagem,
  DELETE), `/api/articles` (DELETE em massa), `/api/articles/[id]/revise`, `/api/profiles*`,
  `/api/profiles/[id]/styleguide`, `/api/settings`, `/api/models` (proxy do catálogo da
  OpenRouter)
- Páginas: `/` (home, form multi-fonte), `/noticia/[id]` (visualizar/editar), `/noticias`
  (histórico paginado + seleção em massa), `/configuracoes` (settings + perfis)
- `src/components/EditableText.tsx`, `RemovableImage.tsx`, `ModelPicker.tsx`,
  `ProfileCard.tsx`/`ProfileManager.tsx`, `HistoryList.tsx`, `InstagramPostCard.tsx`

`Article.sources` e `Article.sections` são JSON-em-string (não tabelas relacionais) — decisão
deliberada de simplicidade, mantida assim de propósito.

## Comandos

```bash
npm run dev                 # servidor de dev (usar preview_start com o nome "portal-noticias-ia"
                             # definido em ../.claude/launch.json, não rodar via Bash)
npx prisma generate         # regenerar client depois de mudar schema
npx prisma migrate deploy   # aplicar migrations pendentes (não-interativo)
npx next typegen            # regenerar tipos de rota depois de mudar rotas/searchParams
npx tsc --noEmit            # type-check
npx eslint .                # lint
```

Antes de considerar qualquer tarefa concluída: rodar `typegen` (se mexeu em rotas), `tsc` e
`eslint`, e testar de verdade no navegador (este projeto tem preview configurado).

## Variáveis de ambiente

Copiar `.env.example` para `.env` e preencher: `DATABASE_URL` (Postgres), `BLOB_READ_WRITE_TOKEN`
(Vercel Blob) e `OPENROUTER_API_KEY` são obrigatórias. `OPENROUTER_TEXT_MODEL`/
`OPENROUTER_IMAGE_MODEL` são opcionais. `RESIDENTIAL_PROXY_HOST`/`_PORT`/`_USER`/`_PASSWORD` são
opcionais em dev local (cai pra fetch direto sem elas) mas **obrigatórias em produção** pra
extração de transcrição do YouTube funcionar (ver armadilha #14). `WORDPRESS_URL`/
`WORDPRESS_USERNAME`/`WORDPRESS_APP_PASSWORD` são opcionais — sem elas, o botão "Enviar para o
Portal" aparece mas dá erro ao tentar enviar. `WORDPRESS_APP_PASSWORD` é a Senha de Aplicativo
(Usuários → Perfil → Senhas de Aplicativo no wp-admin), nunca a senha de login normal.
`YOUTUBE_API_KEY` (YouTube Data API v3) é necessária só pra listar vídeos de canal/playlist;
sem ela o resto do app funciona normalmente.

@AGENTS.md

# FQD News GEN

Protótipo Next.js que transforma vídeos do YouTube e/ou páginas da web em notícias completas
geradas por IA (título, subtítulos, texto, imagens e post de Instagram), com edição inline,
histórico paginado, perfis de instrução por "destino" (tom/estilo) e extração de paleta de
cores a partir de um styleguide (PDF/imagem/SVG) por perfil.

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

6. **Geração de imagem por IA não sabe escrever texto/logo direito.** Nunca inclua "banner",
   "graphic", "poster", "thumbnail" nos prompts de imagem nem peça texto/logo dentro da imagem —
   isso induz o modelo a tentar desenhar texto e sair com erro de ortografia. Sempre enquadrar
   como fotografia realista pura. Isso já é reforçado nas instruções fixas em
   `src/lib/generateArticle.ts` e `src/lib/reviseArticle.ts` — não remover essa regra.

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

11. **Identidade visual**: tema escuro único (sem light mode), tokens de cor como CSS vars em
    `globals.css` (`--background #121214`, `--accent-yellow #FFD02A`, etc.), fonte Poppins —
    replicado do site real da FQD Studios (não confundir com a paleta roxa antiga do repo local
    `fqd-studios`, que está desatualizada).

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

## Onde as coisas ficam

- `src/lib/prisma.ts` — client Prisma (singleton + driver adapter)
- `src/lib/sources.ts`, `youtube.ts`, `webpage.ts` — busca de conteúdo multi-fonte (YouTube
  transcript e/ou página via Readability), `MAX_SOURCES = 5`
- `src/lib/generateArticle.ts` + `src/lib/prompts.ts` — geração da matéria + post de Instagram
  (uma chamada de IA só); `DEFAULT_ARTICLE_PROMPT` é a instrução neutra padrão
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

Copiar `.env.example` para `.env` e preencher `OPENROUTER_API_KEY` (obrigatória, pega em
https://openrouter.ai/keys). `OPENROUTER_TEXT_MODEL`/`OPENROUTER_IMAGE_MODEL` são opcionais.

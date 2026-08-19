# FQD News GEN

Protótipo que transforma vídeos do YouTube e/ou páginas da web em notícias completas geradas
por IA — título, subtítulos, texto, imagens de capa/seção e um post pronto para Instagram —
com edição inline direto na página, histórico com busca/paginação e perfis de instrução por
"destino" (tom técnico, humor, etc.) que podem incluir um styleguide de marca para influenciar
as cores das imagens geradas.

## Funcionalidades

- Geração de notícia a partir de **múltiplas fontes** (até 5), misturando vídeos do YouTube e
  páginas comuns (extração de conteúdo via Readability)
- Título, subtítulos, texto por seção e imagens geradas por IA (OpenRouter)
- Post de Instagram sugerido (legenda + imagem quadrada) junto com a matéria
- **Edição inline**: clique em qualquer parágrafo pra editar direto, salva sozinho
- **Pedir ajuste à IA**: peça mudanças em linguagem natural (texto ou imagem) sem gerar notícia nova
- **Perfis de instrução**: crie um tom/estilo por destino e escolha qual usar em cada geração
- **Styleguide por perfil**: envie um PDF/imagem/SVG de marca — o sistema extrai cores e usa
  como guia (sutil) nos prompts de imagem
- Histórico com seleção múltipla, exclusão em massa e paginação (10/50/100)
- Escolha de modelo de IA (texto e imagem) por notícia, ou um padrão global

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4, Prisma 7 + SQLite, OpenRouter para
texto e imagem, `@mozilla/readability` para scraping de páginas, `pdf-parse`/`sharp` para
extração de styleguide.

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha OPENROUTER_API_KEY (https://openrouter.ai/keys)
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Para quem for continuar o desenvolvimento (incluindo sessões do Claude Code), leia
[`CLAUDE.md`](./CLAUDE.md) primeiro — documenta decisões de arquitetura e armadilhas já
resolvidas que não vale a pena redescobrir.

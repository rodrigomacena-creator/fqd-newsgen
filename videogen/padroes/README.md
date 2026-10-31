# Catálogo de padrões de vídeo

Estes são os estilos embutidos (os que têm motor de render próprio em `worker/render/`). Estilos novos são montados pela própria aplicação em /videogen/templates a partir de um vídeo de referência e ficam no banco (tabela VideoTemplate), não aqui. Para produzir um vídeo, escolha um padrão pelo **nome** ou pelo **id** (ex.: "faz no padrão 2" ou `estudio-serif-cinematico`). O pipeline lê o front matter YAML do arquivo do padrão escolhido (formato, paleta, fontes, ritmo, música, CTA) e usa a seção "Dicas de geração" para montar os prompts.

| # | Nome | Id | Tom / quando usar | Ritmo | Arquivo |
|---|------|----|-------------------|-------|---------|
| 1 | Editorial P&B + Vermelho | `editorial-pb-vermelho` | Urgente, polêmico, tech/IA, "ninguém te conta" | Cenas de 1–2s, punch zoom | [01-editorial-pb-vermelho.md](01-editorial-pb-vermelho.md) |
| 2 | Estúdio Serif + Cinemático | `estudio-serif-cinematico` | Calmo, premium, didático; negócios e branding com exemplos de marcas | Cenas de 2–3,5s, fade+blur contínuo | [02-estudio-serif-cinematico.md](02-estudio-serif-cinematico.md) |
| 4 | Papel, Luz e Hera | `papel-hera` | Leve, orgânico, reflexivo | Frases de 2–3s, sem troca de fundo | [04-papel-hera.md](04-papel-hera.md) |

## Comparação rápida
| | Padrão 1 | Padrão 2 |
|---|---|---|
| Fundo | Papel quadriculado P&B | Cinza-claro radial e vídeo em tela cheia |
| Cor | Só vermelho | Cor nos objetos reais, resto neutro |
| Fonte | Sans black + serif itálico | Serif itálico (Playfair), pesos mistos |
| Legenda | Palavra por palavra (pop) | Letra por letra (fade+blur) |
| Transição | Punch zoom + blur | Sem cortes; dissolve para o vídeo |
| Música | Drone tenso + whooshes | Lo-fi/corporate suave contínua |
| CTA | "comenta PALAVRA" / URL | "Siga PERFIL" + logo |

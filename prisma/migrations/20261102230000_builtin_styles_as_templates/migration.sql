-- Os três estilos embutidos viram templates do motor genérico (os embutidos continuam só para vídeos antigos).
INSERT INTO "VideoTemplate" ("id", "name", "referenceUrl", "notes", "status", "progress", "spec", "summary", "guide", "sampleUrl", "finishedAt", "createdAt", "updatedAt")
VALUES ('tpl-editorial-pb-vermelho', 'Editorial P&B + Vermelho', '/videogen/exemplos/tpl-editorial-pb-vermelho.mp4', 'Recriado a partir do estilo embutido editorial-pb-vermelho.', 'ready', 100, '{"palette":{"background":"#F2F0EA","text":"#111111","accent":"#E10600","accentText":"#FFFFFF"},"background":{"kind":"texture","color2":"#DDDDDD","texturePrompt":"","textureUrl":"asset:papel_grade.jpg"},"image":{"layout":"fullbleed","filter":"bw","motion":"push_in","scale":1,"y":0.5,"cornerRadius":0,"shadow":false,"borderColor":"","borderWidth":0,"photo":false},"caption":{"enabled":true,"font":"inter-black","size":92,"uppercase":true,"color":"#111111","stroke":"","strokeWidth":0,"y":0.8,"animation":"word_pop","highlight":"box","maxWordsPerLine":3,"box":false,"boxColor":"#000000"},"title":{"enabled":true,"font":"playfair-black-italic","size":92,"uppercase":false,"color":"#E10600","stroke":"","strokeWidth":0,"y":0.12,"animation":"pop","box":false,"boxColor":"#000000"},"transition":{"kind":"punch_zoom","durationS":0.22},"overlay":{"grain":0.45,"vignette":0.4,"tint":"","tintStrength":0,"letterbox":false},"cta":{"style":"card","background":"#E10600","color":"#FFFFFF","font":"inter-black"},"motion":{"energy":"high","camera":"shake_on_beat","particles":"none","beatPulse":true,"textIdle":"none","textExit":true}}', '{"tom":"Urgente, polêmico, tech/IA, \"ninguém te conta\"","ritmo":"Cenas de 1–2s, punch zoom","cenaS":[1,2],"semNarracao":false,"cta":"comenta <PALAVRA> (estilo DM-keyword) ou URL"}', '# Editorial P&B + Vermelho

Tom de reportagem urgente, "o que ninguém te conta". Bom para tecnologia, IA, alertas e temas polêmicos.

## Roteiro
- Frases curtas e diretas, uma ideia por cena, cenas de 1 a 2 segundos.
- onScreen com 1 a 3 palavras fortes (aparece em serif itálico vermelho no topo).
- Destaque no máximo 2 palavras-chave por vídeo (vão em caixa vermelha na legenda).
- Cada cena mostra um único objeto concreto que represente a ideia (lupa, celular, megafone, mão, relógio...).
- Direção por cena (campo "direction") sempre preenchida: o render faz os cortes, a câmera, o recorte do objeto e os traços à mão na cor de destaque. Por isso o imagePrompt nunca pede setas, círculos, marcações nem texto.
- CTA no formato "Comenta PALAVRA" ou com o site/@ cadastrado.

## Estilo das imagens (acrescente ao fim de todo imagePrompt)
Editorial collage style: a single black-and-white photographic cutout object with a thin white sticker border and soft drop shadow, centered on off-white grid paper. High contrast monochrome, film grain. Pure black and white only: no red, no marker strokes, no arrows. No text, no letters. One clearly separated object in the middle, empty space at top and bottom.

## Trilha
musicPrompt de referência: dark minimal electronic pulse, tense documentary underscore, low drone, subtle ticking, no vocals', '/videogen/exemplos/tpl-editorial-pb-vermelho.mp4', '2026-10-31 00:00:00', '2026-10-31 00:00:00', '2026-10-31 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "VideoTemplate" ("id", "name", "referenceUrl", "notes", "status", "progress", "spec", "summary", "guide", "sampleUrl", "finishedAt", "createdAt", "updatedAt")
VALUES ('tpl-estudio-serif-cinematico', 'Estúdio Serif + Cinemático', '/videogen/exemplos/tpl-estudio-serif-cinematico.mp4', 'Recriado a partir do estilo embutido estudio-serif-cinematico.', 'ready', 100, '{"palette":{"background":"#F0F0F0","text":"#1A1A1A","accent":"#B5543A","accentText":"#FFFFFF"},"background":{"kind":"texture","color2":"#D3D3D3","texturePrompt":"","textureUrl":"asset:estudio_bg.jpg"},"image":{"layout":"card","filter":"none","motion":"drift","scale":0.68,"y":0.56,"cornerRadius":40,"shadow":true,"borderColor":"","borderWidth":0,"photo":false},"caption":{"enabled":true,"font":"playfair-italic","size":80,"uppercase":false,"color":"#1A1A1A","stroke":"","strokeWidth":0,"y":0.86,"animation":"word_reveal","highlight":"color","maxWordsPerLine":4,"box":false,"boxColor":"#000000"},"title":{"enabled":true,"font":"playfair-black-italic","size":110,"uppercase":false,"color":"#1A1A1A","stroke":"","strokeWidth":0,"y":0.2,"animation":"blur_in","box":false,"boxColor":"#000000"},"transition":{"kind":"crossfade","durationS":0.5},"overlay":{"grain":0.1,"vignette":0.35,"tint":"","tintStrength":0,"letterbox":false},"cta":{"style":"card","background":"#1A1A1A","color":"#FFFFFF","font":"playfair-black-italic"},"motion":{"energy":"calm","camera":"none","particles":"bokeh","beatPulse":false,"textIdle":"float","textExit":true}}', '{"tom":"Calmo, premium, didático; negócios e branding com exemplos de marcas","ritmo":"Cenas de 2–3,5s, fade+blur contínuo","cenaS":[2,3.5],"semNarracao":false,"cta":"Siga <PERFIL> para mais dicas de <TEMA>, com logo da marca"}', '# Estúdio Serif + Cinemático

Calmo, premium e didático. Bom para negócios, branding e explicações com exemplos de produtos e marcas.

## Roteiro
- Frases médias e tranquilas, cenas de 2 a 3,5 segundos.
- onScreen com 1 a 3 palavras elegantes (título em serif itálico preto).
- Destaque 1 ou 2 palavras-chave por vídeo (ficam na cor terracota na legenda).
- Cada cena mostra um objeto real e colorido que exemplifique a ideia (produto, embalagem, ferramenta), flutuando inclinado.
- Direção por cena (campo "direction") sempre preenchida: o render faz os cortes, a câmera, o recorte do objeto e os traços à mão na cor de destaque. Por isso o imagePrompt nunca pede setas, círculos, marcações nem texto.
- CTA "Siga para mais dicas de <tema>" ou com o @/site cadastrado.

## Estilo das imagens (acrescente ao fim de todo imagePrompt)
Clean studio product shot on a light gray seamless background with soft radial light, one real colorful object floating tilted about 25 degrees, soft drop shadow, premium commercial look. No text, no letters, no logos.

## Trilha
musicPrompt de referência: soft lo-fi corporate piano with light beat, warm and calm, no vocals', '/videogen/exemplos/tpl-estudio-serif-cinematico.mp4', '2026-10-31 01:00:00', '2026-10-31 01:00:00', '2026-10-31 01:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "VideoTemplate" ("id", "name", "referenceUrl", "notes", "status", "progress", "spec", "summary", "guide", "sampleUrl", "finishedAt", "createdAt", "updatedAt")
VALUES ('tpl-papel-hera', 'Papel, Luz e Hera', '/videogen/exemplos/tpl-papel-hera.mp4', 'Recriado a partir do estilo embutido papel-hera.', 'ready', 100, '{"palette":{"background":"#EADFD3","text":"#1D1D1B","accent":"#E8434F","accentText":"#FFFFFF"},"background":{"kind":"texture","color2":"#D9CBBB","texturePrompt":"","textureUrl":"asset:papel_hera_bg.jpg"},"image":{"layout":"none","filter":"warm","motion":"drift","scale":0.6,"y":0.5,"cornerRadius":12,"shadow":true,"borderColor":"","borderWidth":0,"photo":false},"caption":{"enabled":true,"font":"great-vibes","size":96,"uppercase":false,"color":"#E8434F","stroke":"","strokeWidth":0,"y":0.62,"animation":"line_fade","highlight":"none","maxWordsPerLine":3,"box":false,"boxColor":"#000000"},"title":{"enabled":true,"font":"bebas-neue","size":170,"uppercase":true,"color":"#1D1D1B","stroke":"","strokeWidth":0,"y":0.44,"animation":"blur_in","box":false,"boxColor":"#000000"},"transition":{"kind":"crossfade","durationS":0.6},"overlay":{"grain":0.15,"vignette":0.25,"tint":"#F3C892","tintStrength":0.06,"letterbox":false},"cta":{"style":"fullscreen","background":"#EADFD3","color":"#1D1D1B","font":"bebas-neue"},"motion":{"energy":"calm","camera":"none","particles":"dust","beatPulse":false,"textIdle":"float","textExit":true}}', '{"tom":"Leve, orgânico, reflexivo","ritmo":"Frases de 2–3s, sem troca de fundo","cenaS":[2,3],"semNarracao":false,"cta":"Logo da marca centralizado com o nome, sobre o mesmo papel"}', '# Papel, Luz e Hera

Leve, orgânico e reflexivo. Só tipografia sobre papel creme com luz de janela e ramos de hera; não tem imagens.

## Roteiro
- Frases de 2 a 3 segundos, cada uma uma ideia completa e simples.
- onScreen com 1 a 3 palavras (título grande em letras condensadas no meio da tela); a fala aparece embaixo em letra cursiva.
- Destaque 1 palavra-chave por vídeo.
- Deixe o imagePrompt vazio em todas as cenas: este estilo não usa imagem.
- Direção por cena (campo "direction") pode ser preenchida normalmente; o objeto é ignorado porque não há imagem.
- CTA curto com o nome da marca/site cadastrado ou "Siga para mais".

## Trilha
musicPrompt de referência: light acoustic guitar and soft piano, morning feeling, warm and gentle, no vocals', '/videogen/exemplos/tpl-papel-hera.mp4', '2026-10-31 02:00:00', '2026-10-31 02:00:00', '2026-10-31 02:00:00')
ON CONFLICT ("id") DO NOTHING;


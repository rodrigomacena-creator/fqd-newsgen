# Worker de render do VideoGen

O app na Vercel gera roteiro e narração, mas não consegue renderizar vídeo (limite de tempo e
sem ffmpeg). Este worker roda numa VPS, pega os vídeos que estão "Na fila de render", gera as
imagens das cenas (OpenRouter, nano banana) e a trilha (ElevenLabs Music), monta o vídeo no
estilo do padrão, mixa com a narração e sobe o mp4 no Vercel Blob. A página do vídeo mostra o
progresso e o player quando termina.

```
App (Vercel)                         Worker (VPS)
POST /api/videogen/worker/claim  ◄── pede um job a cada 10s
                                 ──► job (roteiro, narração, tempos das palavras)
                                     gera imagens + trilha, renderiza, mixa
POST .../jobs/:id {progress}     ◄── progresso
POST .../jobs/:id/upload-token   ◄── token de upload só para este mp4
                                     sobe o mp4 direto no Blob (upload.mjs)
POST .../jobs/:id {status:done}  ◄── fim
```

Padrões com render pronto: `editorial-pb-vermelho` (1), `estudio-serif-cinematico` (2) e `papel-hera` (4, fundo fixo, não gera imagens por cena). Os outros entram em
`render/<id>.py` + `render/__init__.py` e em `RENDERABLE_PATTERNS` (`src/lib/videogen/types.ts`).

## Instalação na VPS (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y git python3 python3-venv ffmpeg fonts-inter fonts-liberation nodejs npm
sudo useradd -r -m -d /opt/fqd-newsgen videogen   # usuário só para o worker

sudo -u videogen git clone https://github.com/rodrigomacena-creator/fqd-newsgen /opt/fqd-newsgen
cd /opt/fqd-newsgen/worker
sudo -u videogen python3 -m venv .venv
sudo -u videogen .venv/bin/pip install -r requirements.txt
sudo -u videogen npm install

sudo -u videogen cp .env.example .env
sudo -u videogen nano .env          # preencher (veja abaixo)
```

O repositório é privado: para o `git clone` use um token de acesso do GitHub
(`https://<token>@github.com/...`) ou uma deploy key.

No `.env` do worker:

- `VIDEOGEN_APP_URL`: URL de produção do NewsGen.
- `VIDEOGEN_WORKER_TOKEN`: um segredo longo (`openssl rand -hex 32`). **O mesmo valor** vai na
  Vercel como variável `VIDEOGEN_WORKER_TOKEN`.
- `OPENROUTER_API_KEY` e `ELEVENLABS_API_KEY`: as mesmas chaves do app.

Confira se as fontes existem (o render usa as duas):

```bash
ls /usr/share/fonts/opentype/inter/InterDisplay-Black.otf \
   /usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf
```

Se o caminho for outro na sua distro, ajuste `VIDEOGEN_FONT_SANS` / `VIDEOGEN_FONT_SERIF` no `.env`.

### Testar uma vez e deixar rodando

```bash
sudo -u videogen .venv/bin/python worker.py --once   # processa um job da fila (se houver) e sai

sudo cp videogen-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now videogen-worker
journalctl -u videogen-worker -f                      # acompanhar
```

### Atualizar

```bash
cd /opt/fqd-newsgen && sudo -u videogen git pull
sudo systemctl restart videogen-worker
```

## Render local sem o app

Para testar um renderizador com um job salvo (o JSON de `GET /api/videogen/jobs/:id`):

```bash
python3 worker.py --job-file job.json --out teste.mp4
```

## Custos e tempos (medidos)

- Um vídeo de 20s com 9 cenas: ~3 min numa máquina de 4 vCPUs, ~27 MB.
- Imagens: ~US$ 0,036 cada no nano banana (9 cenas ≈ US$ 0,32). Trilha: créditos do ElevenLabs.
- Um job "Renderizando" sem notícia do worker por 20 min volta sozinho para a fila.

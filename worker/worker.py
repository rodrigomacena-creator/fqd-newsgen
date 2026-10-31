#!/usr/bin/env python3
"""Worker de render do VideoGen (roda na VPS, fora da Vercel).

Loop: pede um job ao app (POST /api/videogen/worker/claim), gera as imagens das cenas
(OpenRouter, nano banana), a trilha (ElevenLabs Music), baixa a narração, renderiza o
vídeo no estilo do padrão, mixa o áudio, sobe o mp4 no Vercel Blob e avisa o app.

Uso:
  python3 worker.py                 # loop infinito (o que o systemd roda)
  python3 worker.py --once          # processa no máximo um job e sai
  python3 worker.py --job-file j.json --out teste.mp4   # render local de um job salvo, sem o app
"""
import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from render import RENDERERS
from render.common import mix
from render.timeline import build_timeline

HERE = Path(__file__).resolve().parent


def load_env_file(path):
    """Carrega KEY="valor" de um .env simples (sem sobrescrever o ambiente)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(HERE / ".env")

APP_URL = os.environ.get("VIDEOGEN_APP_URL", "").rstrip("/")
WORKER_TOKEN = os.environ.get("VIDEOGEN_WORKER_TOKEN", "")
IMAGE_MODEL = os.environ.get("VIDEOGEN_IMAGE_MODEL", "google/gemini-nano-banana-2.1")
POLL_SECONDS = float(os.environ.get("VIDEOGEN_POLL_SECONDS", "10"))
WORKDIR = Path(os.environ.get("VIDEOGEN_WORKDIR", tempfile.gettempdir())) / "videogen-worker"


def log(*args):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *args, flush=True)


class JobGone(Exception):
    """O job foi excluído ou tirado do render no app enquanto o worker trabalhava."""


class App:
    def __init__(self):
        if not APP_URL or not WORKER_TOKEN:
            sys.exit("Configure VIDEOGEN_APP_URL e VIDEOGEN_WORKER_TOKEN (veja worker/.env.example).")
        self.s = requests.Session()
        self.s.headers["Authorization"] = f"Bearer {WORKER_TOKEN}"

    def _post(self, path, payload=None, timeout=60):
        r = self.s.post(f"{APP_URL}{path}", json=payload or {}, timeout=timeout)
        if r.status_code in (404, 409):
            raise JobGone(r.json().get("error", r.text))
        if r.status_code >= 400:
            raise RuntimeError(f"{path}: HTTP {r.status_code} {r.text[:300]}")
        return r.json()

    def claim(self):
        return self._post("/api/videogen/worker/claim")

    def progress(self, job_id, value):
        try:
            self._post(f"/api/videogen/worker/jobs/{job_id}", {"progress": int(value)}, timeout=20)
        except JobGone:
            raise
        except Exception as e:  # progresso é só informativo
            log("aviso: progresso não enviado:", e)

    def done(self, job_id, url):
        self._post(f"/api/videogen/worker/jobs/{job_id}", {"status": "done", "videoUrl": url})

    def failed(self, job_id, error):
        try:
            self._post(f"/api/videogen/worker/jobs/{job_id}", {"status": "failed", "error": error})
        except Exception as e:
            log("aviso: não consegui marcar como falho:", e)

    def upload_token(self, job_id):
        return self._post(f"/api/videogen/worker/jobs/{job_id}/upload-token")


# ---------- geração de assets ----------

def generate_image(prompt, out_path, attempts=2):
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY não configurada no worker.")
    last = ""
    for _ in range(attempts):
        try:
            r = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "X-Title": "FQD News GEN - VideoGen"},
                json={
                    "model": IMAGE_MODEL,
                    "modalities": ["image", "text"],
                    "image_config": {"aspect_ratio": "9:16"},
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=240,
            )
            data = r.json()
            url = data["choices"][0]["message"]["images"][0]["image_url"]["url"]
            out_path.write_bytes(base64.b64decode(url.split(",", 1)[1]))
            return out_path
        except Exception:
            last = r.text[:200] if "r" in locals() else "sem resposta"
    raise RuntimeError(f"imagem falhou: {last}")


def generate_music(prompt, seconds, out_path):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY não configurada no worker.")
    prompt = (prompt or "Dark minimal electronic underscore, tense, subtle pulse").strip()
    if "no vocals" not in prompt.lower():
        prompt = "Instrumental only, no vocals. " + prompt
    r = requests.post(
        "https://api.elevenlabs.io/v1/music",
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        json={"prompt": prompt, "music_length_ms": int(max(10, seconds + 2) * 1000), "model_id": "music_v1"},
        timeout=300,
    )
    if r.status_code != 200:
        raise RuntimeError(f"trilha falhou: HTTP {r.status_code} {r.text[:200]}")
    out_path.write_bytes(r.content)
    return out_path


def download(url, out_path):
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    out_path.write_bytes(r.content)
    return out_path


def silent_audio(seconds, out_path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                    "-t", str(seconds), str(out_path)], check=True)
    return out_path


# ---------- pipeline ----------

REUSE_ASSETS = False  # --reuse: em teste local, reaproveita imagens/trilha já geradas no workdir


def produce(job, workdir, report=lambda p: None):
    """Gera assets, renderiza e mixa. Devolve o caminho do mp4 final."""
    module = RENDERERS.get(job["patternId"])
    if not module:
        raise RuntimeError(f'O worker ainda não sabe renderizar o padrão "{job["patternId"]}".')
    script = job.get("script") or {}
    scenes = script.get("scenes") or []
    if not scenes:
        raise RuntimeError("O roteiro não tem cenas.")

    tl = build_timeline(script, job.get("narrationWords"))
    workdir.mkdir(parents=True, exist_ok=True)
    report(5)

    narration = None
    if job.get("narrationUrl"):
        narration = download(job["narrationUrl"], workdir / "narracao.mp3")

    # imagens das cenas em paralelo + trilha ao mesmo tempo
    images = {}
    used = {s.index for s in tl.scenes} if getattr(module, "USES_SCENE_IMAGES", True) else set()
    def cached(fn, path, *a):
        return path if REUSE_ASSETS and path.exists() else fn(*a, path)

    with ThreadPoolExecutor(5) as ex:
        music_f = ex.submit(cached, generate_music, workdir / "trilha.mp3", script.get("musicPrompt"), tl.duration)
        futs = {
            i: ex.submit(cached, generate_image, workdir / f"cena_{i:02d}.jpg", sc.get("imagePrompt") or sc.get("visual") or "")
            for i, sc in enumerate(scenes) if i in used
        }
        done_count = 0
        for i, f in futs.items():
            try:
                images[i] = f.result()
            except Exception as e:
                log(f"cena {i + 1}: {e} (vai com fundo liso)")
            done_count += 1
            report(5 + 40 * done_count / max(len(futs), 1))
        if not images and futs:
            raise RuntimeError("Nenhuma imagem de cena foi gerada (OpenRouter).")
        try:
            music = music_f.result()
        except Exception as e:
            log(f"{e} (segue sem trilha)")
            music = silent_audio(tl.duration + 1, workdir / "trilha.mp3")
    report(50)

    video_only = workdir / "video_only.mp4"
    duration = module.render(job, {"images": images}, str(video_only), on_progress=lambda p: report(50 + 40 * p))
    report(92)

    final = workdir / "video.mp4"
    mix(str(video_only), str(narration) if narration else None, str(music), duration, str(final))
    return final


def upload(app, job_id, path):
    tok = app.upload_token(job_id)
    out = subprocess.run(["node", str(HERE / "upload.mjs"), str(path), tok["pathname"], tok["clientToken"]],
                         capture_output=True, text=True, cwd=HERE, timeout=900)
    if out.returncode != 0:
        raise RuntimeError(f"upload no Blob falhou: {out.stderr.strip()[:400]}")
    return json.loads(out.stdout.strip().splitlines()[-1])["url"]


def process(app, job):
    job_id = job["id"]
    workdir = WORKDIR / job_id
    log(f"job {job_id}: padrão {job['patternId']}, {job['durationS']}s — {job.get('topic', '')[:60]}")
    last = {"t": 0.0}

    def report(p):
        now = time.time()
        if now - last["t"] >= 3 or p >= 90:
            last["t"] = now
            app.progress(job_id, p)

    try:
        final = produce(job, workdir, report)
        app.progress(job_id, 95)
        url = upload(app, job_id, final)
        app.done(job_id, url)
        log(f"job {job_id}: pronto {url}")
    except JobGone as e:
        log(f"job {job_id}: descartado ({e})")
    except Exception as e:
        traceback.print_exc()
        app.failed(job_id, str(e))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="processa no máximo um job e sai")
    ap.add_argument("--job-file", help="render local de um job em JSON (formato da API), sem o app")
    ap.add_argument("--out", default="video.mp4", help="saída do --job-file")
    ap.add_argument("--reuse", action="store_true", help="com --job-file: reaproveita imagens e trilha já geradas")
    args = ap.parse_args()
    global REUSE_ASSETS
    REUSE_ASSETS = args.reuse

    if args.job_file:
        job = json.loads(Path(args.job_file).read_text(encoding="utf-8"))
        job = job.get("job", job)
        workdir = WORKDIR / f"local-{job.get('id', 'job')}"
        final = produce(job, workdir, lambda p: log(f"{p:.0f}%"))
        shutil.copy(final, args.out)
        log("ok", args.out)
        return

    app = App()
    log(f"worker iniciado → {APP_URL}")
    while True:
        try:
            res = app.claim()
        except Exception as e:
            log("erro ao pedir job:", e)
            res = {"job": None}
        if res.get("job"):
            process(app, res["job"])
            continue
        if args.once:
            return
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()

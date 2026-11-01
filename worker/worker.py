#!/usr/bin/env python3
"""Worker de render do VideoGen (roda na VPS, fora da Vercel).

Loop: pede um job ao app (POST /api/videogen/worker/claim), gera as imagens das cenas
(OpenRouter, nano banana), a trilha (ElevenLabs Music), baixa a narração, renderiza o
vídeo no estilo do padrão, mixa o áudio, sobe o mp4 no Vercel Blob e avisa o app.
Sem vídeo na fila, pede um template para montar (template_builder.py): analisa o vídeo de
referência com IA e gera um exemplo de 5s com o motor genérico (render/template_engine.py).

Uso:
  python3 worker.py                 # loop infinito (o que o systemd roda)
  python3 worker.py --once          # processa no máximo um job e sai
  python3 worker.py --job-file j.json --out teste.mp4   # render local de um job salvo, sem o app
  python3 worker.py --template-video ref.mp4 --out pasta/   # monta um template local, sem o app
"""
import argparse
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

from providers import download, generate_image, generate_music, prepare_user_image, silent_audio
from render import RENDERERS, template_engine
from render.common import mix, overlay_logo
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
POLL_SECONDS = float(os.environ.get("VIDEOGEN_POLL_SECONDS", "10"))
WORKDIR = Path(os.environ.get("VIDEOGEN_WORKDIR", tempfile.gettempdir())) / "videogen-worker"


def log(*args):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *args, flush=True)


class JobGone(Exception):
    """O job foi excluído ou tirado do render no app enquanto o worker trabalhava."""


def merge_costs(costs):
    """Soma os gastos por etapa (uma linha para todas as imagens, outra para a trilha)."""
    out = {}
    for c in costs or []:
        key = (c["step"], c["provider"])
        m = out.setdefault(key, {"step": c["step"], "provider": c["provider"]})
        for k in ("usd", "credits"):
            if k in c:
                m[k] = round(m.get(k, 0) + c[k], 6)
        if c.get("estimated"):
            m["estimated"] = True
    return list(out.values())


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

    def done(self, job_id, url, costs=None):
        self._post(f"/api/videogen/worker/jobs/{job_id}", {"status": "done", "videoUrl": url, "costs": merge_costs(costs)})

    def failed(self, job_id, error, costs=None):
        try:
            self._post(f"/api/videogen/worker/jobs/{job_id}", {"status": "failed", "error": error, "costs": merge_costs(costs)})
        except Exception as e:
            log("aviso: não consegui marcar como falho:", e)

    def upload_token(self, job_id):
        return self._post(f"/api/videogen/worker/jobs/{job_id}/upload-token")

    # templates (montados a partir de um vídeo de referência)
    def claim_template(self):
        return self._post("/api/videogen/worker/templates/claim")

    def template_update(self, template_id, payload, timeout=60):
        return self._post(f"/api/videogen/worker/templates/{template_id}", payload, timeout=timeout)

    def template_upload_token(self, template_id, kind):
        return self._post(f"/api/videogen/worker/templates/{template_id}/upload-token", {"file": kind})


# ---------- pipeline ----------

REUSE_ASSETS = False  # --reuse: em teste local, reaproveita imagens/trilha já geradas no workdir


def produce(job, workdir, report=lambda p: None, costs=None):
    """Gera assets, renderiza e mixa. Devolve o caminho do mp4 final."""
    module = RENDERERS.get(job["patternId"])
    if not module and job.get("templateSpec"):
        module = template_engine  # template montado pela aplicação: motor genérico + ficha de estilo
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
        return path if REUSE_ASSETS and path.exists() else fn(*a, path, costs=costs)

    def scene_image(i, sc):
        """Foto do usuário (briefing) quando a cena tem imageUrl; senão gera com IA."""
        path = workdir / f"cena_{i:02d}.jpg"
        if sc.get("imageUrl"):
            try:
                return prepare_user_image(sc["imageUrl"], path)
            except Exception as e:
                if not (sc.get("imagePrompt") or sc.get("visual")):
                    raise
                log(f"cena {i + 1}: foto do usuário falhou ({e}); gerando com IA")
        return cached(generate_image, path, sc.get("imagePrompt") or sc.get("visual") or "")

    with ThreadPoolExecutor(5) as ex:
        music_f = ex.submit(cached, generate_music, workdir / "trilha.mp3", script.get("musicPrompt"), tl.duration)
        futs = {
            i: ex.submit(scene_image, i, sc)
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
    extra = {}
    if module is template_engine:
        extra["spec"] = job["templateSpec"]
        texture_url = ((job["templateSpec"] or {}).get("background") or {}).get("textureUrl")
        if texture_url:
            extra["texture"] = download(texture_url, workdir / "textura.jpg")
    duration = module.render(job, {"images": images, **extra}, str(video_only), on_progress=lambda p: report(50 + 40 * p))
    report(91)

    logo_url = (job.get("brand") or {}).get("logoUrl")
    if logo_url:
        try:
            ext = Path(logo_url.split("?")[0]).suffix.lower() or ".png"
            logo = download(logo_url, workdir / f"logo{ext}")
            branded = workdir / "video_logo.mp4"
            overlay_logo(str(video_only), str(logo), tl.cta_start, duration, str(branded))
            video_only = branded
        except Exception as e:
            log(f"logo da empresa: {e} (segue sem logo)")
    report(93)

    final = workdir / "video.mp4"
    mix(str(video_only), str(narration) if narration else None, str(music), duration, str(final))
    return final


def upload(app, job_id, path, tok=None):
    tok = tok or app.upload_token(job_id)
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

    costs = []  # imagens (custo da OpenRouter) e trilha (créditos estimados), enviados no fim
    try:
        final = produce(job, workdir, report, costs)
        app.progress(job_id, 95)
        url = upload(app, job_id, final)
        app.done(job_id, url, costs)
        log(f"job {job_id}: pronto {url}")
    except JobGone as e:
        log(f"job {job_id}: descartado ({e})")
    except Exception as e:
        traceback.print_exc()
        app.failed(job_id, str(e), costs)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def process_template(app, template):
    import template_builder

    tid = template["id"]
    workdir = WORKDIR / f"template-{tid}"
    log(f"template {tid}: montando \"{template.get('name', '')[:60]}\"")
    last = {"t": 0.0}

    def report(p):
        now = time.time()
        if now - last["t"] >= 3 or p >= 90:
            last["t"] = now
            try:
                app.template_update(tid, {"progress": int(p)}, timeout=20)
            except JobGone:
                raise
            except Exception as e:
                log("aviso: progresso não enviado:", e)

    def blob_upload(path, kind):
        return upload(app, tid, path, app.template_upload_token(tid, kind))

    costs = []
    try:
        result = template_builder.build(template, workdir, report, costs, blob_upload)
        app.template_update(tid, {"status": "ready", **result, "costs": merge_costs(costs)})
        log(f"template {tid}: pronto {result['sampleUrl']}")
    except JobGone as e:
        log(f"template {tid}: descartado ({e})")
    except Exception as e:
        traceback.print_exc()
        try:
            app.template_update(tid, {"status": "failed", "error": str(e)[:900], "costs": merge_costs(costs)})
        except Exception as e2:
            log("aviso: não consegui marcar o template como falho:", e2)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="processa no máximo um job e sai")
    ap.add_argument("--job-file", help="render local de um job em JSON (formato da API), sem o app")
    ap.add_argument("--out", default="video.mp4", help="saída do --job-file")
    ap.add_argument("--reuse", action="store_true", help="com --job-file: reaproveita imagens e trilha já geradas")
    ap.add_argument("--template-video", help="monta um template local a partir deste vídeo (sem o app); saída em --out")
    args = ap.parse_args()
    global REUSE_ASSETS
    REUSE_ASSETS = args.reuse

    if args.template_video:
        import template_builder

        result = template_builder.build_local(args.template_video, args.out)
        log("ok", result["sampleUrl"])
        return

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
        try:
            tpl = app.claim_template()
        except Exception as e:
            log("erro ao pedir template:", e)
            tpl = {"template": None}
        if tpl.get("template"):
            process_template(app, tpl["template"])
            continue
        if args.once:
            return
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()

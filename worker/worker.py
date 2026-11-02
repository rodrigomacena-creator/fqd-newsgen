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
from render.audio_fx import build_sfx_track, detect_beats, sfx_cues
from render.common import mix, render_speed
from render.cta_fx import overlay_cta
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

    def done(self, job_id, url, costs=None, assets=None):
        self._post(f"/api/videogen/worker/jobs/{job_id}",
                   {"status": "done", "videoUrl": url, "costs": merge_costs(costs), "assets": assets or {}})

    def failed(self, job_id, error, costs=None, assets=None):
        try:
            self._post(f"/api/videogen/worker/jobs/{job_id}",
                       {"status": "failed", "error": error, "costs": merge_costs(costs), "assets": assets or {}})
        except Exception as e:
            log("aviso: não consegui marcar como falho:", e)

    def upload_token(self, job_id, file="video", index=None):
        payload = {"file": file}
        if index is not None:
            payload["index"] = index
        return self._post(f"/api/videogen/worker/jobs/{job_id}/upload-token", payload)

    # templates (montados a partir de um vídeo de referência)
    def claim_template(self):
        return self._post("/api/videogen/worker/templates/claim")

    def template_update(self, template_id, payload, timeout=60):
        return self._post(f"/api/videogen/worker/templates/{template_id}", payload, timeout=timeout)

    def template_upload_token(self, template_id, kind):
        return self._post(f"/api/videogen/worker/templates/{template_id}/upload-token", {"file": kind})


# ---------- pipeline ----------

REUSE_ASSETS = False  # --reuse: em teste local, reaproveita imagens/trilha já geradas no workdir


def extract_clip_frames(mp4, out_dir, seconds):
    """Quadros do vídeo de banco em jpg, já no tamanho do quadro (com folga para o zoom), no FPS do render."""
    from render.common import FPS, H, W
    out_dir = Path(out_dir)
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True)
    w, h = int(W * CLIP_ZOOM) // 2 * 2, int(H * CLIP_ZOOM) // 2 * 2
    vf = f"fps={FPS},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-t", f"{seconds:.2f}", "-i", str(mp4), "-an",
                    "-vf", vf, "-q:v", "4", str(out_dir / "%04d.jpg")], check=True, timeout=300)
    if not (out_dir / "0001.jpg").exists():
        raise RuntimeError("ffmpeg não extraiu quadros do vídeo")
    return out_dir


CLIP_ZOOM = 1.12  # folga do quadro do vídeo para o movimento de câmera


PREVIEW_FPS = 12  # prévia rápida: mesma resolução e layout, menos quadros (render ~2,5x mais rápido)


def produce(job, workdir, report=lambda p: None, costs=None, assets=None):
    """Gera assets, renderiza e mixa. Devolve o caminho do mp4 final.
    assets (dict, opcional) recebe o que foi gerado para o app guardar e reaproveitar no próximo
    render: {"scenes": {i: (arquivo, prompt)}, "music": (arquivo, prompt, segundos)}.
    Job com renderMode "preview": prévia rápida (12 fps, x264 veryfast, sem gerar trilha)."""
    if assets is None:
        assets = {}
    assets.setdefault("scenes", {})
    if job.get("renderMode") == "preview":
        with render_speed(PREVIEW_FPS):
            return _produce(job, workdir, report, costs, assets, preview=True)
    return _produce(job, workdir, report, costs, assets, preview=False)


def scene_prompt(sc):
    """Prompt de imagem da cena; cena sem prompt (a IA às vezes devolve vazio) usa a fala/texto da cena."""
    p = (sc.get("imagePrompt") or sc.get("visual") or "").strip()
    if p:
        return p
    base = (sc.get("narration") or sc.get("onScreen") or "").strip()
    if not base:
        return ""
    return f"Editorial photograph that visually illustrates this idea: {base}. Vertical 9:16 composition, no text, no letters."


def _produce(job, workdir, report, costs, assets, preview):
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
    # cena "só texto" (estilo livre) não usa imagem: não gasta geração com ela
    used -= {i for i, sc in enumerate(scenes) if sc.get("layout") == "text_only" and not sc.get("imageUrl")}
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
        pv = sc.get("preview") or {}
        if pv.get("url") and pv.get("prompt") == sc.get("imagePrompt"):
            try:  # storyboard: imagem já aprovada no editor
                return download(pv["url"], path)
            except Exception as e:
                log(f"cena {i + 1}: prévia do storyboard falhou ({e}); gerando com IA")
        out = cached(generate_image, path, scene_prompt(sc))
        assets["scenes"][i] = (out, sc.get("imagePrompt") or "")  # o app guarda como prévia da cena
        return out

    # vídeo de banco (Pexels) por cena: só o motor genérico sabe tocar; falha = volta para a imagem
    clips = {}
    spans = {s.index: s.end - s.start for s in tl.scenes}
    def scene_clip(i, sc):
        clip_dir = workdir / f"cena_{i:02d}_video"
        if not (REUSE_ASSETS and (clip_dir / "0001.jpg").exists()):
            mp4 = download(sc["stock"]["url"], workdir / f"cena_{i:02d}.mp4")
            extract_clip_frames(mp4, clip_dir, spans.get(i, 3.0) + 1.5)
        shutil.copyfile(clip_dir / "0001.jpg", workdir / f"cena_{i:02d}.jpg")
        return clip_dir

    if module is template_engine:
        for i, sc in enumerate(scenes):
            if i in used and (sc.get("stock") or {}).get("url") and not sc.get("imageUrl"):
                try:
                    clips[i] = scene_clip(i, sc)
                    images[i] = workdir / f"cena_{i:02d}.jpg"
                except Exception as e:
                    log(f"cena {i + 1}: vídeo de banco falhou ({e}); usando imagem")

    # trilha: reaproveita a do render anterior se o prompt é o mesmo e ela cobre o vídeo; a prévia não gera trilha
    music_prompt = script.get("musicPrompt") or ""
    track = script.get("musicTrack") or {}
    def get_music():
        path = workdir / "trilha.mp3"
        if track.get("url") and track.get("prompt") == music_prompt and float(track.get("seconds") or 0) >= tl.duration + 1:
            try:
                return download(track["url"], path)
            except Exception as e:
                log(f"trilha guardada falhou ({e}); gerando de novo")
        if preview:
            return silent_audio(tl.duration + 1, path)
        out = cached(generate_music, path, music_prompt, tl.duration)
        assets["music"] = (out, music_prompt, max(10, tl.duration + 2))
        return out

    with ThreadPoolExecutor(5) as ex:
        music_f = ex.submit(get_music)
        futs = {
            i: ex.submit(scene_image, i, sc)
            for i, sc in enumerate(scenes) if i in used and i not in clips
        }
        done_count = 0
        failed = {}
        for i, f in futs.items():
            try:
                images[i] = f.result()
            except Exception as e:
                log(f"cena {i + 1}: {e}")
                failed[i] = str(e)
            done_count += 1
            report(5 + 40 * done_count / max(len(futs), 1))
        if failed:
            # Antes o vídeo saía "pronto" com fundo liso nessas cenas. Agora falha com o motivo; as imagens
            # que deram certo ficam guardadas e o próximo render só gera as que faltaram.
            nums = ", ".join(str(i + 1) for i in sorted(failed))
            first = next(iter(failed.values()))
            raise RuntimeError(
                f"{len(failed)} cena(s) ficaram sem imagem (cena {nums}): {first[:240]}. "
                "As outras imagens foram guardadas; mande renderizar de novo para gerar só as que faltam."
            )
        try:
            music = music_f.result()
        except Exception as e:
            log(f"{e} (segue sem trilha)")
            music = silent_audio(tl.duration + 1, workdir / "trilha.mp3")
    report(50)

    # cortes na batida: as batidas da trilha vão no roteiro e todo renderizador as usa na linha do tempo
    beats = detect_beats(music, tl.duration + 2) if music else []
    if beats:
        script["_beats"] = beats
        tl = build_timeline(script, job.get("narrationWords"))
        log(f"trilha: {len(beats)} batidas, cortes ajustados")

    video_only = workdir / "video_only.mp4"
    extra = {}
    if module is template_engine:
        extra["spec"] = job["templateSpec"]
        texture_url = ((job["templateSpec"] or {}).get("background") or {}).get("textureUrl")
        if texture_url:
            extra["texture"] = download(texture_url, workdir / "textura.jpg")
        extra["clips"] = clips
    duration = module.render(job, {"images": images, **extra}, str(video_only), on_progress=lambda p: report(50 + 40 * p))
    report(91)

    # fecho: logo (da empresa, outro ou nenhum), imagem e efeito, iguais em todos os estilos
    cta = script.get("cta") or {}
    logo_mode = cta.get("logo") or "company"
    logo_url = cta.get("logoUrl") if logo_mode == "custom" else (job.get("brand") or {}).get("logoUrl") if logo_mode == "company" else None
    logo = image = None
    for kind, url in (("logo", logo_url), ("cta_imagem", cta.get("imageUrl"))):
        if not url:
            continue
        try:
            ext = Path(url.split("?")[0]).suffix.lower() or ".png"
            path = download(url, workdir / f"{kind}{ext}")
            if kind == "logo":
                logo = str(path)
            else:
                image = str(path)
        except Exception as e:
            log(f"{kind}: {e} (segue sem)")
    accent = (((job.get("templateSpec") or {}).get("palette") or {}).get("accent")) or "#E8322B"
    try:
        branded = overlay_cta(str(video_only), tl.cta_start, duration, str(workdir / "video_cta.mp4"),
                              logo=logo, image=image, effect=cta.get("effect") or "none", accent=accent)
        video_only = Path(branded)
    except Exception as e:
        log(f"fecho (logo/imagem/efeito): {e} (segue sem)")
    report(93)

    sfx = None
    try:
        sfx = build_sfx_track(sfx_cues(tl, script), duration, workdir / "efeitos.wav")
    except Exception as e:
        log(f"efeitos sonoros: {e} (segue sem)")
    final = workdir / "video.mp4"
    mix(str(video_only), str(narration) if narration else None, str(music), duration, str(final), sfx=sfx)
    return final


def upload(app, job_id, path, tok=None, file="video", index=None):
    tok = tok or app.upload_token(job_id, file, index)
    out = subprocess.run(["node", str(HERE / "upload.mjs"), str(path), tok["pathname"], tok["clientToken"]],
                         capture_output=True, text=True, cwd=HERE, timeout=900)
    if out.returncode != 0:
        raise RuntimeError(f"upload no Blob falhou: {out.stderr.strip()[:400]}")
    return json.loads(out.stdout.strip().splitlines()[-1])["url"]


def upload_assets(app, job_id, generated):
    """Sobe as imagens de cena e a trilha geradas neste render; devolve o formato que o app espera."""
    from PIL import Image

    out = {"scenes": []}
    for i, (path, prompt) in sorted((generated.get("scenes") or {}).items()):
        try:
            jpg = Path(path).with_name(f"envio_cena_{i:02d}.jpg")
            Image.open(path).convert("RGB").save(jpg, "JPEG", quality=88)
            out["scenes"].append({"index": i, "prompt": prompt, "url": upload(app, job_id, jpg, file="scene", index=i)})
        except JobGone:
            raise
        except Exception as e:
            log(f"cena {i + 1}: imagem não guardada ({e})")
    music = generated.get("music")
    if music:
        path, prompt, seconds = music
        try:
            out["music"] = {"url": upload(app, job_id, path, file="music"), "prompt": prompt, "seconds": seconds}
        except JobGone:
            raise
        except Exception as e:
            log(f"trilha não guardada ({e})")
    return out


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
    generated = {}  # imagens/trilha geradas: sobem pro Blob e o app guarda para o próximo render
    preview = job.get("renderMode") == "preview"
    try:
        final = produce(job, workdir, report, costs, generated)
        app.progress(job_id, 95)
        url = upload(app, job_id, final, file="preview" if preview else "video")
        app.done(job_id, url, costs, upload_assets(app, job_id, generated))
        log(f"job {job_id}: {'prévia' if preview else 'pronto'} {url}")
    except JobGone as e:
        log(f"job {job_id}: descartado ({e})")
    except Exception as e:
        traceback.print_exc()
        try:
            saved = upload_assets(app, job_id, generated)
        except JobGone:
            saved = {}
        app.failed(job_id, str(e), costs, saved)
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
    ap.add_argument("--template-video", help="monta um template local a partir deste vídeo ou link do YouTube/Pinterest (sem o app); saída em --out")
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

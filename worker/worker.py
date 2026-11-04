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
  python3 worker.py --template-file marca.json --out pasta/ # template de marca (ou ajuste) local, sem o app
"""
import argparse
import contextlib
import functools
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from brand_assets import prepare_render
from providers import download, generate_image, generate_music, prepare_user_image, silent_audio
from render import RENDERERS, template_engine
from render.audio_fx import build_sfx_track, detect_beats, sfx_cues
from render.common import mix, render_size, render_speed
from render.cover import make_covers
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

    def publish_tick(self):
        return self._post("/api/videogen/worker/publish-tick", timeout=320)

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


def base_track(job):
    """Trechos do vídeo base (avatar do HeyGen ou vídeo do usuário) que valem para a narração atual.
    [] quando não há vídeo base pronto: as cenas marcadas como avatar viram imagem, como antes."""
    a = job.get("avatar") or {}
    if a.get("status") != "ready" or not job.get("narrationUrl") or a.get("narrationUrl") != job.get("narrationUrl"):
        return []
    return [s for s in a.get("segments") or [] if s.get("status") == "completed" and s.get("videoUrl")]


def segment_for(segments, start, end):
    """Trecho que mais cobre o intervalo [start, end] da cena (None se nenhum encosta nele)."""
    best, best_cover = None, 0.0
    for s in segments:
        cover = min(end, float(s["end"])) - max(start, float(s["start"]))
        if cover > best_cover:
            best, best_cover = s, cover
    return best


@functools.lru_cache(maxsize=32)
def detect_bars(mp4):
    """Barras pretas gravadas DENTRO do vídeo base (o HeyGen encaixa um avatar gravado na horizontal num
    quadro 9:16 com preto em cima e embaixo). Devolve "crop=w:h:x:y" só da área útil, ou None se não há
    barras. Mede com cropdetect nos 4 primeiros segundos; só aceita um corte centrado (barras simétricas),
    para não cortar cenário escuro de verdade."""
    try:
        probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                "-of", "csv=p=0", str(mp4)], capture_output=True, text=True, timeout=60, check=True)
        fw, fh = (int(v) for v in probe.stdout.strip().split(",")[:2])
        out = subprocess.run(["ffmpeg", "-v", "info", "-t", "4", "-i", str(mp4), "-vf", "cropdetect=24:2:0", "-f", "null", "-"],
                             capture_output=True, text=True, timeout=120)
        crops = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", out.stderr)
        if not crops:
            return None
        w, h, x, y = (int(v) for v in crops[-1])
    except Exception as e:  # noqa: BLE001 - sem ffprobe/cropdetect, segue sem cortar
        print(f"[base] cropdetect falhou ({e}); sem corte de barras")
        return None
    if w <= 0 or h <= 0 or (w >= fw * 0.97 and h >= fh * 0.97):
        return None  # sem barras relevantes
    centered = abs((fw - w) / 2 - x) <= 8 and abs((fh - h) / 2 - y) <= 8
    if not centered or w < fw * 0.5 or h < fh * 0.25:
        return None  # corte estranho: melhor manter o vídeo inteiro
    print(f"[base] barras pretas no vídeo base: área útil {w}x{h} em {fw}x{fh}")
    return f"crop={w}:{h}:{x}:{y}"


def extract_base_frames(mp4, out_dir, offset, seconds):
    """Quadros do vídeo base a partir de `offset` (s), no tamanho do quadro e no FPS do render.
    Diferente do vídeo de banco, o tempo aqui é o da fala: o quadro k é o instante offset + k/FPS.
    Barras pretas gravadas no vídeo (avatar horizontal num quadro vertical) são cortadas antes: a área
    útil é escalada para ocupar a tela toda, centralizada (corta as laterais no vertical)."""
    from render.common import FPS, H, W
    out_dir = Path(out_dir)
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True)
    w, h = int(W * BASE_ZOOM) // 2 * 2, int(H * BASE_ZOOM) // 2 * 2
    bars = detect_bars(str(mp4))
    vf = f"{bars + ',' if bars else ''}fps={FPS},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(offset, 0):.3f}", "-t", f"{seconds:.2f}",
                    "-i", str(mp4), "-an", "-vf", vf, "-q:v", "3", str(out_dir / "%04d.jpg")], check=True, timeout=600)
    if not (out_dir / "0001.jpg").exists():
        raise RuntimeError("ffmpeg não extraiu quadros do vídeo base")
    return out_dir


BASE_ZOOM = 1.06  # pouca folga: o rosto do avatar não pode sair do quadro com o movimento


PREVIEW_FPS = 12  # prévia rápida: mesma resolução e layout, menos quadros (render ~2,5x mais rápido)


def produce(job, workdir, report=lambda p: None, costs=None, assets=None):
    """Gera assets, renderiza e mixa. Devolve o caminho do mp4 final.
    assets (dict, opcional) recebe o que foi gerado para o app guardar e reaproveitar no próximo
    render: {"scenes": {i: (arquivo, prompt)}, "music": (arquivo, prompt, segundos)}.
    Job com renderMode "preview": prévia rápida (12 fps, x264 veryfast, sem gerar trilha)."""
    if assets is None:
        assets = {}
    assets.setdefault("scenes", {})
    preview = job.get("renderMode") == "preview"
    with contextlib.ExitStack() as stack:
        if is_landscape(job):  # formato horizontal (YouTube): 1920×1080 em todos os renderizadores
            stack.enter_context(render_size(1920, 1080))
        if preview:
            stack.enter_context(render_speed(PREVIEW_FPS))
        return _produce(job, workdir, report, costs, assets, preview=preview)


def is_landscape(job):
    return job.get("format") == "16:9"


def scene_aspect(job, sc):
    """Proporção da imagem gerada para a cena. Vertical: sempre 9:16. Horizontal (16:9): tela cheia
    pede 16:9; card/polaroid/círculo e metade/dividida (imagem ao lado do texto) pedem quadrada/4:5."""
    g = sc.get("graphic") if isinstance(sc.get("graphic"), dict) else {}
    if g.get("type") == "rank_item":
        return "16:9"  # a imagem do item de ranking é uma faixa larga que atravessa a tela
    if not is_landscape(job):
        return "9:16"
    layout = sc.get("layout") or ((job.get("templateSpec") or {}).get("image") or {}).get("layout") or "fullbleed"
    if layout == "card":
        return "4:5"
    if layout in ("circle", "polaroid", "split", "top_half"):
        return "1:1"
    return "16:9"


def scene_prompt(sc, landscape=False):
    """Prompt de imagem da cena; cena sem prompt (a IA às vezes devolve vazio) usa a fala/texto da cena."""
    p = (sc.get("imagePrompt") or sc.get("visual") or "").strip()
    if p:
        return p
    base = (sc.get("narration") or sc.get("onScreen") or "").strip()
    if not base:
        return ""
    comp = "Horizontal 16:9 composition" if landscape else "Vertical 9:16 composition"
    return f"Editorial photograph that visually illustrates this idea: {base}. {comp}, no text, no letters."


def _produce(job, workdir, report, costs, assets, preview):
    module = RENDERERS.get(job["patternId"])
    if not module and job.get("templateSpec"):
        module = template_engine  # template montado pela aplicação: motor genérico + ficha de estilo
    if is_landscape(job) and module is not template_engine:
        raise RuntimeError("O formato horizontal (16:9) só funciona no estilo livre e nos templates montados.")
    if not module:
        raise RuntimeError(f'O worker ainda não sabe renderizar o padrão "{job["patternId"]}".')
    script = job.get("script") or {}
    scenes = script.get("scenes") or []
    if not scenes:
        raise RuntimeError("O roteiro não tem cenas.")

    tl = build_timeline(script, job.get("narrationWords"))
    workdir.mkdir(parents=True, exist_ok=True)
    # material da marca do template (fontes, logo, efeitos, trilha); ficha sem marca = tudo vazio
    brand_files = prepare_render(job.get("templateSpec"), workdir, WORKDIR / "marca-cache", log) \
        if module is template_engine else prepare_render(None, workdir)
    report(5)

    narration = None
    if job.get("narrationUrl"):
        ext = Path(job["narrationUrl"].split("?")[0]).suffix.lower()
        # vídeo base do usuário: a narração é o próprio vídeo (o ffmpeg usa só o áudio dele)
        narration = download(job["narrationUrl"], workdir / f"narracao{ext if ext in ('.mp4', '.mov', '.webm') else '.mp3'}")

    # imagens das cenas em paralelo + trilha ao mesmo tempo
    images = {}
    used = {s.index for s in tl.scenes} if getattr(module, "USES_SCENE_IMAGES", True) else set()
    # cena "só texto" (estilo livre) não usa imagem: não gasta geração com ela
    used -= {i for i, sc in enumerate(scenes) if sc.get("layout") == "text_only" and not sc.get("imageUrl")}
    # ficha sem imagem (layout "none", ex.: Papel e Hera): só gera para cena que pediu layout próprio ou tem foto
    spec_img = ((job.get("templateSpec") or {}).get("image") or {}) if module is template_engine else {}
    spec_bg = ((job.get("templateSpec") or {}).get("background") or {}) if module is template_engine else {}
    if spec_img.get("layout") == "none" and spec_bg.get("kind") != "blurred_image":
        used -= {i for i, sc in enumerate(scenes) if not sc.get("layout") and not sc.get("imageUrl")}
    # cena com grafismo (render/mograph.py) só gera imagem se o grafismo mostra uma (item de ranking, versus)
    if module is template_engine:
        from render import mograph
        used -= {i for i, sc in enumerate(scenes)
                 if mograph.normalize_graphic(sc.get("graphic")) and not mograph.needs_image(mograph.normalize_graphic(sc.get("graphic")))
                 and not sc.get("imageUrl")}
    # vídeo base: cenas marcadas como avatar mostram o vídeo, não geram imagem
    base_segments = base_track(job) if module is template_engine else []
    avatar_scenes = {i for i, sc in enumerate(scenes) if sc.get("avatar")} if base_segments else set()
    used -= avatar_scenes
    def cached(fn, path, *a):
        return path if REUSE_ASSETS and path.exists() else fn(*a, path, costs=costs)

    def scene_image(i, sc):
        """Foto do usuário (briefing) quando a cena tem imageUrl; senão gera com IA."""
        path = workdir / f"cena_{i:02d}.jpg"
        if sc.get("imageUrl"):
            try:
                return prepare_user_image(sc["imageUrl"], path, *((1920, 1080) if is_landscape(job) or scene_aspect(job, sc) == "16:9" else (1080, 1920)))
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
        gen = functools.partial(generate_image, aspect=scene_aspect(job, sc))
        out = cached(gen, path, scene_prompt(sc, is_landscape(job)))
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
        if brand_files["music"]:  # trilha enviada com o material da marca: vale para todo vídeo do template
            return brand_files["music"]
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

    # vídeo base: quadros de cada cena com avatar, no tempo da fala (depois dos cortes na batida)
    base_clips = {}
    if avatar_scenes:
        base_files = {}
        for sc in tl.scenes:
            if sc.index not in avatar_scenes:
                continue
            seg = segment_for(base_segments, sc.start, sc.end)
            if seg is None:
                log(f"cena {sc.index + 1}: sem trecho do vídeo base; usando imagem")
                continue
            try:
                url = seg["videoUrl"]
                if url not in base_files:
                    base_files[url] = download(url, workdir / f"base_{len(base_files):02d}.mp4")
                seg_start = float(seg["start"])
                offset = sc.start - seg_start
                clip_dir = extract_base_frames(base_files[url], workdir / f"cena_{sc.index:02d}_base", offset, sc.end - sc.start + 0.6)
                base_clips[sc.index] = (clip_dir, max(0.0, -offset))
                shutil.copyfile(clip_dir / "0001.jpg", workdir / f"cena_{sc.index:02d}.jpg")
                images[sc.index] = workdir / f"cena_{sc.index:02d}.jpg"
            except Exception as e:
                log(f"cena {sc.index + 1}: vídeo base falhou ({e}); usando imagem")
        missing = [i + 1 for i in sorted(avatar_scenes - set(base_clips)) if i not in images]
        if missing:
            raise RuntimeError(f"Cena(s) {', '.join(map(str, missing))} marcadas como avatar ficaram sem vídeo base nem imagem.")
        log(f"vídeo base: {len(base_clips)} cena(s) com avatar")
        report(52)

    video_only = workdir / "video_only.mp4"
    extra = {}
    if module is template_engine:
        extra["spec"] = job["templateSpec"]
        texture_url = ((job["templateSpec"] or {}).get("background") or {}).get("textureUrl") or ""
        if texture_url.startswith("asset:"):  # textura fixa do worker (ex.: templates que vieram dos estilos embutidos)
            from render.common import asset
            path = Path(asset(Path(texture_url[6:]).name))
            land_path = path.with_name(path.stem + "_16x9" + path.suffix)  # versão horizontal, se existir
            if job.get("format") == "16:9" and land_path.exists():
                path = land_path
            if path.exists():
                extra["texture"] = path
        elif texture_url:
            extra["texture"] = download(texture_url, workdir / "textura.jpg")
        extra["clips"] = clips
        extra["base_clips"] = base_clips
        extra["fonts"] = brand_files["fonts"]
        extra["watermark"] = brand_files["watermark"]
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
    if logo is None and logo_mode == "company" and brand_files["logo"]:
        logo = str(brand_files["logo"])  # perfil sem logo: usa o logo da marca do template
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
        sfx = build_sfx_track(sfx_cues(tl, script), duration, workdir / "efeitos.wav", custom=brand_files["sfx"])
    except Exception as e:
        log(f"efeitos sonoros: {e} (segue sem)")
    final = workdir / "video.mp4"
    mix(str(video_only), str(narration) if narration else None, str(music), duration, str(final), sfx=sfx)

    # capa automática (só no render final): imagem da primeira cena que tem imagem + texto do gancho
    if not preview:
        try:
            src = images[min(images)] if images else None
            if src is None:
                src = workdir / "quadro_capa.jpg"
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.8", "-i", str(final), "-frames:v", "1", str(src)], check=True)
            assets["covers"] = make_covers(src, job, workdir)
        except Exception as e:
            log(f"capa: {e} (segue sem)")
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
    covers = generated.get("covers")
    if covers:
        for key, kind, path in (("cover", "cover", covers[0]), ("thumb", "thumb", covers[1])):
            try:
                out[key] = upload(app, job_id, path, file=kind)
            except JobGone:
                raise
            except Exception as e:
                log(f"capa ({kind}) não guardada ({e})")
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
    ap.add_argument("--template-file", help="monta/ajusta um template local a partir de um JSON no formato do claim (ex.: template de marca); saída em --out")
    args = ap.parse_args()
    global REUSE_ASSETS
    REUSE_ASSETS = args.reuse

    if args.template_video:
        import template_builder

        result = template_builder.build_local(args.template_video, args.out)
        log("ok", result["sampleUrl"])
        return

    if args.template_file:
        import template_builder

        result = template_builder.build_template_local(args.template_file, args.out)
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
    last_tick = 0.0
    while True:
        # publicações agendadas/em processamento (Instagram): o app avança quando o worker chama
        if time.time() - last_tick >= 60:
            last_tick = time.time()
            try:
                r = app.publish_tick()
                if r.get("advanced"):
                    log(f"publicações: {r['advanced']} avançada(s)")
            except Exception as e:
                log("aviso: publish-tick:", e)
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

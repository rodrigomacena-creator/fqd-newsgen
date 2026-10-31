"""Padrão 9: Metáfora em Escultura 3D (videogen/padroes/09-metafora-escultura-3d.md).

Uma imagem 3D por cena (render de museu, fundo azul-noite ou creme) em tela cheia, com zoom
lento. A troca de cena abre a imagem anterior em fatias verticais que deslizam para cima e
para baixo. Um fio vermelho (onda de frequência) atravessa todas as cenas no terço inferior.
A legenda fica sempre no mesmo lugar, logo abaixo do fio, em "escada": as palavras de ligação
pequenas em cima e a palavra-conceito grande embaixo, alternando sans black e serif itálica a
cada cena, com palavras-chave em vermelho. A cor do texto (creme ou azul) segue a luminosidade
da imagem. Fecho: azul-noite com anéis vermelhos finos, a frase do CTA e o site.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .common import (FONT_SANS, FPS, H, W, FrameWriter, asset, cover_resize, ease, fit_font, font, grain_frames,
                     group_lines, inter, keyword_set, norm, put, split_cta, text_img, vignette)
from .timeline import build_timeline

USES_SCENE_IMAGES = True

NAVY = (15, 30, 51)
CREAM = (239, 231, 214)
RED = (181, 50, 42)
SERIF_IT = asset("fonts", "eb-garamond-latin-400-italic.woff")
WAVE_Y = 1310
SMALL_Y = 1430
MAX_W = 960


def _is_dark(im):
    """Decide a cor do texto pela luminosidade da faixa onde a legenda fica."""
    a = np.asarray(im.convert("L").resize((108, 192)), np.float32)
    return a[135:175].mean() < 120


def _small(txt, color):
    return text_img(txt, font(inter("Regular"), 62), color)


def _big(txt, color, serif):
    if serif:
        f = fit_font(SERIF_IT, 176, txt, MAX_W, min_size=80)
    else:
        f = fit_font(FONT_SANS, 150, txt, MAX_W, min_size=70)
    return text_img(txt, f, color)


class Stair:
    """Grupo de palavras: as de ligação pequenas numa linha, a última (conceito) grande embaixo."""

    def __init__(self, words, t_end, color, serif, keys):
        self.t_end = t_end
        self.t0 = words[0][1]
        body, last = words[:-1], words[-1]
        self.items = []
        if body:
            imgs = [_small(w[0], RED if norm(w[0]) in keys else color) for w in body]
            sp = 16
            tw = sum(i.width for i in imgs) + sp * (len(imgs) - 1)
            x = W / 2 - tw / 2
            for w, im in zip(body, imgs):
                self.items.append((im, w[1], x + im.width / 2, SMALL_Y, False))
                x += im.width + sp
        word = last[0]
        big = _big(word, RED if norm(word) in keys else color, serif)
        big_y = (SMALL_Y + 60 + big.height / 2 - 20) if body else SMALL_Y + big.height / 2 - 30
        self.items.append((big, last[1], W / 2, big_y, True))

    def draw(self, fr, t):
        if t < self.t0 - 0.1 or t > self.t_end + 0.25:
            return
        q = ease((t - self.t_end) / 0.25) if t > self.t_end else 0
        for im, tw, cx, cy, is_big in self.items:
            p = (t - tw + 0.05) / (0.35 if is_big else 0.25)
            if p <= 0:
                continue
            pe = ease(p)
            put(fr, im, cx, cy + (24 if is_big else 12) * (1 - pe), alpha=pe * (1 - q), blur=8 * (1 - pe) + 10 * q)


def _stairs(words, end, color, serif, keys):
    # grupos de até 4 palavras, quebrando na pontuação; um grupo de 1 palavra fica só grande
    groups = group_lines(words, max_chars=26, max_words=4)
    out = []
    for i, g in enumerate(groups):
        t_end = groups[i + 1][0][1] - 0.05 if i + 1 < len(groups) else end
        out.append(Stair(g, t_end, color, serif, keys))
    return out


def _wave(fr, t, intensity=1.0):
    lay = Image.new("RGBA", fr.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    amp = (24 + 14 * math.sin(t * 2.1)) * intensity
    pts = []
    for x in range(0, W + 10, 8):
        env = math.exp(-((x - W / 2) / 330) ** 2)
        pts.append((x, WAVE_Y + amp * env * math.sin(x / 36 - t * 8.5)))
    d.line(pts, fill=RED + (255,), width=5)
    glow = lay.filter(ImageFilter.GaussianBlur(6))
    fr.alpha_composite(glow)
    fr.alpha_composite(lay)


def _rings(fr, cx, cy, t, u):
    lay = Image.new("RGBA", fr.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for k in range(4):
        r = 220 + k * 70 + 20 * math.sin(t * 1.2 + k)
        e = ease((u - k * 0.12) / 0.8)
        if e <= 0:
            continue
        r *= 0.6 + 0.4 * e
        a0 = (t * 18 * (1 if k % 2 else -1) + k * 50) % 360
        d.arc([cx - r, cy - r, cx + r, cy + r], a0, a0 + 330, fill=RED + (int(230 * e),), width=3)
    fr.alpha_composite(lay)


def render(job, assets, out_path, on_progress=None):
    script = job["script"]
    tl = build_timeline(script, job.get("narrationWords"))
    keys = keyword_set(script)

    imgs, dark = {}, {}
    for sc in tl.scenes:
        path = assets.get("images", {}).get(sc.index)
        im = cover_resize(Image.open(path).convert("RGB")) if path else Image.new("RGB", (W, H), NAVY if sc.index % 2 == 0 else CREAM)
        imgs[sc.index] = im
        dark[sc.index] = _is_dark(im)

    stairs = []
    for k, sc in enumerate(tl.scenes):
        if sc.words:
            color = CREAM if dark[sc.index] else NAVY
            stairs += _stairs(sc.words, sc.end - 0.12, color, serif=(k % 2 == 1), keys=keys)

    cta = script.get("cta") or {}
    phrase, url = split_cta(cta.get("onScreen") or "")
    if not phrase and not url:
        phrase = (cta.get("narration") or "").strip()
    cta_main = _big(phrase, CREAM, serif=False) if phrase else None
    if cta_main is not None and cta_main.width > MAX_W:
        cta_main = cta_main.resize((MAX_W, int(cta_main.height * MAX_W / cta_main.width)), Image.LANCZOS)
    cta_url = text_img(url, fit_font(SERIF_IT, 110, url, MAX_W, min_size=50), RED) if url else None

    def scene_img(sc, t):
        im = imgs[sc.index]
        z = 1.03 + 0.035 * (t - sc.start)
        cw, ch = W / z, H / z
        return im.resize((W, H), Image.BILINEAR, box=((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2)).convert("RGBA")

    def scene_at(t):
        return max((s for s in tl.scenes if s.start <= t), key=lambda s: s.start, default=tl.scenes[0])

    navy_bg = Image.new("RGBA", (W, H), NAVY + (255,))

    def base(t):
        if t >= tl.cta_start:
            u = t - tl.cta_start
            fr = navy_bg.copy()
            if u < 0.5 and tl.scenes:  # a última imagem se abre em fatias revelando o fecho
                _slices(fr, scene_img(tl.scenes[-1], t), u / 0.5)
            return fr
        sc = scene_at(t)
        fr = scene_img(sc, t)
        i = tl.scenes.index(sc)
        if i > 0 and t - sc.start < 0.5:
            _slices(fr, scene_img(tl.scenes[i - 1], t), (t - sc.start) / 0.5)
        return fr

    def _slices(fr, prev, p):
        n = 8
        sw = W // n
        for k in range(n):
            pk = ease((p - k * 0.05) / 0.6)
            if pk >= 1:
                continue
            sl = prev.crop((k * sw, 0, (k + 1) * sw if k < n - 1 else W, H))
            dy = int(H * pk * (1 if k % 2 else -1))
            fr.alpha_composite(sl, (k * sw, 0)) if dy == 0 else put(fr, sl, k * sw + sl.width / 2, H / 2 + dy)

    VIG = vignette(0.25)
    GR = grain_frames(sigma=5, seed=9)
    total = int(round(tl.duration * FPS))
    writer = FrameWriter(out_path)
    for n in range(total):
        t = n / FPS
        fr = base(t)
        if t < tl.cta_start:
            _wave(fr, t)
            for s in stairs:
                s.draw(fr, t)
        else:
            u = t - tl.cta_start
            _rings(fr, W / 2, 820, t, u)
            if cta_main is not None:
                p = ease((u - 0.3) / 0.5)
                put(fr, cta_main, W / 2, 820, alpha=p, blur=8 * (1 - p))
            if cta_url is not None:
                p2 = ease((u - 0.65) / 0.5)
                put(fr, cta_url, W / 2, 1060 + 24 * (1 - p2), alpha=p2)
            _wave(fr, t, intensity=0.5)
        a = np.asarray(fr.convert("RGB")).astype(np.float32) * VIG
        a += np.repeat(np.repeat(GR[n % len(GR)], 2, 0), 2, 1)[..., None]
        writer.write(np.clip(a, 0, 255).astype(np.uint8))
        if on_progress and n % 30 == 0:
            on_progress(n / total)
    writer.close()
    return tl.duration

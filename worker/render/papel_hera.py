"""Padrão 4: Papel, Luz e Hera (videogen/padroes/04-papel-hera.md).

Plano único sobre papel creme com sombra de janela (fundo fixo em worker/assets, não gera
imagem por cena). Cada cena vira um bloco de texto central: condensada preta em caixa alta,
com a última palavra da frase em script vermelha sobreposta. Letras entram com blur e o bloco
sai com blur quando a próxima frase começa. Ramos de hera entram por cantos alternados a cada
cena e arcos finos giram nos cantos. CTA: nome da marca e site sobre o mesmo papel.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .common import FPS, H, W, FrameWriter, asset, ease, font, grain_frames
from .timeline import build_timeline

USES_SCENE_IMAGES = False

INK = (29, 29, 27)
SCRIPT_RED = (232, 67, 79)
CONDENSED = asset("fonts", "bebas-neue-latin-400-normal.woff")
SCRIPT = asset("fonts", "great-vibes-latin-400-normal.woff")
MAX_W = 940


def _key_white(path, thr=245, soft=20, w=400):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    m = np.clip((thr - a.min(2)) / soft, 0, 1)
    im = Image.fromarray(np.dstack([a, m * 255]).astype(np.uint8), "RGBA")
    im = im.crop(im.getbbox())
    return im.resize((w, int(w * im.height / im.width)), Image.LANCZOS)


def _text_img(txt, f, fill):
    bb = f.getbbox(txt)
    im = Image.new("RGBA", (bb[2] - bb[0] + 16, bb[3] - bb[1] + 16), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((8 - bb[0], 8 - bb[1]), txt, font=f, fill=fill)
    return im


class Block:
    """Frase em caixa alta (linhas de até ~2-3 palavras) + última palavra em script vermelha."""

    def __init__(self, words, start, end):
        self.start, self.end = start, end
        words = [w for w in words if w[0].strip(".,;:!?…")] or words
        body, tail = (words[:-1], words[-1]) if len(words) > 1 else ([], words[0])
        lines, cur = [], []
        for w in body:
            if cur and len(" ".join(x[0] for x in cur + [w])) > 12:
                lines.append(cur)
                cur = []
            cur.append(w)
        if cur:
            lines.append(cur)
        size = 168 if len(lines) <= 2 else 140 if len(lines) <= 3 else 116
        f = font(CONDENSED, size)
        self.items = []  # (img, t, cx, cy)
        rows = []
        for ln in lines:
            imgs = [_text_img(w[0].strip(",;:").upper(), f, INK) for w in ln]
            sp = size * 0.22
            tw = sum(i.width for i in imgs) + sp * (len(imgs) - 1)
            if tw > MAX_W:  # encolhe a linha toda
                k = MAX_W / tw
                imgs = [i.resize((int(i.width * k), int(i.height * k)), Image.LANCZOS) for i in imgs]
                sp *= k
                tw = MAX_W
            rows.append((ln, imgs, sp, tw, max(i.height for i in imgs)))
        tail_img = _text_img(tail[0].strip(".,;:!?…").lower(), font(SCRIPT, int(size * 1.35)), SCRIPT_RED)
        if tail_img.width > MAX_W:
            k = MAX_W / tail_img.width
            tail_img = tail_img.resize((int(tail_img.width * k), int(tail_img.height * k)), Image.LANCZOS)
        total_h = sum(r[4] * 0.95 for r in rows) + tail_img.height * 0.6
        y = H * 0.46 - total_h / 2
        for ln, imgs, sp, tw, rh in rows:
            x = W / 2 - tw / 2
            for w, im in zip(ln, imgs):
                self.items.append((im, w[1], x + im.width / 2, y + rh / 2))
                x += im.width + sp
            y += rh * 0.95
        # script sobreposta à linha de cima, levemente à direita
        self.items.append((tail_img, tail[1], W / 2 + (50 if rows else 0), y + tail_img.height * 0.3 - (10 if rows else 0)))

    def draw(self, fr, t):
        if t < self.start - 0.1 or t > self.end + 0.3:
            return
        q = ease((t - self.end) / 0.3) if t > self.end else 0
        for im, t0, cx, cy in self.items:
            p = (t - t0 + 0.05) / 0.32
            if p <= 0:
                continue
            pe = ease(p)
            alpha = pe * (1 - q)
            if alpha <= 0.01:
                continue
            blur = 10 * (1 - pe) + 12 * q
            out = im
            if blur > 0.5:
                pad = int(blur * 3)
                big = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
                big.paste(im, (pad, pad))
                out = big.filter(ImageFilter.GaussianBlur(blur))
            if alpha < 1:
                out = out.copy()
                out.putalpha(out.getchannel("A").point(lambda a, k=alpha: int(a * k)))
            x = int(cx - out.width / 2 - 8 * (1 - pe))
            y = int(cy - out.height / 2)
            lay = Image.new("RGBA", fr.size, (0, 0, 0, 0))
            lay.paste(out, (x, y), out)
            fr.alpha_composite(lay)


def render(job, assets, out_path, on_progress=None):
    script = job["script"]
    tl = build_timeline(script, job.get("narrationWords"))
    paper = Image.open(asset("papel.jpg")).convert("RGB")
    s = max(W / paper.width, H / paper.height) * 1.08
    paper = paper.resize((int(paper.width * s), int(paper.height * s)), Image.LANCZOS)
    ivy = _key_white(asset("hera.jpg"))

    blocks = []
    for sc in tl.scenes:
        if sc.words:
            blocks.append(Block(sc.words, sc.start, sc.end - 0.15))
    cta = script.get("cta") or {}
    cta_text = (cta.get("onScreen") or "").replace("\n", " ").strip()

    def cta_layer(fr, t):
        if t < tl.cta_start or not cta_text:
            return
        parts = cta_text.split()
        url = next((p for p in parts if "." in p and len(p) > 4), None)
        brand = " ".join(p for p in parts if p != url) or (url or "")
        p1 = ease((t - tl.cta_start) / 0.5)
        p2 = ease((t - tl.cta_start - 0.35) / 0.5)
        d = ImageDraw.Draw(fr)
        fb = font(CONDENSED, 190)
        while fb.getlength(brand.upper()) > MAX_W and fb.size > 80:
            fb = font(CONDENSED, fb.size - 10)
        bb = fb.getbbox(brand.upper())
        d.text(((W - (bb[2] - bb[0])) / 2 - bb[0], 780 + 30 * (1 - p1)), brand.upper(), font=fb, fill=INK + (int(255 * p1),))
        if url:
            fs = font(SCRIPT, 110)
            while fs.getlength(url) > MAX_W and fs.size > 50:
                fs = font(SCRIPT, fs.size - 8)
            bb2 = fs.getbbox(url)
            d.text(((W - (bb2[2] - bb2[0])) / 2 - bb2[0], 1000 + 30 * (1 - p2)), url, font=fs, fill=SCRIPT_RED + (int(255 * p2),))

    def arcs(fr, cx, cy, t, sgn):
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        for k, r in enumerate([150, 200, 250, 300]):
            a0 = (t * 25 * sgn * (1 + 0.3 * k) + k * 40) % 360
            d.arc([cx - r, cy - r, cx + r, cy + r], a0, a0 + 200, fill=INK + (200,), width=3)
        fr.alpha_composite(lay)

    # um ramo de hera por cena, em cantos alternados (sup. direito / inf. esquerdo)
    ivy_events = [(sc.start, i % 2) for i, sc in enumerate(tl.scenes)] + [(tl.cta_start, len(tl.scenes) % 2)]
    ivy_up = ivy.rotate(180, Image.BICUBIC, expand=True)

    def ivy_layer(fr, t):
        for k, (t0, corner) in enumerate(ivy_events):
            t1 = ivy_events[k + 1][0] if k + 1 < len(ivy_events) else tl.duration + 1
            if t < t0 - 0.2 or t > t1 + 0.6:
                continue
            e_in = ease((t - t0 + 0.2) / 0.9)
            e_out = ease((t - t1) / 0.6) if t > t1 else 0
            e = e_in * (1 - e_out)
            if corner == 0:
                im = ivy_up.rotate(4 * math.sin(t * 1.3), Image.BICUBIC, expand=True)
                cx, cy = W - 70 + 260 * (1 - e), 230 - 200 * (1 - e)
            else:
                im = ivy.rotate(8 * math.sin(t * 1.1), Image.BICUBIC, expand=True)
                cx, cy = 80 - 280 * (1 - e), H - 300 + 200 * (1 - e)
            lay = Image.new("RGBA", fr.size, (0, 0, 0, 0))
            lay.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)
            fr.alpha_composite(lay)

    GR = grain_frames(sigma=3, seed=4)
    total = int(round(tl.duration * FPS))
    writer = FrameWriter(out_path)
    for n in range(total):
        t = n / FPS
        z = 1.0 + 0.004 * t
        cw, ch = paper.width / 1.08 / z, paper.height / 1.08 / z
        cx = paper.width / 2 + paper.width * 0.002 * t
        cy = paper.height / 2
        fr = paper.resize((W, H), Image.BILINEAR, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)).convert("RGBA")
        ivy_layer(fr, t)
        arcs(fr, 0, 0, t, 1)
        arcs(fr, W, H, t, -1)
        for b in blocks:
            b.draw(fr, t)
        cta_layer(fr, t)
        a = np.asarray(fr.convert("RGB")).astype(np.float32)
        a += np.repeat(np.repeat(GR[n % len(GR)], 2, 0), 2, 1)[..., None]
        writer.write(np.clip(a, 0, 255).astype(np.uint8))
        if on_progress and n % 30 == 0:
            on_progress(n / total)
    writer.close()
    return tl.duration

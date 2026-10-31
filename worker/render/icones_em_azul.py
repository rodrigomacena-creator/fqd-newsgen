"""Padrão 16: Ícones Brilhantes em Azul (videogen/padroes/16-icones-em-azul.md).

Fundo azul-marinho com listras diagonais finas e degradê para preto, desenhado por código.
Cada cena tem um ícone 3D brilhante (imagem gerada, recortada em círculo com borda suave)
no centro, dentro de um círculo pontilhado que gira e se fecha. O texto da tela da cena vira
uma caixa de contorno branco com brilho, como num diagrama ("CLIENTE = HERÓI"). Embaixo, a
legenda palavra por palavra em Montserrat Black caixa alta, com palavras curtas de ligação em
script fina branca e palavras-chave em verde. Na troca de cena, uma faixa de luz vertical varre
o quadro. CTA: marca dentro de uma caixa desenhada com linha animada e o site em script.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .common import (FPS, H, W, FrameWriter, asset, back, ease, ease_io, fit_font, font, grain_frames,
                     group_lines, keyword_set, norm, put, split_cta, text_img, vignette)
from .timeline import build_timeline

USES_SCENE_IMAGES = True

NAVY = (10, 58, 107)
WHITE = (255, 255, 255)
GREEN = (34, 224, 92)
BLACK_F = asset("fonts", "montserrat-latin-900-normal.woff")
SCRIPT_F = asset("fonts", "allura-latin-400-normal.woff")
ICON_Y = 700
ICON_SIZE = 560
RING_R = 330
BOX_Y = 1160
CAPTION_Y = 1470
MAX_W = 960


def _background():
    yy = np.linspace(0, 1, H)[:, None]
    bg = np.zeros((H, W, 3), np.float32)
    for c in range(3):
        bg[..., c] = NAVY[c] * (1 - 0.85 * np.clip((yy - 0.5) / 0.5, 0, 1)) + 6 * (1 - yy)
    stripes = (np.add.outer(np.arange(H), np.arange(W)) // 6) % 14 == 0
    bg += stripes[..., None] * 10
    # leve brilho atrás do ícone
    y, x = np.mgrid[0:H, 0:W]
    glow = np.exp(-(((x - W / 2) / 520) ** 2 + ((y - ICON_Y) / 520) ** 2))
    bg += glow[..., None] * np.array([20, 45, 70], np.float32)
    return Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert("RGBA")


def _icon(path):
    im = Image.open(path).convert("RGB")
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2))
    im = im.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).ellipse([24, 24, ICON_SIZE - 24, ICON_SIZE - 24], fill=255)
    im.putalpha(m.filter(ImageFilter.GaussianBlur(34)))
    return im


def _glow(im, color=WHITE, radius=12):
    g = Image.new("RGBA", im.size, color + (0,))
    g.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(radius)))
    g.alpha_composite(im)
    return g


def _box(text, keys, size=84):
    """Caixa de contorno branco com o texto da tela (uma ou duas linhas), palavras-chave em verde."""
    words = text.upper().split()
    f = fit_font(BLACK_F, size, " ".join(words), MAX_W - 100, min_size=60)
    lines = [words]
    if f.getlength(" ".join(words)) > MAX_W - 100 and len(words) > 1:
        # quebra em duas linhas o mais equilibradas possível
        best = min(range(1, len(words)), key=lambda k: abs(len(" ".join(words[:k])) - len(" ".join(words[k:]))))
        lines = [words[:best], words[best:]]
        f = fit_font(BLACK_F, size, max((" ".join(ln) for ln in lines), key=len), MAX_W - 100, min_size=44)
    sp = f.getlength(" ")
    lh = int(f.size * 1.15)
    tw = max(sum(f.getlength(w) for w in ln) + sp * (len(ln) - 1) for ln in lines)
    pad = 46
    im = Image.new("RGBA", (int(tw + 2 * pad), lh * len(lines) + 2 * pad - int(f.size * 0.1)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([3, 3, im.width - 4, im.height - 4], outline=WHITE, width=4)
    y = pad
    for ln in lines:
        x = (im.width - (sum(f.getlength(w) for w in ln) + sp * (len(ln) - 1))) / 2
        for w in ln:
            col = GREEN if norm(w) in keys else WHITE
            d.text((x, y), w, font=f, fill=col)
            x += f.getlength(w) + sp
        y += lh
    return _glow(im, radius=10)


def _word_img(word, keys, first):
    n = norm(word)
    if n in keys:
        return _glow(text_img(word.strip(",;:").upper(), font(BLACK_F, 78), GREEN), GREEN, 10)
    if not first and len(n) <= 3 and word == word.lower():
        return text_img(word.strip(",;:"), font(SCRIPT_F, 122), WHITE)
    return _glow(text_img(word.strip(",;:").upper(), font(BLACK_F, 78), WHITE), WHITE, 8)


class Caption:
    """Linhas curtas da legenda; cada uma fica na tela até a próxima começar."""

    def __init__(self, words, end, keys):
        self.lines = []
        groups = group_lines(words, max_chars=15, max_words=3)
        for i, g in enumerate(groups):
            imgs = [_word_img(w[0], keys, k == 0) for k, w in enumerate(g)]
            sp = 22
            tw = sum(im.width for im in imgs) + sp * (len(imgs) - 1)
            k = min(1.0, MAX_W / tw)
            if k < 1:
                imgs = [im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS) for im in imgs]
                tw = MAX_W
            x = W / 2 - tw / 2
            items = []
            for w, im in zip(g, imgs):
                items.append((im, w[1], x + im.width / 2))
                x += im.width + sp * k
            t_end = groups[i + 1][0][1] - 0.05 if i + 1 < len(groups) else end
            self.lines.append((items, g[0][1], t_end))

    def draw(self, fr, t):
        for items, t0, t1 in self.lines:
            if t < t0 - 0.1 or t > t1 + 0.2:
                continue
            q = ease((t - t1) / 0.2) if t > t1 else 0
            for im, tw, cx in items:
                p = (t - tw + 0.05) / 0.25
                if p <= 0:
                    continue
                pe = ease(p)
                put(fr, im, cx, CAPTION_Y, alpha=pe * (1 - q), blur=9 * (1 - pe) + 10 * q, scale=1 + 0.08 * (1 - pe))


def _dotted(fr, cx, cy, r, t, close, alpha=1.0):
    if close <= 0 or alpha <= 0:
        return
    lay = Image.new("RGBA", fr.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    n = 56
    a_col = int(210 * alpha)
    for i in range(int(n * close)):
        a = i / n * 2 * math.pi + t * 0.7
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=WHITE + (a_col,))
    # anel externo fino girando ao contrário
    r2 = r + 46
    a0 = (-t * 40) % 360
    d.arc([cx - r2, cy - r2, cx + r2, cy + r2], a0, a0 + 300 * close, fill=WHITE + (int(110 * alpha),), width=2)
    fr.alpha_composite(lay)


def _sweep(fr, p):
    """Faixa de luz vertical atravessando o quadro (p de 0 a 1)."""
    if not 0 < p < 1:
        return
    lay = Image.new("RGBA", (W // 4, H // 4), (0, 0, 0, 0))
    x = (-300 + (W + 600) * ease_io(p)) / 4
    ImageDraw.Draw(lay).rectangle([x - 40, 0, x + 40, H // 4], fill=(255, 255, 255, 225))
    lay = lay.filter(ImageFilter.GaussianBlur(8)).resize((W, H), Image.BILINEAR)
    fr.alpha_composite(lay)


def _cta_image(text):
    brand, url = split_cta(text)
    main = brand or url or ""
    f = fit_font(BLACK_F, 96, main.upper(), MAX_W - 120, min_size=48)
    txt = _glow(text_img(main.upper(), f, WHITE), WHITE, 10)
    sub = None
    if brand and url:
        fs = fit_font(SCRIPT_F, 130, url, MAX_W, min_size=60)
        sub = text_img(url, fs, WHITE)
    return txt, sub


def render(job, assets, out_path, on_progress=None):
    script = job["script"]
    tl = build_timeline(script, job.get("narrationWords"))
    keys = keyword_set(script)
    BG = _background()

    icons = {}
    for sc in tl.scenes:
        path = assets.get("images", {}).get(sc.index)
        if path:
            icons[sc.index] = _icon(path)
    boxes = {}
    for sc in tl.scenes:
        txt = (sc.data.get("onScreen") or "").strip()
        if txt:
            boxes[sc.index] = _box(txt, keys)
    captions = [Caption(sc.words, sc.end - 0.1, keys) for sc in tl.scenes if sc.words]

    cta = script.get("cta") or {}
    cta_txt, cta_sub = _cta_image(cta.get("onScreen") or cta.get("narration") or "")

    def scene_layer(fr, sc, t, fade_out):
        u = t - sc.start
        e = ease(u / 0.5) * (1 - fade_out)
        if e <= 0:
            return
        icon = icons.get(sc.index)
        pulse = 1 + 0.015 * math.sin(t * 3.2)
        if icon is not None:
            put(fr, icon, W / 2, ICON_Y, alpha=e, scale=(0.82 + 0.18 * ease(u / 0.5)) * pulse, blur=10 * fade_out)
        _dotted(fr, W / 2, ICON_Y, RING_R, t, ease(u / 0.9), alpha=e)
        box = boxes.get(sc.index)
        if box is not None and u > 0.2:
            s = back((u - 0.2) / 0.35)
            put(fr, box, W / 2, BOX_Y, alpha=min(1, (u - 0.2) * 5) * (1 - fade_out), scale=max(0.02, s), blur=10 * fade_out)

    def cta_layer(fr, t):
        u = t - tl.cta_start
        if u < 0:
            return
        _dotted(fr, W / 2, 880, 400, t, ease(u / 1.2), alpha=0.6)
        # caixa desenhada com linha animada ao redor da marca
        bw, bh = cta_txt.width + 90, cta_txt.height + 70
        x0, y0 = W / 2 - bw / 2, 880 - bh / 2
        per = 2 * (bw + bh)
        drawn = per * ease(u / 0.9)
        lay = Image.new("RGBA", fr.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        segs = [((x0, y0), (x0 + bw, y0)), ((x0 + bw, y0), (x0 + bw, y0 + bh)),
                ((x0 + bw, y0 + bh), (x0, y0 + bh)), ((x0, y0 + bh), (x0, y0))]
        for (ax, ay), (bx, by) in segs:
            L = abs(bx - ax) + abs(by - ay)
            if drawn <= 0:
                break
            k = min(1, drawn / L)
            d.line([(ax, ay), (ax + (bx - ax) * k, ay + (by - ay) * k)], fill=WHITE, width=4)
            drawn -= L
        fr.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1)))
        fr.alpha_composite(lay)
        p = ease((u - 0.3) / 0.5)
        put(fr, cta_txt, W / 2, 880, alpha=p, blur=8 * (1 - p))
        if cta_sub is not None:
            p2 = ease((u - 0.7) / 0.5)
            put(fr, cta_sub, W / 2, 1090 + 30 * (1 - p2), alpha=p2)

    VIG = vignette(0.2)
    GR = grain_frames(sigma=3, seed=16)
    total = int(round(tl.duration * FPS))
    writer = FrameWriter(out_path)
    for n in range(total):
        t = n / FPS
        fr = BG.copy()
        for k, sc in enumerate(tl.scenes):
            if t < sc.start - 0.01 or t > sc.end + 0.3:
                continue
            fade = ease((t - sc.end) / 0.3) if t > sc.end else 0
            scene_layer(fr, sc, t, fade)
        for c in captions:
            c.draw(fr, t)
        cta_layer(fr, t)
        for k, sc in enumerate(tl.scenes[1:] + [None]):
            ts = sc.start if sc is not None else tl.cta_start
            _sweep(fr, (t - ts + 0.25) / 0.5)
        a = np.asarray(fr.convert("RGB")).astype(np.float32) * VIG
        a += np.repeat(np.repeat(GR[n % len(GR)], 2, 0), 2, 1)[..., None]
        writer.write(np.clip(a, 0, 255).astype(np.uint8))
        if on_progress and n % 30 == 0:
            on_progress(n / total)
    writer.close()
    return tl.duration

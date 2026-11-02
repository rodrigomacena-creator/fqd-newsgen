"""Camada extra do fecho (CTA), igual para todos os estilos: logo, imagem e efeito.

O renderizador do estilo desenha o texto do CTA; aqui desenhamos por cima, quadro a quadro, só
o trecho do fecho (PNGs com transparência) e o ffmpeg sobrepõe ao vídeo. Roteiro antigo (sem
`cta.effect`/`cta.imageUrl`/`cta.logo`) sai igual a antes: só o logo da empresa, se houver.
"""
import math
import os
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .common import FPS, H, W

EFFECTS = ("none", "confete", "brilhos", "pulso", "flash", "seta")
LOGO_TOP = 150


def _ease_out_back(k):
    k = min(max(k, 0.0), 1.0)
    c = 1.70158
    return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2


def _rgb(hex_color, fallback=(232, 50, 43)):
    try:
        h = hex_color.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return fallback


def _logo_card(path, max_w=420, max_h=200):
    logo = Image.open(path).convert("RGBA")
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)
    s = min(max_w / logo.width, max_h / logo.height)
    logo = logo.resize((max(1, round(logo.width * s)), max(1, round(logo.height * s))), Image.LANCZOS)
    pad = 36
    card = Image.new("RGBA", (logo.width + pad * 2, logo.height + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle((0, 0, card.width - 1, card.height - 1), radius=28, fill=(255, 255, 255, 240))
    card.alpha_composite(logo, (pad, pad))
    return card


def _image_card(path, max_side):
    """Imagem do fecho num cartão com borda branca e sombra (sem cortar: cabe inteira)."""
    im = Image.open(path).convert("RGB")
    s = min(max_side / im.width, max_side / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    b = 14
    card = Image.new("RGBA", (im.width + 2 * b, im.height + 2 * b), (0, 0, 0, 0))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.width - 1, card.height - 1), radius=30, fill=255)
    white = Image.new("RGBA", card.size, (255, 255, 255, 255))
    card.paste(white, (0, 0), mask)
    inner = Image.new("L", im.size, 0)
    ImageDraw.Draw(inner).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=20, fill=255)
    card.paste(im, (b, b), inner)
    pad = 50
    out = Image.new("RGBA", (card.width + 2 * pad, card.height + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("L", out.size, 0)
    sh.paste(mask.point(lambda v: v * 0.45), (pad, pad + 16))
    out.paste((0, 0, 0, 255), (0, 0), sh.filter(ImageFilter.GaussianBlur(22)))
    out.alpha_composite(card, (pad, pad))
    return out


def _paste_scaled(frame, img, cx, cy, scale, alpha=1.0, rot=0.0):
    if scale <= 0.01 or alpha <= 0.01:
        return
    w, h = max(1, int(img.width * scale)), max(1, int(img.height * scale))
    im = img.resize((w, h), Image.BILINEAR)
    if abs(rot) > 0.05:
        im = im.rotate(rot, resample=Image.BILINEAR, expand=True)
    if alpha < 1:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im.putalpha(a)
    frame.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


class _Effect:
    def __init__(self, kind, accent, seed=7):
        self.kind = kind
        self.accent = accent
        rng = np.random.default_rng(seed)
        if kind == "confete":
            n = 140
            colors = [accent, (255, 214, 10), (38, 198, 218), (255, 255, 255), (124, 77, 255), (76, 175, 80)]
            self.parts = [dict(x=rng.uniform(0, W), y=rng.uniform(-H * 0.9, -20), vy=rng.uniform(420, 820),
                               vx=rng.uniform(-80, 80), w=rng.uniform(14, 26), h=rng.uniform(8, 14),
                               rot=rng.uniform(0, 360), vr=rng.uniform(-360, 360), sway=rng.uniform(0, 6.28),
                               c=colors[int(rng.integers(len(colors)))]) for _ in range(n)]
        elif kind == "brilhos":
            self.parts = [dict(x=rng.uniform(60, W - 60), y=rng.uniform(140, H * 0.8), t0=rng.uniform(0, 2.5),
                               s=rng.uniform(18, 46)) for _ in range(34)]

    def draw(self, fr, t, dur):
        d = ImageDraw.Draw(fr)
        a = self.accent
        if self.kind == "confete":
            for p in self.parts:
                y = p["y"] + p["vy"] * t
                if y > H + 40:
                    continue
                x = p["x"] + p["vx"] * t + 30 * math.sin(t * 3 + p["sway"])
                ang = math.radians(p["rot"] + p["vr"] * t)
                flip = abs(math.cos(t * 6 + p["sway"]))
                hw, hh = p["w"] / 2, p["h"] / 2 * max(flip, 0.15)
                pts = [(x + dx * math.cos(ang) - dy * math.sin(ang), y + dx * math.sin(ang) + dy * math.cos(ang))
                       for dx, dy in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]
                d.polygon(pts, fill=p["c"] + (235,))
        elif self.kind == "brilhos":
            for p in self.parts:
                k = ((t - p["t0"]) % 1.6) / 1.6
                if t < p["t0"]:
                    continue
                s = p["s"] * math.sin(math.pi * k)
                if s < 2:
                    continue
                x, y = p["x"], p["y"]
                al = int(230 * math.sin(math.pi * k))
                d.polygon([(x, y - s), (x + s * 0.22, y - s * 0.22), (x + s, y), (x + s * 0.22, y + s * 0.22),
                           (x, y + s), (x - s * 0.22, y + s * 0.22), (x - s, y), (x - s * 0.22, y - s * 0.22)],
                          fill=(255, 255, 255, al))
                d.ellipse((x - s * 0.18, y - s * 0.18, x + s * 0.18, y + s * 0.18), fill=a + (al,))
        elif self.kind == "pulso":
            cx, cy = W / 2, H * 0.5
            for i in range(3):
                k = ((t * 0.9 + i / 3) % 1.0)
                r = 180 + k * 520
                al = int(200 * (1 - k) ** 1.5)
                wd = max(2, int(14 * (1 - k)))
                d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=a + (al,), width=wd)
        elif self.kind == "flash":
            if t < 0.45:
                k = 1 - t / 0.45
                fr.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, int(235 * k ** 2))))
            # faixa de luz atravessando
            k = (t - 0.15) / 0.8
            if 0 <= k <= 1:
                x = -300 + k * (W + 600)
                band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                ImageDraw.Draw(band).polygon([(x, 0), (x + 140, 0), (x - 260, H), (x - 400, H)], fill=(255, 255, 255, 70))
                fr.alpha_composite(band.filter(ImageFilter.GaussianBlur(18)))
        elif self.kind == "seta":
            k = min(t / 0.35, 1.0)
            bob = 26 * abs(math.sin(t * 4.2))
            cy = H * 0.68 + bob
            s = 1.0 * _ease_out_back(k)
            if s > 0.05:
                cx = W / 2
                w2, h1, h2 = 70 * s, 60 * s, 110 * s
                d.polygon([(cx - w2 * 0.4, cy - h2), (cx + w2 * 0.4, cy - h2), (cx + w2 * 0.4, cy - h1 + 10 * s),
                           (cx + w2, cy - h1 + 10 * s), (cx, cy), (cx - w2, cy - h1 + 10 * s),
                           (cx - w2 * 0.4, cy - h1 + 10 * s)], fill=a + (255,), outline=(255, 255, 255, 255))


def overlay_cta(video, start, duration, out, logo=None, image=None, effect="none", accent="#E8322B"):
    """Sobrepõe logo, imagem e efeito no fecho. Sem nada para pôr, devolve o vídeo como está."""
    effect = effect if effect in EFFECTS else "none"
    if not logo and not image and effect == "none":
        return video
    start = max(0.0, min(start, duration - 0.5))
    seg = duration - start
    acc = _rgb(accent)
    logo_card = _logo_card(logo) if logo else None
    logo_bottom = LOGO_TOP + (logo_card.height if logo_card else 0)
    img_card = None
    if image:
        top = logo_bottom + 30 if logo_card else 190
        bottom = int(H * 0.42)
        img_card = _image_card(image, max(240, min(560, bottom - top - 60)))
        img_cy = (top + bottom) / 2
    fx = _Effect(effect, acc) if effect != "none" else None

    folder = os.path.splitext(out)[0] + "_cta"
    shutil.rmtree(folder, ignore_errors=True)
    os.makedirs(folder)
    n = max(1, int(math.ceil(seg * FPS)))
    for i in range(n):
        t = i / FPS
        fr = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        if fx is not None and effect in ("pulso", "brilhos"):
            fx.draw(fr, t, seg)  # atrás do logo/imagem
        if img_card is not None:
            k = (t - 0.12) / 0.45
            if k > 0:
                s = _ease_out_back(k)
                _paste_scaled(fr, img_card, W / 2, img_cy + (1 - min(k, 1)) * 60, s, min(1, k * 2),
                              rot=(1 - min(k, 1)) * -6 + 1.5 * math.sin(t * 1.6))
        if logo_card is not None:
            k = t / 0.35
            s = _ease_out_back(k)
            _paste_scaled(fr, logo_card, W / 2, LOGO_TOP + logo_card.height / 2, s, min(1, k * 2))
        if fx is not None and effect not in ("pulso", "brilhos"):
            fx.draw(fr, t, seg)
        fr.save(os.path.join(folder, f"{i:04d}.png"), compress_level=1)

    fc = f"[1:v]format=rgba,setpts=PTS+{start:.3f}/TB[o];[0:v][o]overlay=0:0:eof_action=pass[v]"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", video, "-framerate", str(FPS), "-i", os.path.join(folder, "%04d.png"),
         "-filter_complex", fc, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
         "-pix_fmt", "yuv420p", "-r", str(FPS), "-t", f"{duration:.2f}", out],
        check=True,
    )
    shutil.rmtree(folder, ignore_errors=True)
    return out

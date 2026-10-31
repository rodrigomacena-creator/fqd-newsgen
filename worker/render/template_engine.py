"""Motor genérico dos templates montados pela aplicação (/videogen/templates).

Em vez de um renderizador escrito à mão por estilo, este motor lê uma "ficha de estilo"
(spec, JSON) que a IA preenche ao assistir o vídeo de referência (worker/template_builder.py)
e monta o vídeo com: fundo, tratamento e movimento da imagem de cada cena, transição,
texto da tela (título), legenda sincronizada com a narração, sobreposições (grão, vinheta,
tinta de cor) e card final de CTA.

normalize_spec() é a fonte da verdade do formato: valores fora da lista viram o padrão, números
são limitados a faixas seguras. Assim uma ficha estranha nunca derruba o render.
"""
import math
import re

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from .common import FPS, H, W, FrameWriter, asset, cover_resize, ease, font, grain_frames, group_lines, keyword_set, norm, spread_words, vignette
from .timeline import build_timeline

USES_SCENE_IMAGES = True

# ---------- ficha de estilo ----------

FONTS = {
    "inter-black": "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf",
    "inter-bold": "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
    "inter-medium": "/usr/share/fonts/opentype/inter/Inter-Medium.otf",
    "montserrat-black": asset("fonts", "montserrat-latin-900-normal.woff"),
    "bebas-neue": asset("fonts", "bebas-neue-latin-400-normal.woff"),
    "playfair-italic": asset("fonts", "playfair-display-latin-400-italic.woff"),
    "playfair-black-italic": asset("fonts", "playfair-display-latin-900-italic.woff"),
    "eb-garamond-italic": asset("fonts", "eb-garamond-latin-400-italic.woff"),
    "serif-bold-italic": "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
    "great-vibes": asset("fonts", "great-vibes-latin-400-normal.woff"),
    "allura": asset("fonts", "allura-latin-400-normal.woff"),
}

FONT_DESCRIPTIONS = {
    "inter-black": "sans-serif geométrica pesadíssima (estilo Inter/Helvetica Black)",
    "inter-bold": "sans-serif neutra em negrito",
    "inter-medium": "sans-serif neutra, peso médio (texto limpo, corporativo)",
    "montserrat-black": "sans-serif geométrica larga e pesada",
    "bebas-neue": "condensada alta, só maiúsculas (estilo pôster)",
    "playfair-italic": "serifada itálica elegante, fina (editorial, premium)",
    "playfair-black-italic": "serifada itálica pesada (manchete de revista)",
    "eb-garamond-italic": "serifada clássica itálica (livro, literária)",
    "serif-bold-italic": "serifada tipo Times em negrito itálico",
    "great-vibes": "manuscrita cursiva (script caligráfica)",
    "allura": "manuscrita cursiva leve",
}

CHOICES = {
    "background.kind": ["solid", "gradient", "texture", "blurred_image"],
    "image.layout": ["fullbleed", "card", "circle", "top_half", "none"],
    "image.filter": ["none", "bw", "duotone", "warm", "cool", "contrast", "muted"],
    "image.motion": ["push_in", "pull_out", "pan", "static"],
    "caption.animation": ["word_pop", "word_reveal", "karaoke", "line_fade", "typewriter"],
    "caption.highlight": ["box", "color", "underline", "none"],
    "title.animation": ["slide_up", "fade", "pop", "typewriter"],
    "transition.kind": ["cut", "punch_zoom", "crossfade", "slide_left", "slide_up", "blur_zoom", "flash"],
    "cta.style": ["card", "fullscreen", "banner"],
}

DEFAULT_SPEC = {
    "palette": {"background": "#F5F2EA", "text": "#111111", "accent": "#E10600", "accentText": "#FFFFFF"},
    "background": {"kind": "solid", "color2": "#DDDDDD", "texturePrompt": "", "textureUrl": ""},
    "image": {"layout": "fullbleed", "filter": "none", "motion": "push_in", "scale": 0.82, "y": 0.42,
              "cornerRadius": 24, "shadow": True, "borderColor": "", "borderWidth": 0},
    "caption": {"enabled": True, "font": "inter-black", "size": 96, "uppercase": True, "color": "#FFFFFF",
                "stroke": "#000000", "strokeWidth": 6, "y": 0.72, "animation": "word_pop", "highlight": "box",
                "maxWordsPerLine": 3, "box": False, "boxColor": "#000000"},
    "title": {"enabled": True, "font": "inter-black", "size": 84, "uppercase": True, "color": "#FFFFFF",
              "stroke": "", "strokeWidth": 0, "y": 0.14, "animation": "slide_up", "box": False, "boxColor": "#000000"},
    "transition": {"kind": "punch_zoom", "durationS": 0.25},
    "overlay": {"grain": 0.3, "vignette": 0.3, "tint": "", "tintStrength": 0.0, "letterbox": False},
    "cta": {"style": "card", "background": "#111111", "color": "#FFFFFF", "font": "inter-black"},
}

_HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")


def _color(value, fallback):
    m = _HEX.match(str(value or "").strip())
    return f"#{m.group(1).upper()}" if m else fallback


def _num(value, lo, hi, fallback):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return fallback
    return min(max(v, lo), hi) if math.isfinite(v) else fallback


def normalize_spec(raw):
    """Mescla a ficha recebida com DEFAULT_SPEC e corrige qualquer valor inválido."""
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for group, defaults in DEFAULT_SPEC.items():
        src = raw.get(group) if isinstance(raw.get(group), dict) else {}
        g = {}
        for key, default in defaults.items():
            v = src.get(key, default)
            choices = CHOICES.get(f"{group}.{key}")
            if choices:
                g[key] = v if v in choices else default
            elif key == "font":
                g[key] = v if v in FONTS else default
            elif isinstance(default, bool):
                g[key] = bool(v)
            elif isinstance(default, (int, float)):
                ranges = {"size": (40, 200), "scale": (0.4, 1.0), "y": (0.04, 0.96), "cornerRadius": (0, 200),
                          "borderWidth": (0, 30), "strokeWidth": (0, 14), "maxWordsPerLine": (1, 6),
                          "durationS": (0.05, 0.9), "grain": (0, 1), "vignette": (0, 1), "tintStrength": (0, 0.6)}
                lo, hi = ranges.get(key, (0, 1000))
                g[key] = _num(v, lo, hi, default)
            elif key in ("texturePrompt", "textureUrl"):
                g[key] = str(v or "")[:1500]
            else:  # cores
                allow_empty = default == ""
                if allow_empty and not v:
                    g[key] = ""
                else:
                    g[key] = _color(v, default or "#000000")
        out[group] = g
    out["caption"]["maxWordsPerLine"] = int(out["caption"]["maxWordsPerLine"])
    _ensure_legible(out)
    if out["background"]["kind"] == "texture" and not out["background"]["textureUrl"]:
        out["background"]["kind"] = "solid"  # textura não gerada: cai para cor lisa
    return out


def _is_light(hex_color):
    r, g, b = rgb(hex_color)
    return 0.299 * r + 0.587 * g + 0.114 * b > 150


def _ensure_legible(spec):
    """Evita texto ilegível: tira legenda/título de cima do card e garante contorno sobre foto."""
    img, cap, title = spec["image"], spec["caption"], spec["title"]
    if img["layout"] in ("card", "circle"):
        hfrac = W * img["scale"] * (1.0 if img["layout"] == "circle" else 1.25) / H
        top, bottom = img["y"] - hfrac / 2, img["y"] + hfrac / 2
        if cap["enabled"] and top - 0.03 < cap["y"] < bottom + 0.03 and not cap["box"]:
            if bottom + 0.07 <= 0.93:
                cap["y"] = round(bottom + 0.07, 3)
            else:
                cap["box"] = True
        if title["enabled"] and top - 0.03 < title["y"] < bottom + 0.03 and not title["box"]:
            if top - 0.07 >= 0.06:
                title["y"] = round(top - 0.07, 3)
            else:
                title["box"] = True
    over_photo = img["layout"] in ("fullbleed", "top_half") or spec["background"]["kind"] in ("texture", "blurred_image")
    if over_photo and cap["enabled"] and not cap["box"] and (not cap["stroke"] or cap["strokeWidth"] < 3):
        cap["stroke"] = "#000000" if _is_light(cap["color"]) else "#FFFFFF"
        cap["strokeWidth"] = max(cap["strokeWidth"], 5)
    if over_photo and title["enabled"] and not title["box"] and (not title["stroke"] or title["strokeWidth"] < 3):
        title["stroke"] = "#000000" if _is_light(title["color"]) else "#FFFFFF"
        title["strokeWidth"] = max(title["strokeWidth"], 5)


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------- imagens ----------

def _filter(im, kind, spec):
    if kind == "bw":
        g = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=1)
        return ImageEnhance.Contrast(g.convert("RGB")).enhance(1.15)
    if kind == "duotone":
        g = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=1)
        return ImageOps.colorize(g, black=rgb(spec["palette"]["text"]), white=rgb(spec["palette"]["background"]),
                                 mid=rgb(spec["palette"]["accent"]))
    if kind == "warm":
        a = np.asarray(im).astype(np.float32) * np.array([1.08, 1.0, 0.88])
        return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if kind == "cool":
        a = np.asarray(im).astype(np.float32) * np.array([0.9, 1.0, 1.1])
        return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if kind == "contrast":
        return ImageEnhance.Color(ImageEnhance.Contrast(im).enhance(1.3)).enhance(1.12)
    if kind == "muted":
        return ImageEnhance.Color(im).enhance(0.55)
    return im


def _rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=int(radius), fill=255)
    return m


def _background(spec, scene_img=None, texture=None):
    bg = spec["background"]
    base = rgb(spec["palette"]["background"])
    if bg["kind"] == "texture" and texture is not None:
        return cover_resize(texture).crop((0, 0, W, H)).convert("RGB")
    if bg["kind"] == "blurred_image" and scene_img is not None:
        im = cover_resize(scene_img).crop((0, 0, W, H)).filter(ImageFilter.GaussianBlur(40))
        return ImageEnhance.Brightness(im).enhance(0.75)
    if bg["kind"] == "gradient":
        c1, c2 = np.array(base, np.float32), np.array(rgb(bg["color2"]), np.float32)
        t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
        arr = c1 * (1 - t) + c2 * t
        return Image.fromarray(np.repeat(arr, W, axis=1).astype(np.uint8))
    return Image.new("RGB", (W, H), base)


class SceneVisual:
    """Fundo + imagem da cena já tratados; frame(p) devolve o quadro com o movimento em p (0-1)."""

    def __init__(self, spec, img, texture, seed):
        self.spec = spec
        lay = spec["image"]
        self.layout = lay["layout"] if img is not None else "none"
        self.motion = lay["motion"]
        self.seed = seed
        img = _filter(img.convert("RGB"), lay["filter"], spec) if img is not None else None
        self.bg = _background(spec, img, texture)
        self.big = None
        self.card = None
        if self.layout == "fullbleed":
            self.big = cover_resize(img, int(W * 1.16), int(H * 1.16))
        elif self.layout == "top_half":
            self.big = cover_resize(img, int(W * 1.12), int(H * 0.58 * 1.12))
        elif self.layout in ("card", "circle"):
            cw = int(W * lay["scale"])
            ch = cw if self.layout == "circle" else int(cw * 1.25)
            card = cover_resize(img, cw, ch).crop((0, 0, cw, ch))
            radius = cw / 2 if self.layout == "circle" else lay["cornerRadius"]
            mask = _rounded_mask((cw, ch), radius)
            if lay["borderWidth"] and lay["borderColor"]:
                bw = int(lay["borderWidth"])
                framed = Image.new("RGB", (cw + 2 * bw, ch + 2 * bw), rgb(lay["borderColor"]))
                framed.paste(card, (bw, bw), mask)
                card = framed
                mask = _rounded_mask(framed.size, radius + bw)
            self.card = (card, mask)
            if lay["shadow"]:
                sh = Image.new("L", (card.width + 120, card.height + 120), 0)
                sh.paste(mask.point(lambda v: int(v * 0.45)), (60, 80))
                self.shadow = sh.filter(ImageFilter.GaussianBlur(28))
            else:
                self.shadow = None

    def _zoom(self, p):
        p = ease(p) if self.motion != "static" else 0
        if self.motion == "push_in":
            return 1.0 + 0.08 * p, 0
        if self.motion == "pull_out":
            return 1.08 - 0.08 * p, 0
        if self.motion == "pan":
            return 1.04, (p - 0.5) * (1 if self.seed % 2 else -1)
        return 1.0, 0

    def frame(self, p):
        fr = self.bg.copy()
        z, pan = self._zoom(p)
        if self.big is not None:
            bw, bh = self.big.size
            tw, th = (W, H) if self.layout == "fullbleed" else (W, int(H * 0.58))
            f = 1.16 if self.layout == "fullbleed" else 1.12
            r = min(bw / tw, bh / th)
            cw, ch = min(bw, int(tw * r / (f * z))), min(bh, int(th * r / (f * z)))
            cx = (bw - cw) / 2 + pan * (bw - cw) / 2
            cy = (bh - ch) / 2
            crop = self.big.crop((int(cx), int(cy), int(cx) + cw, int(cy) + ch)).resize((tw, th), Image.BILINEAR)
            fr.paste(crop, (0, 0))
        elif self.card is not None:
            card, mask = self.card
            s = z
            w, h = int(card.width * s), int(card.height * s)
            c, m = card.resize((w, h), Image.BILINEAR), mask.resize((w, h), Image.BILINEAR)
            x = (W - w) // 2 + int(pan * 60)
            y = int(H * self.spec["image"]["y"] - h / 2)
            if self.shadow is not None:
                sh = self.shadow.resize((int(self.shadow.width * s), int(self.shadow.height * s)))
                fr.paste((0, 0, 0), (x - int(60 * s), y - int(60 * s)), sh)
            fr.paste(c, (x, y), m)
        return np.asarray(fr, dtype=np.uint8)


# ---------- texto ----------

def _clean(word):
    return word.strip("\"'()“”*_")


def _plain(text):
    """Tira ênfase em markdown (*palavra*, **palavra**, _palavra_) que a IA às vezes põe no texto da tela."""
    return re.sub(r"(\*{1,2}|_{1,2})(\S(?:.*?\S)?)\1", r"\2", text or "").replace("*", "")


class TextStyle:
    def __init__(self, cfg, palette):
        self.cfg = cfg
        self.path = FONTS[cfg["font"]]
        self.size = int(cfg["size"])
        self.upper = cfg["uppercase"]
        self.color = rgb(cfg["color"])
        self.stroke = rgb(cfg["stroke"]) if cfg.get("stroke") else None
        self.stroke_w = int(cfg.get("strokeWidth") or 0) if self.stroke else 0
        self.accent = rgb(palette["accent"])
        self.accent_text = rgb(palette["accentText"])
        self._cache = {}

    def text(self, s):
        return s.upper() if self.upper else s

    def word_img(self, word, size, mode="normal"):
        """mode: normal | key_box | key_color | key_underline | spoken."""
        key = (word, size, mode)
        if key in self._cache:
            return self._cache[key]
        f = font(self.path, size)
        txt = self.text(_clean(word))
        bb = f.getbbox(txt, stroke_width=self.stroke_w)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        pad = int(size * 0.18) if mode == "key_box" else 6
        lh = int(size * 1.3)
        im = Image.new("RGBA", (tw + 2 * pad, lh + 2 * pad), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        ox, oy = pad - bb[0], pad + (lh - th) // 2 - bb[1]
        fill = self.color
        stroke = self.stroke
        if mode == "key_box":
            d.rectangle([0, int(pad * 0.4), im.width - 1, im.height - 1 - int(pad * 0.4)], fill=self.accent)
            fill, stroke = self.accent_text, None
        elif mode in ("key_color", "spoken"):
            fill = self.accent
        d.text((ox, oy), txt, font=f, fill=fill, stroke_width=self.stroke_w if stroke else 0, stroke_fill=stroke)
        if mode == "key_underline":
            y = oy + bb[3] + int(size * 0.06)
            d.rectangle([pad, y, im.width - pad, y + max(4, size // 14)], fill=self.accent)
        self._cache[key] = im
        return im


def _paste_rgba(fr, im, x, y, alpha=1.0):
    """Cola uma imagem RGBA em um quadro numpy (in place), com opacidade extra."""
    x, y = int(x), int(y)
    h, w = im.height, im.width
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0 or alpha <= 0:
        return
    a = np.asarray(im, dtype=np.float32)[y0 - y:y1 - y, x0 - x:x1 - x]
    m = a[..., 3:4] / 255.0 * alpha
    region = fr[y0:y1, x0:x1].astype(np.float32)
    fr[y0:y1, x0:x1] = (region * (1 - m) + a[..., :3] * m).astype(np.uint8)


def _box(fr, x0, y0, x1, y1, color, alpha=0.85):
    x0, y0, x1, y1 = max(0, int(x0)), max(0, int(y0)), min(W, int(x1)), min(H, int(y1))
    if x1 > x0 and y1 > y0:
        region = fr[y0:y1, x0:x1].astype(np.float32)
        fr[y0:y1, x0:x1] = (region * (1 - alpha) + np.array(color, np.float32) * alpha).astype(np.uint8)


class Captions:
    """Legenda sincronizada: linhas curtas de palavras com tempos da narração."""

    MAX_W = 960

    def __init__(self, spec, words, keys, cta_start):
        self.cfg = spec["caption"]
        self.style = TextStyle(self.cfg, spec["palette"])
        self.keys = keys
        words = [w for w in words if w[1] < cta_start - 0.05 and _clean(w[0])]
        chars = max(8, int(self.MAX_W / (self.cfg["size"] * 0.58)))
        lines = group_lines(words, max_chars=chars, max_words=self.cfg["maxWordsPerLine"])
        self.lines = []
        for i, ln in enumerate(lines):
            start = ln[0][1]
            end = lines[i + 1][0][1] if i + 1 < len(lines) else min(cta_start, ln[-1][2] + 0.6)
            self.lines.append((ln, start, max(end, start + 0.2)))

    def _mode(self, word, spoken):
        hl = self.cfg["highlight"]
        if norm(word) in self.keys and hl != "none":
            return {"box": "key_box", "color": "key_color", "underline": "key_underline"}[hl]
        if spoken:
            return "spoken"
        return "normal"

    def draw(self, fr, t):
        if not self.cfg["enabled"]:
            return
        for ln, start, end in self.lines:
            if start <= t < end:
                self._draw_line(fr, ln, start, end, t)
                return

    def _draw_line(self, fr, ln, start, end, t):
        anim = self.cfg["animation"]
        size = int(self.cfg["size"])
        imgs = [self.style.word_img(w[0], size, self._mode(w[0], False)) for w in ln]
        gap = int(size * 0.22)
        total = sum(i.width for i in imgs) + gap * (len(imgs) - 1)
        while total > self.MAX_W and size > 44:
            size = int(size * 0.9)
            imgs = [self.style.word_img(w[0], size, self._mode(w[0], False)) for w in ln]
            gap = int(size * 0.22)
            total = sum(i.width for i in imgs) + gap * (len(imgs) - 1)
        cy = int(H * self.cfg["y"])
        x = (W - total) // 2
        lh = max(i.height for i in imgs)
        if self.cfg["box"]:
            _box(fr, x - 28, cy - lh // 2 - 14, x + total + 28, cy + lh // 2 + 14, rgb(self.cfg["boxColor"]))
        line_alpha = 1.0
        if anim == "line_fade":
            line_alpha = ease((t - start) / 0.25)
        typed = None
        if anim == "typewriter":
            n_chars = sum(len(_clean(w[0])) for w in ln)
            typed = int(n_chars * min(1.0, (t - start) / max(0.3, min(end - start, 1.4) * 0.8))) + 1
        for w, im in zip(ln, imgs):
            alpha, scale = line_alpha, 1.0
            if anim == "word_pop":
                k = (t - w[1]) / 0.14
                if k < 0:
                    x += im.width + gap
                    continue
                alpha, scale = min(1.0, k * 1.5), 0.6 + 0.4 * ease(k) + 0.08 * math.sin(min(k, 1) * math.pi)
            elif anim == "word_reveal":
                alpha = ease((t - w[1]) / 0.12)
            elif anim == "karaoke" and t >= w[1] and self._mode(w[0], False) == "normal":
                im = self.style.word_img(w[0], size, "spoken")
            if typed is not None:
                n = len(_clean(w[0]))
                if typed <= 0:
                    break
                if typed < n:
                    im = im.crop((0, 0, max(1, int(im.width * typed / n)), im.height))
                typed -= n
            draw_im = im if scale == 1.0 else im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
            _paste_rgba(fr, draw_im, x + (im.width - draw_im.width) / 2, cy - draw_im.height / 2, alpha)
            x += im.width + gap


def _wrap(text, f, max_w):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if cur and f.getlength(trial) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def _text_block(text, style, size, max_w=900, align_center=True, color=None):
    """Bloco de texto (várias linhas) como imagem RGBA, diminuindo a fonte até caber em 4 linhas."""
    txt = style.text(text.strip())
    while True:
        f = font(style.path, size)
        lines = _wrap(txt, f, max_w)
        if len(lines) <= 4 or size <= 40:
            break
        size = int(size * 0.88)
    lh = int(size * 1.18)
    sw = style.stroke_w
    im = Image.new("RGBA", (max_w + 40, lh * len(lines) + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, ln in enumerate(lines):
        lw = f.getlength(ln)
        x = (im.width - lw) / 2 if align_center else 20
        d.text((x, 20 + i * lh), ln, font=f, fill=color or style.color, stroke_width=sw if style.stroke else 0,
               stroke_fill=style.stroke)
    return im.crop(im.getbbox() or (0, 0, 1, 1))


class Title:
    """Texto da tela (onScreen) de cada cena, com animação de entrada."""

    def __init__(self, spec):
        self.cfg = spec["title"]
        self.style = TextStyle(self.cfg, spec["palette"])
        self._cache = {}

    def draw(self, fr, text, local_t):
        text = _plain(text)
        if not self.cfg["enabled"] or not text.strip():
            return
        if text not in self._cache:
            self._cache[text] = _text_block(text, self.style, int(self.cfg["size"]))
        im = self._cache[text]
        anim = self.cfg["animation"]
        k = ease(local_t / 0.45)
        alpha, dy, scale = 1.0, 0, 1.0
        if anim == "slide_up":
            alpha, dy = k, (1 - k) * 60
        elif anim == "fade":
            alpha = k
        elif anim == "pop":
            alpha, scale = min(1, local_t / 0.12), 0.7 + 0.3 * k + 0.06 * math.sin(min(local_t / 0.3, 1) * math.pi)
        elif anim == "typewriter":
            frac = min(1.0, local_t / 0.8)
            im = im.crop((0, 0, max(1, int(im.width * frac)), im.height)) if frac < 1 else im
        cy = int(H * self.cfg["y"])
        draw_im = im if scale == 1.0 else im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
        x = (W - (self._cache[text].width if anim == "typewriter" else draw_im.width)) / 2
        y = cy - draw_im.height / 2 + dy
        if self.cfg["box"]:
            full = self._cache[text]
            _box(fr, (W - full.width) / 2 - 30, cy - full.height / 2 - 22, (W + full.width) / 2 + 30,
                 cy + full.height / 2 + 22, rgb(self.cfg["boxColor"]), 0.9 * alpha)
        _paste_rgba(fr, draw_im, x, y, alpha)


# ---------- quadro final ----------

class Finisher:
    def __init__(self, spec, seed=3):
        ov = spec["overlay"]
        self.vig = vignette(0.25 + 0.6 * ov["vignette"]) if ov["vignette"] > 0.02 else None
        self.grain = grain_frames(sigma=3 + 12 * ov["grain"], seed=seed) if ov["grain"] > 0.02 else None
        self.tint = np.array(rgb(ov["tint"]), np.float32) if ov["tint"] and ov["tintStrength"] > 0 else None
        self.tint_k = ov["tintStrength"]
        self.letterbox = ov["letterbox"]

    def apply(self, fr, n):
        if self.tint is None and self.vig is None and self.grain is None and not self.letterbox:
            return fr
        a = fr.astype(np.float32)
        if self.tint is not None:
            a = a * (1 - self.tint_k) + self.tint * self.tint_k
        if self.vig is not None:
            a *= self.vig
        if self.grain is not None:
            g = self.grain[n % len(self.grain)]
            a += np.repeat(np.repeat(g, 2, 0), 2, 1)[..., None]
        out = np.clip(a, 0, 255).astype(np.uint8)
        if self.letterbox:
            bar = int(H * 0.06)
            out[:bar] = 0
            out[-bar:] = 0
        return out


def _transition(prev, cur, k, kind):
    """Mistura o fim da cena anterior com o início da atual (k vai de 0 a 1)."""
    k = min(max(k, 0.0), 1.0)
    if kind == "crossfade":
        return (prev.astype(np.float32) * (1 - k) + cur.astype(np.float32) * k).astype(np.uint8)
    if kind == "slide_left":
        off = int(W * (1 - ease(k)))
        out = prev.copy()
        out[:, :W - off] = prev[:, off:] if off else prev
        out[:, W - off:] = cur[:, :off] if off else out[:, W - off:]
        return out if off else cur
    if kind == "slide_up":
        off = int(H * (1 - ease(k)))
        if not off:
            return cur
        out = np.empty_like(cur)
        out[:H - off] = prev[off:]
        out[H - off:] = cur[:off]
        return out
    if kind in ("punch_zoom", "blur_zoom"):
        z = 1.0 + (0.18 if kind == "punch_zoom" else 0.1) * (1 - ease(k))
        im = Image.fromarray(cur)
        cw, ch = int(W / z), int(H / z)
        im = im.crop(((W - cw) // 2, (H - ch) // 2, (W - cw) // 2 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BILINEAR)
        blur = (1 - k) * (14 if kind == "blur_zoom" else 6)
        if blur > 0.5:
            im = im.filter(ImageFilter.GaussianBlur(blur))
        return np.asarray(im)
    if kind == "flash":
        w = (1 - k) ** 2
        return (cur.astype(np.float32) * (1 - w) + 255 * w).astype(np.uint8)
    return cur


class CtaCard:
    def __init__(self, spec, text, background_frame):
        cfg = spec["cta"]
        self.style_kind = cfg["style"]
        self.bg_color = rgb(cfg["background"])
        style = TextStyle({"font": cfg["font"], "size": 96, "uppercase": spec["caption"]["uppercase"],
                           "color": cfg["color"], "stroke": "", "strokeWidth": 0}, spec["palette"])
        text = _plain(text)
        self.text = _text_block(text, style, 92, max_w=860) if text.strip() else None
        self.base = background_frame

    def frame(self, local_t):
        k = ease(local_t / 0.35)
        if self.style_kind == "fullscreen" or self.base is None:
            fr = np.empty((H, W, 3), np.uint8)
            fr[:] = self.bg_color
        else:
            fr = self.base.copy()
        if self.text is not None:
            tw, th = self.text.width, self.text.height
            if self.style_kind == "card":
                pad = 60
                y0 = H / 2 - th / 2 - pad
                _box(fr, (W - tw) / 2 - pad, y0 + (1 - k) * 80, (W + tw) / 2 + pad, y0 + th + 2 * pad + (1 - k) * 80,
                     self.bg_color, 0.96 * k)
                _paste_rgba(fr, self.text, (W - tw) / 2, H / 2 - th / 2 + (1 - k) * 80, k)
            elif self.style_kind == "banner":
                y = int(H * 0.78)
                _box(fr, 0, y - th / 2 - 50, W, y + th / 2 + 50, self.bg_color, 0.95 * k)
                _paste_rgba(fr, self.text, (W - tw) / 2 - (1 - k) * 200, y - th / 2, k)
            else:
                s = 0.85 + 0.15 * k
                im = self.text.resize((max(1, int(tw * s)), max(1, int(th * s))))
                _paste_rgba(fr, im, (W - im.width) / 2, H / 2 - im.height / 2, k)
        return fr


# ---------- render ----------

def render(job, assets, out_path, on_progress=None):
    """assets: {"images": {índice: Path}, "texture": Path|None, "spec": dict}. Devolve a duração."""
    spec = normalize_spec(assets.get("spec") or job.get("templateSpec"))
    script = job.get("script") or {}
    words = job.get("narrationWords") or []
    tl = build_timeline(script, words)
    keys = keyword_set(script)
    texture = Image.open(assets["texture"]).convert("RGB") if assets.get("texture") else None

    visuals = {}
    for n, sc in enumerate(tl.scenes):
        path = assets.get("images", {}).get(sc.index)
        img = Image.open(path).convert("RGB") if path else None
        visuals[sc.index] = SceneVisual(spec, img, texture, seed=n)

    cta = script.get("cta") or {}
    cta_words = tl.cta_words or spread_words(cta.get("onScreen") or "", tl.cta_start + 0.1)
    captions = Captions(spec, tl.words, keys, tl.cta_start)
    title = Title(spec)
    finisher = Finisher(spec)
    last_visual = visuals[tl.scenes[-1].index] if tl.scenes else None
    cta_base = last_visual.frame(1.0) if last_visual is not None else None
    if cta_base is not None and spec["cta"]["style"] != "fullscreen":
        cta_base = np.asarray(Image.fromarray(cta_base).filter(ImageFilter.GaussianBlur(18)))
    cta_card = CtaCard(spec, cta.get("onScreen") or " ".join(w[0] for w in cta_words), cta_base)

    trans = spec["transition"]
    tdur = trans["durationS"] if trans["kind"] != "cut" else 0
    total = int(math.ceil(tl.duration * FPS))
    writer = FrameWriter(out_path)
    try:
        for n in range(total):
            t = n / FPS
            if t >= tl.cta_start or not tl.scenes:
                local = t - tl.cta_start
                fr = cta_card.frame(local)
                if local < tdur and tl.scenes:
                    prev = visuals[tl.scenes[-1].index].frame(1.0)
                    fr = _transition(prev, fr, local / tdur, trans["kind"])
            else:
                i = next(k for k, s in enumerate(tl.scenes) if t < s.end or k == len(tl.scenes) - 1)
                sc = tl.scenes[i]
                span = max(sc.end - sc.start, 0.01)
                local = t - sc.start
                fr = visuals[sc.index].frame(local / span)
                if i > 0 and local < tdur:
                    prev_sc = tl.scenes[i - 1]
                    prev = visuals[prev_sc.index].frame(1.0)
                    fr = _transition(prev, fr, local / tdur, trans["kind"])
                fr = np.array(fr, copy=True)
                title.draw(fr, sc.data.get("onScreen") or "", local)
                captions.draw(fr, t)
            fr = finisher.apply(np.ascontiguousarray(fr), n)
            writer.write(fr)
            if on_progress and n % 15 == 0:
                on_progress(n / total)
    finally:
        writer.close()
    return tl.duration

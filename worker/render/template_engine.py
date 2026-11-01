"""Motor genérico dos templates montados pela aplicação (/videogen/templates).

Em vez de um renderizador escrito à mão por estilo, este motor lê uma "ficha de estilo"
(spec, JSON) que a IA preenche ao assistir o vídeo de referência (worker/template_builder.py)
e monta o vídeo com: fundo, tratamento e movimento da imagem de cada cena, transição,
texto da tela (título), legenda sincronizada com a narração, sobreposições (grão, vinheta,
tinta de cor) e card final de CTA.

normalize_spec() é a fonte da verdade do formato: valores fora da lista viram o padrão, números
são limitados a faixas seguras. Assim uma ficha estranha nunca derruba o render.

Roteiro com direção por cena (render/motion.py), em qualquer ficha: a câmera da cena substitui o
movimento da imagem da ficha, o card/círculo entra com o movimento de "objeto", cada cena entra com
o corte escolhido (a transição da ficha continua só na entrada do CTA), o traço à mão sai na cor de
destaque e a palavra-chave da legenda ganha a ênfase. Sem direção, tudo segue como antes.
"""
import math
import re

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from . import motion as mv
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
    "image.motion": ["push_in", "pull_out", "pan", "ken_burns", "zoom_punch", "drift", "static"],
    "caption.animation": ["word_pop", "word_reveal", "karaoke", "line_fade", "typewriter"],
    "caption.highlight": ["box", "color", "underline", "none"],
    "title.animation": ["slide_up", "fade", "pop", "typewriter", "kinetic", "blur_in"],
    "transition.kind": ["cut", "punch_zoom", "crossfade", "slide_left", "slide_up", "blur_zoom", "flash",
                        "whip_pan", "zoom_in", "glitch"],
    "motion.energy": ["calm", "medium", "high"],
    "motion.camera": ["none", "handheld", "shake_on_beat"],
    "motion.particles": ["none", "dust", "bokeh", "sparks"],
    "motion.textIdle": ["none", "float", "pulse"],
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
    # Movimento geral. Os padrões já dão vida a fichas antigas (que não têm este grupo).
    "motion": {"energy": "medium", "camera": "none", "particles": "none", "beatPulse": True, "textIdle": "float",
               "textExit": True},
}

ENERGY = {"calm": 0.6, "medium": 1.0, "high": 1.6}

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
    """Fundo + imagem da cena já tratados; frame(p, ...) devolve o quadro com o movimento em p (0-1).

    Tudo se mexe o tempo todo: a imagem (zoom/pan), o fundo (paralaxe lenta), o card (entra com
    impacto e flutua) e, se a ficha pedir, a câmera (tremida de mão ou tranco na batida).
    """

    def __init__(self, spec, img, texture, seed):
        self.spec = spec
        lay = spec["image"]
        mo = spec["motion"]
        self.layout = lay["layout"] if img is not None else "none"
        self.motion = lay["motion"]
        self.amp = ENERGY[mo["energy"]]
        self.camera = mo["camera"]
        self.seed = seed
        self.dir = 1 if seed % 2 else -1
        rnd = np.random.default_rng(seed + 11)
        self.phase = rnd.uniform(0, 6.28, 6)
        img = _filter(img.convert("RGB"), lay["filter"], spec) if img is not None else None
        self.bg = _background(spec, img, texture)
        # fundo com folga para a paralaxe (cor lisa não precisa)
        self.bg_moves = spec["background"]["kind"] != "solid"
        if self.bg_moves:
            self.bg_big = self.bg.resize((int(W * 1.08), int(H * 1.08)), Image.BILINEAR)
        self.big = None
        self.card = None
        self.shadow = None
        self.direction = None  # direção da cena (motion.py), quando o roteiro tem
        self.box = None  # caixa do card no último quadro (para o traço à mão)
        if self.layout == "fullbleed":
            self.big = cover_resize(img, int(W * 1.3), int(H * 1.3))
        elif self.layout == "top_half":
            self.big = cover_resize(img, int(W * 1.25), int(H * 0.58 * 1.25))
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
            rgba = card.convert("RGBA")
            rgba.putalpha(mask)
            self.card = rgba
            if lay["shadow"]:
                sh = Image.new("L", (card.width + 120, card.height + 120), 0)
                sh.paste(mask.point(lambda v: int(v * 0.45)), (60, 80))
                self.shadow = sh.filter(ImageFilter.GaussianBlur(28))

    def _zoom(self, p):
        """(zoom, pan_x, pan_y) da imagem em p. Mistura linear + ease para nunca "parar" no meio."""
        a = self.amp
        if self.direction:  # câmera da direção da cena
            z, dx, dy = mv.camera(self.direction["camera"], p, 1.0)
            return 1.0 + (z - 1.0) * 1.5 * a, dx / 45 * 0.7 * a, dy / 60 * 0.6 * a
        q = 0.45 * p + 0.55 * ease(p)
        m = self.motion
        if m == "push_in":
            return 1.0 + 0.14 * a * q, 0.0, 0.0
        if m == "pull_out":
            return 1.0 + 0.14 * a * (1 - q), 0.0, 0.0
        if m == "pan":
            return 1.06 + 0.03 * a, (q - 0.5) * 1.6 * self.dir, 0.0
        if m == "ken_burns":
            return 1.02 + 0.12 * a * q, (q - 0.5) * 1.0 * self.dir, (0.5 - q) * 0.6
        if m == "zoom_punch":  # entra fechado e abre rápido, depois segue aproximando devagar
            hit = (1 - ease(min(p / 0.18, 1.0))) * 0.16 * a
            return 1.02 + hit + 0.05 * a * p, 0.0, 0.0
        if m == "drift":  # flutua devagar em todas as direções
            t = p * 3.0
            return (1.06 + 0.02 * a * math.sin(t + self.phase[0]),
                    0.35 * a * math.sin(t * 0.9 + self.phase[1]),
                    0.25 * a * math.sin(t * 0.7 + self.phase[2]))
        return 1.0, 0.0, 0.0

    def _camera(self, t, pulse):
        """Deslocamento (px) da câmera: tremida de mão contínua ou tranco nas batidas."""
        if self.camera == "handheld":
            k = 7 * self.amp
            ph = self.phase
            return (k * (math.sin(t * 2.1 + ph[3]) + 0.5 * math.sin(t * 5.3 + ph[4])),
                    k * (math.sin(t * 1.7 + ph[5]) + 0.5 * math.sin(t * 4.1 + ph[0])))
        if self.camera == "shake_on_beat" and pulse > 0.01:
            k = 22 * self.amp * pulse
            return k * math.sin(t * 61), k * math.cos(t * 47)
        return 0.0, 0.0

    def frame(self, p, local_t=0.0, t=0.0, pulse=0.0, shake=0.0):
        z, panx, pany = self._zoom(p)
        z += 0.05 * self.amp * pulse
        sx, sy = self._camera(t, shake)
        if self.bg_moves:
            bw, bh = self.bg_big.size
            ox = (bw - W) / 2 * (1 - (p - 0.5) * 0.8 * self.dir) - sx * 0.4
            oy = (bh - H) / 2 - sy * 0.4
            ox, oy = min(max(ox, 0), bw - W), min(max(oy, 0), bh - H)
            fr = self.bg_big.crop((int(ox), int(oy), int(ox) + W, int(oy) + H))
        else:
            fr = self.bg.copy()
        if self.big is not None:
            bw, bh = self.big.size
            tw, th = (W, H) if self.layout == "fullbleed" else (W, int(H * 0.58))
            f = 1.3 if self.layout == "fullbleed" else 1.25
            r = min(bw / tw, bh / th)
            cw, ch = min(bw, int(tw * r / (f * z))), min(bh, int(th * r / (f * z)))
            cx = (bw - cw) / 2 + panx * (bw - cw) / 2 - sx
            cy = (bh - ch) / 2 + pany * (bh - ch) / 2 - sy
            cx, cy = min(max(cx, 0), bw - cw), min(max(cy, 0), bh - ch)
            crop = self.big.crop((int(cx), int(cy), int(cx) + cw, int(cy) + ch)).resize((tw, th), Image.BILINEAR)
            fr.paste(crop, (0, 0))
        elif self.card is not None and self.direction:
            # card como "objeto" da direção (mola, queda, balanço...) + flutuação leve
            dx, dy, s, rot = mv.object_motion(self.direction["object"], local_t)
            s *= 1.0 + 0.5 * (z - 1.0) + 0.03 * pulse
            bob = math.sin(local_t * 2.2 + self.phase[0]) * 6 * self.amp
            card = self.card.resize((max(1, int(self.card.width * s)), max(1, int(self.card.height * s))), Image.BILINEAR)
            if abs(rot) > 0.05:
                card = card.rotate(rot, resample=Image.BILINEAR, expand=True)
            x = (W - card.width) / 2 + panx * 60 + dx + sx
            y = H * self.spec["image"]["y"] - card.height / 2 + bob + dy + sy
            if self.shadow is not None:
                sh = self.shadow.resize((max(1, int(self.shadow.width * s)), max(1, int(self.shadow.height * s))))
                fr.paste((0, 0, 0), (int(x + (card.width - sh.width) / 2), int(y + (card.height - sh.height) / 2 + 20 * s)), sh)
            fr.paste(card, (int(x), int(y)), card)
            self.box = (x, y, x + card.width, y + card.height)
        elif self.card is not None:
            # entrada com impacto (sobe e passa um pouco do tamanho) + flutuação contínua
            k = min(local_t / 0.4, 1.0)
            enter = 0.82 + 0.18 * ease(k) + 0.05 * math.sin(k * math.pi) * self.amp
            s = enter * (0.97 + 0.06 * (z - 1.0) / max(0.14 * self.amp, 0.01) * 0.5 + 0.03 * pulse)
            bob = math.sin(local_t * 2.2 + self.phase[0]) * 12 * self.amp
            rot = math.sin(local_t * 1.3 + self.phase[1]) * 1.6 * self.amp
            card = self.card.resize((max(1, int(self.card.width * s)), max(1, int(self.card.height * s))), Image.BILINEAR)
            if abs(rot) > 0.05:
                card = card.rotate(rot, resample=Image.BILINEAR, expand=True)
            x = (W - card.width) / 2 + panx * 70 + sx
            y = H * self.spec["image"]["y"] - card.height / 2 + bob + (1 - ease(k)) * 90 + sy
            if self.shadow is not None:
                sh = self.shadow.resize((max(1, int(self.shadow.width * s)), max(1, int(self.shadow.height * s))))
                fr.paste((0, 0, 0), (int(x + (card.width - sh.width) / 2), int(y + (card.height - sh.height) / 2 + 20 * s)), sh)
            fr.paste(card, (int(x), int(y)), card)
        return np.asarray(fr, dtype=np.uint8)


class Particles:
    """Partículas flutuando por cima da imagem (poeira, bokeh desfocado ou faíscas)."""

    def __init__(self, spec, seed=5):
        self.kind = spec["motion"]["particles"]
        if self.kind == "none":
            return
        amp = ENERGY[spec["motion"]["energy"]]
        rnd = np.random.default_rng(seed)
        n = {"dust": 60, "bokeh": 18, "sparks": 40}[self.kind]
        self.x0 = rnd.uniform(0, W, n)
        self.y0 = rnd.uniform(0, H, n)
        self.ph = rnd.uniform(0, 6.28, n)
        if self.kind == "dust":
            self.vy, self.vx = rnd.uniform(-25, -8, n) * amp, rnd.uniform(-8, 8, n)
            sizes, color, soft = rnd.uniform(2, 5, n), (255, 255, 255), 1.2
        elif self.kind == "bokeh":
            self.vy, self.vx = rnd.uniform(-14, -4, n) * amp, rnd.uniform(-10, 10, n)
            sizes, color, soft = rnd.uniform(28, 80, n), rgb(spec["palette"]["accent"]), 0.55
        else:
            self.vy, self.vx = rnd.uniform(-120, -50, n) * amp, rnd.uniform(-30, 30, n)
            sizes, color, soft = rnd.uniform(2, 4, n), rgb(spec["palette"]["accent"]), 1.0
        self.alpha = rnd.uniform(0.25, 0.7, n) if self.kind != "bokeh" else rnd.uniform(0.08, 0.22, n)
        self.sprites = [self._sprite(int(sz), color, soft) for sz in sizes]

    @staticmethod
    def _sprite(r, color, soft):
        size = r * 2 + 4
        yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
        d = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2) / r
        a = np.clip((1 - d) * (1 / max(1 - soft * 0.6, 0.15)), 0, 1)
        arr = np.zeros((size, size, 4), np.uint8)
        arr[..., :3] = color
        arr[..., 3] = (a * 255).astype(np.uint8)
        return Image.fromarray(arr, "RGBA")

    def draw(self, fr, t):
        if self.kind == "none":
            return
        for i, sp in enumerate(self.sprites):
            x = (self.x0[i] + self.vx[i] * t + 18 * math.sin(t * 0.8 + self.ph[i])) % (W + 100) - 50
            y = (self.y0[i] + self.vy[i] * t) % (H + 100) - 50
            flicker = 0.75 + 0.25 * math.sin(t * 3 + self.ph[i]) if self.kind == "sparks" else 1.0
            _paste_rgba(fr, sp, x - sp.width / 2, y - sp.height / 2, self.alpha[i] * flicker)


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

    def __init__(self, spec, words, keys, cta_start, emphasis_at=None):
        self.emphasis_at = emphasis_at  # t -> tipo de ênfase da cena (roteiro com direção) ou None
        self.cfg = spec["caption"]
        self.style = TextStyle(self.cfg, spec["palette"])
        self.keys = keys
        self.amp = ENERGY[spec["motion"]["energy"]]
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
            rot = 0.0
            emph = self.emphasis_at(w[1]) if self.emphasis_at and norm(w[0]) in self.keys else None
            if emph and t >= w[1]:  # palavra-chave com a ênfase da direção da cena
                e, rot, frac, _ = mv.emphasis(emph, t - w[1])
                scale, alpha = e, max(alpha, line_alpha)
                im = mv.reveal_left(im, frac)
            elif anim != "typewriter" and w[1] <= t < w[1] + 0.3:  # a palavra falada agora dá um "pulo"
                k = (t - w[1]) / 0.3
                scale *= 1 + 0.09 * self.amp * math.sin(k * math.pi)
            if typed is not None:
                n = len(_clean(w[0]))
                if typed <= 0:
                    break
                if typed < n:
                    im = im.crop((0, 0, max(1, int(im.width * typed / n)), im.height))
                typed -= n
            draw_im = im if scale == 1.0 else im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
            if abs(rot) > 0.05:
                draw_im = draw_im.rotate(rot, Image.BILINEAR, expand=True)
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
    """Texto da tela (onScreen) de cada cena: entrada animada, "respiração" enquanto fica na tela
    e saída rápida antes do corte."""

    def __init__(self, spec):
        self.cfg = spec["title"]
        self.mo = spec["motion"]
        self.amp = ENERGY[self.mo["energy"]]
        self.style = TextStyle(self.cfg, spec["palette"])
        self._cache = {}
        self._words = {}

    def _kinetic_layout(self, text):
        """Palavras soltas com a posição de cada uma no bloco (para entrarem uma a uma)."""
        if text in self._words:
            return self._words[text]
        size = int(self.cfg["size"])
        txt = self.style.text(text.strip())
        while True:
            f = font(self.style.path, size)
            lines = _wrap(txt, f, 900)
            if len(lines) <= 4 or size <= 40:
                break
            size = int(size * 0.88)
        lh = int(size * 1.18)
        sw = self.style.stroke_w if self.style.stroke else 0
        items = []
        for li, ln in enumerate(lines):
            parts = ln.split()
            widths = [f.getlength(w) for w in parts]
            space = f.getlength(" ")
            x = (W - (sum(widths) + space * (len(parts) - 1))) / 2
            for w, wd in zip(parts, widths):
                bb = f.getbbox(w, stroke_width=sw)
                im = Image.new("RGBA", (int(wd) + 2 * sw + 8, lh + 2 * sw), (0, 0, 0, 0))
                ImageDraw.Draw(im).text((sw + 4, sw), w, font=f, fill=self.style.color, stroke_width=sw,
                                        stroke_fill=self.style.stroke)
                items.append((im, x - sw - 4, li * lh, bb))
                x += wd + space
        total_h = lh * len(lines)
        self._words[text] = (items, total_h)
        return self._words[text]

    def _idle(self, local_t):
        idle = self.mo["textIdle"]
        if idle == "float":
            return math.sin(local_t * 2.4) * 7 * self.amp, 1.0
        if idle == "pulse":
            return 0.0, 1.0 + 0.025 * self.amp * math.sin(local_t * 4.2)
        return 0.0, 1.0

    def draw(self, fr, text, local_t, span=99.0):
        text = _plain(text)
        if not self.cfg["enabled"] or not text.strip():
            return
        anim = self.cfg["animation"]
        cy = int(H * self.cfg["y"])
        idle_dy, idle_s = self._idle(local_t)
        # saída: some subindo nos últimos 0,18s da cena (só em cenas com tempo para isso)
        out = 0.0
        if self.mo["textExit"] and span > 0.9:
            out = ease(max(0.0, (local_t - (span - 0.18)) / 0.18))
        exit_alpha, exit_dy = 1 - out, -40 * out

        if anim == "kinetic":
            items, total_h = self._kinetic_layout(text)
            top = cy - total_h / 2
            if self.cfg["box"]:
                xs = [x for _, x, _, _ in items]
                x1s = [x + im.width for im, x, _, _ in items]
                _box(fr, min(xs) - 30, top - 22, max(x1s) + 30, top + total_h + 22, rgb(self.cfg["boxColor"]),
                     0.9 * min(1, local_t / 0.15) * exit_alpha)
            for i, (im, x, y, _) in enumerate(items):
                k = (local_t - i * 0.07) / 0.28
                if k <= 0:
                    continue
                e = ease(k)
                sc = 0.6 + 0.4 * e + 0.08 * math.sin(min(k, 1) * math.pi) * self.amp
                d = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc)))) if abs(sc - 1) > 0.01 else im
                _paste_rgba(fr, d, x + (im.width - d.width) / 2,
                            top + y + (im.height - d.height) / 2 + (1 - e) * 50 + idle_dy + exit_dy,
                            min(1.0, k * 2) * exit_alpha)
            return

        if text not in self._cache:
            self._cache[text] = _text_block(text, self.style, int(self.cfg["size"]))
        full = self._cache[text]
        im = full
        k = ease(local_t / 0.45)
        alpha, dy, scale = 1.0, 0, 1.0
        if anim == "slide_up":
            alpha, dy = k, (1 - k) * 90 * self.amp
        elif anim == "fade":
            alpha = k
        elif anim == "pop":
            alpha, scale = min(1, local_t / 0.12), 0.6 + 0.4 * k + 0.1 * self.amp * math.sin(min(local_t / 0.3, 1) * math.pi)
        elif anim == "blur_in":
            alpha, scale = k, 1.12 - 0.12 * k
            blur = (1 - k) * 14
            if blur > 0.4:
                im = im.filter(ImageFilter.GaussianBlur(blur))
        elif anim == "typewriter":
            frac = min(1.0, local_t / 0.8)
            im = im.crop((0, 0, max(1, int(im.width * frac)), im.height)) if frac < 1 else im
        scale *= idle_s
        dy += idle_dy + exit_dy
        alpha *= exit_alpha
        draw_im = im if abs(scale - 1.0) < 0.005 else im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
        x = (W - (full.width if anim == "typewriter" else draw_im.width)) / 2
        y = cy - draw_im.height / 2 + dy
        if self.cfg["box"]:
            _box(fr, (W - full.width) / 2 - 30, cy - full.height / 2 - 22 + dy, (W + full.width) / 2 + 30,
                 cy + full.height / 2 + 22 + dy, rgb(self.cfg["boxColor"]), 0.9 * alpha)
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
    if kind == "whip_pan":  # chicote: desliza rápido com rastro de movimento
        off = int(W * (1 - ease(k)))
        if not off:
            return cur
        out = np.empty_like(cur)
        out[:, :W - off] = prev[:, off:]
        out[:, W - off:] = cur[:, :off]
        strength = math.sin(k * math.pi)
        if strength > 0.05:
            step = max(1, int(26 * strength))
            acc = out.astype(np.float32)
            for j in (1, 2, 3, 4):
                acc += np.roll(out, j * step, axis=1)
            out = (acc / 5).astype(np.uint8)
        return out
    if kind == "zoom_in":  # mergulha na cena anterior e sai já na nova
        if k < 0.5:
            src, z, blur = prev, 1.0 + 0.5 * ease(k * 2), 16 * k * 2
        else:
            src, z, blur = cur, 1.0 + 0.3 * (1 - ease((k - 0.5) * 2)), 16 * (1 - (k - 0.5) * 2)
        im = Image.fromarray(src)
        cw, ch = int(W / z), int(H / z)
        im = im.crop(((W - cw) // 2, (H - ch) // 2, (W - cw) // 2 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BILINEAR)
        if blur > 0.5:
            im = im.filter(ImageFilter.GaussianBlur(blur))
        return np.asarray(im)
    if kind == "glitch":  # canais de cor separados e faixas deslocadas, sumindo
        w = (1 - k) ** 1.5
        src = prev if k < 0.35 else cur
        out = src.copy()
        sh = int(30 * w)
        if sh:
            out[..., 0] = np.roll(src[..., 0], sh, axis=1)
            out[..., 2] = np.roll(src[..., 2], -sh, axis=1)
        rnd = np.random.default_rng(int(k * 1000))
        for _ in range(int(8 * w)):
            y0 = int(rnd.integers(0, H - 40))
            hh = int(rnd.integers(10, 90))
            out[y0:y0 + hh] = np.roll(out[y0:y0 + hh], int(rnd.integers(-120, 120) * w), axis=1)
        return out
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

    directed = mv.has_direction(script)
    dirs = {sc.index: mv.direction_of(sc.data, sc.index) for sc in tl.scenes} if directed else {}
    marks = mv.Marks(tl, keys, norm, dirs) if directed else None
    accent = rgb(spec["palette"]["accent"])
    bg_fill = rgb(spec["palette"]["background"])

    visuals = {}
    for n, sc in enumerate(tl.scenes):
        path = assets.get("images", {}).get(sc.index)
        img = Image.open(path).convert("RGB") if path else None
        visuals[sc.index] = SceneVisual(spec, img, texture, seed=n)
        visuals[sc.index].direction = dirs.get(sc.index)

    def emphasis_at(t):
        sc = max((s for s in tl.scenes if s.start <= t), key=lambda s: s.start, default=None)
        return dirs[sc.index]["emphasis"] if sc is not None else None

    cta = script.get("cta") or {}
    cta_words = tl.cta_words or spread_words(cta.get("onScreen") or "", tl.cta_start + 0.1)
    captions = Captions(spec, tl.words, keys, tl.cta_start, emphasis_at if directed else None)
    title = Title(spec)
    finisher = Finisher(spec)
    particles = Particles(spec)
    mo = spec["motion"]
    # batidas: começo de cada cena e cada palavra-chave falada (dão o "tranco" de zoom/câmera)
    beats = sorted({sc.start for sc in tl.scenes[1:]} |
                   {w[1] for w in tl.words if norm(w[0]) in keys and w[1] < tl.cta_start})

    def beat_at(t):
        b = 0.0
        for s0 in beats:
            if s0 > t:
                break
            if t - s0 < 0.3:
                b = max(b, (1 - (t - s0) / 0.3) ** 2)
        return b

    last_visual = visuals[tl.scenes[-1].index] if tl.scenes else None
    cta_base = last_visual.frame(1.0, 99.0) if last_visual is not None else None
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
                    prev = visuals[tl.scenes[-1].index].frame(1.0, 99.0, t)
                    fr = _transition(prev, fr, local / tdur, trans["kind"])
                fr = np.array(fr, copy=True)
                particles.draw(fr, t)
            else:
                i = next(k for k, s in enumerate(tl.scenes) if t < s.end or k == len(tl.scenes) - 1)
                sc = tl.scenes[i]
                span = max(sc.end - sc.start, 0.01)
                local = t - sc.start
                b = beat_at(t)
                vis = visuals[sc.index]
                fr = vis.frame(local / span, local, t, b if mo["beatPulse"] else 0.0, b)
                flash = 0.0
                if directed:
                    if marks.kind.get(sc.index, "none") != "none" and t >= marks.at[sc.index]:
                        box = vis.box or (W * 0.22, H * 0.3, W * 0.78, H * 0.54)
                        im = Image.fromarray(fr).convert("RGBA")
                        marks.draw(im, sc.index, t, box, None, accent, 14)
                        fr = np.asarray(im.convert("RGB"))
                    if i > 0 and local < mv.CUT_LEN:
                        d = dirs[sc.index]
                        im, _ = mv.apply_cut(Image.fromarray(fr).convert("RGBA"), d["cut"], local, bg_fill)
                        fr = np.asarray(im.convert("RGB"))
                        flash = mv.cut_flash(d["cut"], local)
                elif i > 0 and local < tdur:
                    prev_sc = tl.scenes[i - 1]
                    prev = visuals[prev_sc.index].frame(1.0, prev_sc.end - prev_sc.start, t)
                    fr = _transition(prev, fr, local / tdur, trans["kind"])
                fr = np.array(fr, copy=True)
                if flash > 0:
                    fr = np.clip(fr.astype(np.float32) + 60 * flash, 0, 255).astype(np.uint8)
                particles.draw(fr, t)
                title.draw(fr, sc.data.get("onScreen") or "", local, span)
                captions.draw(fr, t)
            fr = finisher.apply(np.ascontiguousarray(fr), n)
            writer.write(fr)
            if on_progress and n % 15 == 0:
                on_progress(n / total)
    finally:
        writer.close()
    return tl.duration

"""Movimento compartilhado pelos renderizadores: direção por cena (espelho de src/lib/videogen/direction.ts),
molas, cortes de entrada, objeto recortado com sombra (2,5D), traços desenhados à mão e ênfase da palavra-chave.

Cada cena do roteiro pode trazer `direction = {cut, camera, object, mark, emphasis}`. Roteiro sem
direção nenhuma (anterior a isto) = o renderizador segue exatamente como antes (`has_direction`).
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .common import H, W

OPTIONS = {
    "cut": ["punch", "whip_left", "whip_right", "zoom_in", "zoom_out", "spin", "dip"],
    "camera": ["push_in", "pull_out", "drift_left", "drift_right", "rise", "still"],
    "object": ["pop", "slide_up", "drop", "swing", "float"],
    "mark": ["none", "circle", "arrow_left", "arrow_right", "underline", "cross", "check", "burst"],
    "emphasis": ["sweep", "slam", "stamp"],
}
_CUTS = ["punch", "whip_right", "zoom_in", "whip_left", "spin", "zoom_out"]
_CAMS = ["push_in", "drift_left", "pull_out", "drift_right", "rise"]
_OBJS = ["pop", "slide_up", "float", "drop", "swing"]


def default_direction(i):
    return {"cut": _CUTS[i % len(_CUTS)], "camera": _CAMS[i % len(_CAMS)], "object": _OBJS[i % len(_OBJS)],
            "mark": "none", "emphasis": "sweep"}


def has_direction(script):
    return any(isinstance((s or {}).get("direction"), dict) for s in (script.get("scenes") or []))


def direction_of(scene_data, i):
    d = default_direction(i)
    raw = (scene_data or {}).get("direction")
    if isinstance(raw, dict):
        for k, opts in OPTIONS.items():
            if raw.get(k) in opts:
                d[k] = raw[k]
    return d


# ---------- curvas ----------

def clamp(x, a=0.0, b=1.0):
    return min(max(x, a), b)


def expo_out(x):
    x = clamp(x)
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def ease_io(x):
    return 0.5 - 0.5 * math.cos(math.pi * clamp(x))


def spring(u, freq=14.0, damp=7.0):
    """0 → 1 passando um pouco do ponto e voltando."""
    if u <= 0:
        return 0.0
    return 1 - math.exp(-damp * u) * math.cos(freq * u)


def bounce_out(x):
    x = clamp(x)
    n, d = 7.5625, 2.75
    if x < 1 / d:
        return n * x * x
    if x < 2 / d:
        x -= 1.5 / d
        return n * x * x + 0.75
    if x < 2.5 / d:
        x -= 2.25 / d
        return n * x * x + 0.9375
    x -= 2.625 / d
    return n * x * x + 0.984375


# ---------- utilidades de imagem ----------

def paste(fr, im, x, y):
    """alpha_composite aceitando posição parcialmente fora do quadro."""
    x, y = int(x), int(y)
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + im.width, fr.width), min(y + im.height, fr.height)
    if x1 <= x0 or y1 <= y0:
        return
    fr.alpha_composite(im.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


def _zoom(fr, z):
    if z <= 1.0001:
        return fr
    cw, ch = fr.width / z, fr.height / z
    return fr.resize(fr.size, Image.BILINEAR, box=((fr.width - cw) / 2, (fr.height - ch) / 2, (fr.width + cw) / 2, (fr.height + ch) / 2))


def _hblur(arr, k):
    k = int(k)
    if k < 2:
        return arr
    c = np.cumsum(np.pad(arr.astype(np.float32), ((0, 0), (k, k), (0, 0)), mode="edge"), axis=1)
    return ((c[:, 2 * k:] - c[:, :-2 * k]) / (2 * k))[:, : arr.shape[1]]


# ---------- corte de entrada (quadro inteiro) ----------

CUT_LEN = 0.45


def apply_cut(fr, kind, u, fill=(240, 237, 230)):
    """Entrada da cena no tempo local u. Devolve (quadro RGBA, intensidade 0–1 para aberração/flash)."""
    if u < 0 or u > CUT_LEN:
        return fr, 0.0
    fill = tuple(fill[:3]) + (255,)
    if kind == "punch":
        p = expo_out(u / 0.32)
        fr = _zoom(fr, 1 + 0.22 * (1 - p))
        if 1 - p > 0.05:
            fr = fr.filter(ImageFilter.GaussianBlur(10 * (1 - p)))
        return fr, 1 - p
    if kind in ("whip_left", "whip_right"):
        p = expo_out(u / 0.3)
        s = 1 if kind == "whip_left" else -1
        a = np.roll(np.asarray(fr.convert("RGB")), int(s * 520 * (1 - p)), axis=1)
        a = _hblur(a, 60 * (1 - p))
        return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA"), 0.7 * (1 - p)
    if kind == "zoom_in":
        p = expo_out(u / 0.42)
        fr = _zoom(fr, 1 + 0.5 * (1 - p))
        if 1 - p > 0.05:
            fr = fr.filter(ImageFilter.GaussianBlur(8 * (1 - p)))
        return fr, 0.6 * (1 - p)
    if kind == "zoom_out":
        p = expo_out(u / 0.4)
        z = 0.82 + 0.18 * p
        small = fr.resize((int(fr.width * z), int(fr.height * z)), Image.BILINEAR)
        base = Image.new("RGBA", fr.size, fill)
        base.alpha_composite(small, ((fr.width - small.width) // 2, (fr.height - small.height) // 2))
        return base, 0.5 * (1 - p)
    if kind == "spin":
        p = expo_out(u / 0.42)
        fr = _zoom(fr, 1 + 0.35 * (1 - p)).rotate(-14 * (1 - p), Image.BILINEAR, fillcolor=fill)
        if 1 - p > 0.05:
            fr = fr.filter(ImageFilter.GaussianBlur(7 * (1 - p)))
        return fr, 0.8 * (1 - p)
    if kind == "dip":
        p = clamp(u / 0.18)
        return Image.blend(fr, Image.new("RGBA", fr.size, (0, 0, 0, 255)), 0.65 * (1 - p)), 0.0
    return fr, 0.0


def cut_flash(kind, u):
    """Brilho extra (0–1) do flash do 'punch' logo depois do corte."""
    return clamp(1 - u / 0.15) if kind == "punch" and u >= 0 else 0.0


# ---------- câmera ----------

def camera(kind, u, length):
    """(zoom, dx, dy) do movimento contínuo do fundo."""
    p = ease_io(u / max(length, 0.01))
    if kind == "push_in":
        return 1.0 + 0.08 * p, 0.0, 0.0
    if kind == "pull_out":
        return 1.08 - 0.08 * p, 0.0, 0.0
    if kind == "drift_left":
        return 1.0, 45 - 90 * p, 0.0
    if kind == "drift_right":
        return 1.0, -45 + 90 * p, 0.0
    if kind == "rise":
        return 1.0, 0.0, 60 - 120 * p
    return 1.0, 0.0, 0.0


# ---------- objeto (camada própria com sombra) ----------

def object_motion(kind, u):
    """(dx, dy, escala, rotação) do objeto no tempo local u."""
    if kind == "pop":
        return 0.0, 0.0, 0.35 + 0.65 * spring(u, 15, 6.5), 0.0
    if kind == "slide_up":
        return 0.0, 700 * (1 - expo_out(u / 0.5)), 1.0, 6 * (1 - spring(u, 12, 6))
    if kind == "drop":
        return 0.0, -1100 * (1 - bounce_out(u / 0.7)), 1.0, -4 * (1 - expo_out(u / 0.8))
    if kind == "swing":
        return 0.0, 0.0, 0.6 + 0.4 * expo_out(u / 0.3), 9 * math.exp(-2.2 * u) * math.cos(8.5 * u)
    return 0.0, 12 * math.sin(2.1 * u), 0.88 + 0.12 * expo_out(u / 0.45), 1.5 * math.sin(1.3 * u)  # float


class ObjectLayer:
    """Objeto recortado (RGBA) posicionado no quadro, com sombra que acompanha o movimento."""

    def __init__(self, rgba, center, width_frac=None, max_h=None, scale=1.0, shadow=0.42):
        bbox = rgba.getchannel("A").getbbox() or (0, 0, rgba.width, rgba.height)
        im = rgba.crop(bbox)
        s = scale
        if width_frac:
            s = W * width_frac / im.width
        if max_h:
            s = min(s, max_h / im.height)
        self.im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        self.cx, self.cy = center
        pad = 60
        sh = Image.new("L", (self.im.width + 2 * pad, self.im.height + 2 * pad), 0)
        sh.paste(self.im.getchannel("A"), (pad, pad))
        sh = sh.filter(ImageFilter.GaussianBlur(18)).point(lambda v: int(v * shadow))
        self.shadow = Image.new("RGBA", sh.size, (0, 0, 0, 0))
        self.shadow.putalpha(sh)
        self.box = None  # caixa do último desenho (para os traços)

    def base_box(self):
        return (self.cx - self.im.width / 2, self.cy - self.im.height / 2, self.cx + self.im.width / 2, self.cy + self.im.height / 2)

    def draw(self, fr, kind, u, cam=(1.0, 0.0, 0.0), alpha=1.0):
        z, cdx, cdy = cam
        dx, dy, s, rot = object_motion(kind, u)
        s *= z ** 1.6  # parallax: o objeto aproxima mais que o fundo
        ox, oy = self.cx + cdx * 0.9 + dx, self.cy + cdy * 0.9 + dy
        im = self.im
        if abs(s - 1) > 0.003:
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BILINEAR)
        if abs(rot) > 0.05:
            im = im.rotate(rot, Image.BILINEAR, expand=True)
        sh = self.shadow
        if abs(s - 1) > 0.003:
            sh = sh.resize((max(1, int(sh.width * s)), max(1, int(sh.height * s))), Image.BILINEAR)
        lift = clamp(-dy / 500) if dy < 0 else 0.0
        k = (1 - 0.85 * lift) * alpha
        if k < 0.999:
            sh = sh.copy()
            sh.putalpha(sh.getchannel("A").point(lambda v: int(v * k)))
        paste(fr, sh, ox - sh.width / 2 + 16 + 40 * lift, self.cy + cdy * 0.9 + max(dy, 0) - sh.height / 2 + 26 + 50 * lift)
        if alpha < 0.999:
            im = im.copy()
            im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
        paste(fr, im, ox - im.width / 2, oy - im.height / 2)
        self.box = (ox - im.width / 2, oy - im.height / 2, ox + im.width / 2, oy + im.height / 2)
        return self.box


def photo_card(im, max_w=820, max_h=1000, border=16):
    """Foto (do usuário ou sem recorte possível) como cartão com borda branca, para virar 'objeto'."""
    im = im.convert("RGB")
    s = min(max_w / im.width, max_h / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    card = Image.new("RGBA", (im.width + 2 * border, im.height + 2 * border), (255, 255, 255, 255))
    card.paste(im, (border, border))
    return card


# ---------- traços desenhados à mão ----------

def mark_paths(kind, box, seed=0):
    x0, y0, x1, y1 = box
    cx, cy, w, h = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    rng = random.Random(seed)
    paths = []
    if kind == "circle":
        rx, ry, rot = w * 0.62, h * 0.6, rng.uniform(-0.25, 0.25)
        pts = []
        for i in range(90):
            a = -2.2 + 2 * math.pi * 1.12 * i / 89
            r = 1 + 0.06 * math.sin(i / 7) + (i / 89) * 0.05
            x, y = rx * r * math.cos(a), ry * r * math.sin(a)
            pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
        paths.append(pts)
    elif kind in ("arrow_left", "arrow_right"):
        s = -1 if kind == "arrow_left" else 1
        tip = (cx + s * (w / 2 + 30), cy + h * 0.15)
        start = (clamp(cx + s * (w / 2 + 300), 60, W - 60), cy + h * 0.55 + 140)
        ctrl = ((start[0] + tip[0]) / 2 + s * 40, start[1] - 160)
        shaft = []
        for i in range(40):
            t = i / 39
            shaft.append(((1 - t) ** 2 * start[0] + 2 * (1 - t) * t * ctrl[0] + t * t * tip[0],
                          (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * ctrl[1] + t * t * tip[1]))
        paths.append(shaft)
        ang = math.atan2(tip[1] - shaft[-6][1], tip[0] - shaft[-6][0])
        for da in (2.6, -2.6):
            paths.append([tip, (tip[0] + 70 * math.cos(ang + da), tip[1] + 70 * math.sin(ang + da))])
    elif kind == "underline":
        for k, (a, b) in enumerate(((x0 - 20, x1 + 30), (x0 + w * 0.15, x1 - w * 0.05))):
            yy = y1 + 40 + k * 28
            paths.append([(a + (b - a) * i / 29, yy + 8 * math.sin(i / 4 + k) + rng.uniform(-2, 2)) for i in range(30)])
    elif kind == "cross":
        m = 0.08
        paths.append([(x0 + w * m + w * (1 - 2 * m) * i / 19, y0 + h * m + h * (1 - 2 * m) * i / 19 + rng.uniform(-4, 4)) for i in range(20)])
        paths.append([(x1 - w * m - w * (1 - 2 * m) * i / 19, y0 + h * m + h * (1 - 2 * m) * i / 19 + rng.uniform(-4, 4)) for i in range(20)])
    elif kind == "check":
        bx, by = x1 - min(190, w * 0.4), y0 + 10
        paths.append([(bx, by + 60), (bx + 45, by + 115), (bx + 160, by - 40)])
    elif kind == "burst":
        r0 = max(w, h) * 0.55
        for k in range(7):
            a = -math.pi / 2 + (k - 3) * 0.42
            paths.append([(cx + r0 * math.cos(a), cy - h * 0.1 + r0 * math.sin(a)),
                          (cx + (r0 + 90) * math.cos(a), cy - h * 0.1 + (r0 + 90) * math.sin(a))])
    return paths


def draw_paths(fr, paths, prog, color=(225, 6, 0), width=15):
    """Desenha os traços até a fração prog (0–1) do comprimento total, direto no quadro RGBA."""
    if prog <= 0 or not paths:
        return
    col = tuple(color[:3]) + (255,)
    lens = [sum(math.dist(p[i], p[i + 1]) for i in range(len(p) - 1)) for p in paths]
    left = sum(lens) * clamp(prog)
    lay = Image.new("RGBA", fr.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for p, length in zip(paths, lens):
        if left <= 0:
            break
        pts, acc = [p[0]], 0.0
        for i in range(len(p) - 1):
            seg = math.dist(p[i], p[i + 1])
            if acc + seg <= left:
                pts.append(p[i + 1])
                acc += seg
            else:
                f = (left - acc) / max(seg, 1e-6)
                pts.append((p[i][0] + (p[i + 1][0] - p[i][0]) * f, p[i][1] + (p[i + 1][1] - p[i][1]) * f))
                break
        left -= length
        if len(pts) >= 2:
            d.line(pts, fill=col, width=width, joint="curve")
            for q in (pts[0], pts[-1]):
                d.ellipse([q[0] - width / 2, q[1] - width / 2, q[0] + width / 2, q[1] + width / 2], fill=col)
    fr.alpha_composite(lay)


class Marks:
    """Traço da cena, desenhado no momento da palavra-chave e acompanhando a caixa do objeto."""

    DRAW_S = 0.38

    def __init__(self, tl, keys, norm, directions):
        self.at, self.kind, self._paths = {}, {}, {}
        for sc in tl.scenes:
            t = sc.start + 0.3
            for w in tl.words:
                if sc.start <= w[1] < sc.end and norm(w[0]) in keys:
                    t = w[1]
                    break
            self.at[sc.index] = min(t, max(sc.end - 0.45, sc.start + 0.1))
            self.kind[sc.index] = directions[sc.index]["mark"]

    def draw(self, fr, scene_index, t, box, base_box=None, color=(225, 6, 0), width=15):
        kind = self.kind.get(scene_index, "none")
        if kind == "none" or box is None:
            return
        prog = (t - self.at[scene_index]) / self.DRAW_S
        if prog <= 0:
            return
        ref = base_box or box
        if scene_index not in self._paths:
            self._paths[scene_index] = (mark_paths(kind, ref, seed=scene_index * 97 + 13), ref)
        paths, ref = self._paths[scene_index]
        ox = (box[0] + box[2]) / 2 - (ref[0] + ref[2]) / 2
        oy = (box[1] + box[3]) / 2 - (ref[1] + ref[3]) / 2
        moved = [[(x + ox, y + oy) for x, y in p] for p in paths]
        draw_paths(fr, moved, prog if kind == "burst" else ease_io(prog), color, width)


# ---------- ênfase da palavra-chave ----------

def emphasis(kind, dt):
    """(escala relativa, rotação, fração revelada da esquerda, tremor 0–1) da palavra-chave dt s depois de entrar."""
    if kind == "slam":
        return 1 + 1.1 * (1 - expo_out(dt / 0.18)), 0.0, 1.0, clamp(1 - dt / 0.12)
    if kind == "stamp":
        return 1.5 - 0.5 * spring(dt, 16, 7), -3 + 7 * (1 - spring(dt, 14, 6)), 1.0, 0.0
    return 1.4 - 0.4 * spring(dt, 17, 8), 0.0, expo_out(dt / 0.16), 0.0  # sweep


def word_pop(dt):
    """Escala de uma palavra comum entrando (mola leve)."""
    return 1.4 - 0.4 * spring(dt, 17, 8)


def reveal_left(im, frac):
    if frac >= 0.999:
        return im
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ww = max(1, int(im.width * frac))
    out.paste(im.crop((0, 0, ww, im.height)), (0, 0))
    return out

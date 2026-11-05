"""Cenas de motion design de tela cheia (grafismos "fx" do motor genérico), desenhadas com Skia.

Cada tipo ocupa a cena inteira (não só a faixa do meio) e é pensado como uma peça curta de motion:
texto formado por partículas, palavra que enche de líquido, pôster tipográfico cinético, globo girando
com rotas, mapa com trajeto, relógio de placas (flip), conversa de chat, celular com notificações,
barras 3D isométricas, espectro de áudio circular, explosão de formas, pilha de cartões, carregamento
que vira "pronto", editor de código digitando, forma que se transforma, tela que se abre em fatias,
órbita de ícones e busca com resultados. Entram por scene["graphic"] como os outros grafismos
(render/mograph.py chama draw()); a normalização de cada formato fica em normalize().

Tudo lê W/H de render.common na hora de desenhar (16:9 e prévia funcionam igual).
"""
import colorsys
import math
import random
from functools import lru_cache

import numpy as np
import skia

from . import common as C
from .motion import bounce_out, clamp, ease_io, expo_out, spring

FX_TYPES = ("particle_text", "liquid_text", "kinetic_poster", "globe", "route", "flip_clock", "chat", "phone",
            "iso_bars", "equalizer", "burst", "card_stack", "loader", "code", "morph", "split_reveal", "orbit",
            "search")

MONO_FONTS = ("/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")


def _s(v, n=60):
    return " ".join(str(v if v is not None else "").split())[:n]


def normalize(g):
    """Formato limpo de um tipo fx (None se não serve)."""
    t = g.get("type")
    items = g.get("items") if isinstance(g.get("items"), list) else []

    def item(i, keys=("label", "text", "icon", "value", "side")):
        i = i if isinstance(i, dict) else {"label": i}
        return {k: _s(i.get(k), 80) for k in keys if i.get(k) not in (None, "")}

    text = _s(g.get("text") or g.get("label"), 40)
    if t in ("particle_text", "liquid_text", "split_reveal"):
        return {"type": t, "text": text or "MOTION", "sub": _s(g.get("sub"), 50)} if text or t != "split_reveal" else None
    if t in ("kinetic_poster", "morph"):
        words = [_s(i.get("label") if isinstance(i, dict) else i, 18) for i in items][:7]
        words = [w for w in words if w]
        return {"type": t, "items": words} if len(words) >= 2 else None
    if t == "globe":
        return {"type": t, "label": text, "sub": _s(g.get("sub"), 50)}
    if t == "route":
        return {"type": t, "from": _s(g.get("from"), 24) or "Origem", "to": _s(g.get("to"), 24) or "Destino",
                "value": _s(g.get("value"), 20)}
    if t == "flip_clock":
        v = "".join(ch for ch in str(g.get("value") or "") if ch.isdigit() or ch in ":.,")[:8]
        return {"type": t, "value": v, "label": _s(g.get("label"), 40)} if any(ch.isdigit() for ch in v) else None
    if t == "chat":
        rows = [item(i) for i in items][:5]
        rows = [r for r in rows if r.get("text") or r.get("label")]
        return {"type": t, "items": rows, "label": _s(g.get("label"), 30)} if rows else None
    if t == "phone":
        rows = [item(i) for i in items][:4]
        rows = [r for r in rows if r.get("label") or r.get("text")]
        return {"type": t, "items": rows, "label": text} if rows else None
    if t == "iso_bars":
        rows = [item(i) for i in items][:5]
        rows = [r for r in rows if r.get("label")]
        return {"type": t, "items": rows, "unit": _s(g.get("unit"), 10)} if len(rows) >= 2 else None
    if t in ("equalizer", "burst", "loader"):
        return {"type": t, "text": text, "icon": _s(g.get("icon"), 30)}
    if t == "card_stack":
        rows = [item(i) for i in items][:4]
        rows = [r for r in rows if r.get("label")]
        return {"type": t, "items": rows} if len(rows) >= 2 else None
    if t == "code":
        lines = [str(x)[:46] for x in (g.get("lines") or []) if str(x).strip()][:9] if isinstance(g.get("lines"), list) else []
        return {"type": t, "lines": lines, "output": _s(g.get("output"), 40)} if lines else None
    if t == "orbit":
        rows = [item(i) for i in items][:6]
        rows = [r for r in rows if r.get("icon") or r.get("label")]
        return {"type": t, "items": rows, "text": text} if len(rows) >= 3 else None
    if t == "search":
        rows = [item(i) for i in items][:3]
        return {"type": t, "text": _s(g.get("text"), 40) or "Pesquisar", "items": [r for r in rows if r.get("label")]}
    return None


# ---------- utilidades ----------

def col(rgb, a=1.0):
    return skia.Color(int(rgb[0]), int(rgb[1]), int(rgb[2]), int(255 * clamp(a)))


def mix(a, b, k):
    return tuple(a[i] + (b[i] - a[i]) * k for i in range(3))


def hues(base, n, spread=0.16):
    """n cores irmãs da cor de destaque (gira o matiz), para grafismos com várias cores."""
    r, g, b = [x / 255 for x in base]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    s, v = max(s, 0.55), max(v, 0.8)
    out = []
    for i in range(n):
        rr, gg, bb = colorsys.hsv_to_rgb((h + spread * (i - (n - 1) / 2)) % 1, s, v)
        out.append((rr * 255, gg * 255, bb * 255))
    return out


def lum(rgb):
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def fill(color, a=1.0):
    return skia.Paint(Color=col(color, a), AntiAlias=True)


def stroke(color, w, a=1.0):
    p = skia.Paint(Color=col(color, a), AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=float(w))
    p.setStrokeCap(skia.Paint.kRound_Cap)
    p.setStrokeJoin(skia.Paint.kRound_Join)
    return p


def trim(paint, k):
    """Desenha só o trecho 0..k do contorno (k >= 1: inteiro)."""
    if k < 0.999:
        paint.setPathEffect(skia.TrimPathEffect.Make(0.0, max(0.0005, k)))
    return paint


def glow(color, blur, a=1.0):
    return skia.Paint(Color=col(color, a), AntiAlias=True, MaskFilter=skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur))


def rrect(c, x0, y0, x1, y1, r, paint):
    c.drawRoundRect(skia.Rect(x0, y0, x1, y1), r, r, paint)


def shadow(c, x0, y0, x1, y1, r, a=0.35, blur=30, dy=18):
    rrect(c, x0, y0 + dy, x1, y1 + dy, r, glow((0, 0, 0), blur, a))


@lru_cache(maxsize=64)
def _tf(path):
    tf = skia.Typeface.MakeFromFile(str(path)) if path else None
    return tf or skia.Typeface.MakeDefault()


def font(path, size):
    f = skia.Font(_tf(path), float(size))
    f.setEdging(skia.Font.Edging.kAntiAlias)
    f.setSubpixel(True)
    return f


def mono(size):
    import os
    for p in MONO_FONTS:
        if os.path.exists(p):
            return font(p, size)
    return font(None, size)


def fit(path, s, size, max_w, min_size=20):
    f = font(path, size)
    while size > min_size and f.measureText(s) > max_w:
        size *= 0.93
        f = font(path, size)
    return f


def text(c, s, x, y, f, color, a=1.0, align="center"):
    if not s:
        return
    w = f.measureText(s)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    c.drawString(s, x0, y, f, fill(color, a))


def text_path(s, f, x, y, align="center"):
    """Contorno do texto como Path (linha de base em y)."""
    glyphs = f.textToGlyphs(s)
    xs = f.getXPos(glyphs)
    w = f.measureText(s)
    x0 = x - w / 2 if align == "center" else x
    path = skia.Path()
    for gid, gx in zip(glyphs, xs):
        gp = f.getPath(gid)
        if gp is not None:
            path.addPath(gp, x0 + gx, y)
    return path


def bg(c, color, a=1.0):
    c.drawRect(skia.Rect(0, 0, C.W, C.H), fill(color, a))


def radial_bg(c, inner, outer, cx=None, cy=None, r=None):
    cx = C.W / 2 if cx is None else cx
    cy = C.H / 2 if cy is None else cy
    r = r or max(C.W, C.H) * 0.75
    p = skia.Paint(AntiAlias=True)
    p.setShader(skia.GradientShader.MakeRadial(skia.Point(cx, cy), r, [col(inner), col(outer)]))
    c.drawRect(skia.Rect(0, 0, C.W, C.H), p)


def icon_draw(c, name, cx, cy, size, prog, color, width=None):
    from .mograph import find_icon, icon_paths
    paths = icon_paths(find_icon(name), cx, cy, size)
    n = len(paths)
    width = width or max(3.0, size / 24 * 2.0)
    for i, p in enumerate(paths):
        k = clamp(prog * (n * 0.5 + 1) - i * 0.5)
        if k > 0:
            pt = stroke(color, width)
            if k < 0.999:
                pt.setPathEffect(skia.TrimPathEffect.Make(0.0, max(0.0005, ease_io(k))))
            c.drawPath(p, pt)


def portrait():
    return C.H >= C.W


class FX:
    """Estado de um grafismo fx (caches que não mudam de quadro para quadro)."""

    def __init__(self, data, spec, fonts):
        self.d = data
        self.fonts = fonts
        pal = spec["palette"]
        h = lambda x: tuple(int(x.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
        self.accent, self.text, self.bg, self.on_accent = h(pal["accent"]), h(pal["text"]), h(pal["background"]), h(pal["accentText"])
        self.dark = lum(self.bg) < 128
        self.cache = {}

    def draw(self, c, t, span, n_frame):
        getattr(self, "_" + self.d["type"])(c, t, span, n_frame)

    # 1. texto que nasce de partículas -------------------------------------------------
    def _particle_text(self, c, t, span, n):
        W, H = C.W, C.H
        key = ("pts", W, H)
        if key not in self.cache:
            word = self.d["text"].upper()
            f = fit(self.fonts["title"], word, 300 if portrait() else 260, W * 0.88)
            buf = np.zeros((H, W, 4), np.uint8)
            surf = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kPremul_AlphaType)
            cv = surf.getCanvas()
            text(cv, word, W / 2, H * 0.47 + f.getSize() * 0.35, f, (255, 255, 255))
            del cv, surf
            step = max(5, int(f.getSize() / 26))
            ys, xs = np.nonzero(buf[::step, ::step, 3] > 140)
            rng = random.Random(7)
            pts = [(x * step + rng.uniform(-1.5, 1.5), y * step + rng.uniform(-1.5, 1.5)) for y, x in zip(ys, xs)]
            rng.shuffle(pts)
            pts = pts[:2600]
            starts, delays, colors = [], [], []
            for i, (x, y) in enumerate(pts):
                a = rng.uniform(0, 2 * math.pi)
                d = rng.uniform(0.6, 1.3) * max(W, H)
                starts.append((W / 2 + math.cos(a) * d, H * 0.47 + math.sin(a) * d))
                delays.append(rng.uniform(0, 0.55))
                colors.append(rng.random() < 0.35)
            self.cache[key] = (pts, starts, delays, colors, step)
        pts, starts, delays, colors, step = self.cache[key]
        radial_bg(c, mix(self.bg, self.accent, 0.18 if self.dark else 0.08), self.bg)
        out = clamp((t - (span - 0.75)) / 0.75) if span > 2 else 0
        a_pts, b_pts = [], []
        for (x, y), (sx, sy), dl, ca in zip(pts, starts, delays, colors):
            k = expo_out(clamp((t - 0.05 - dl) / 1.1))
            swirl = (1 - k) * 160
            ang = (1 - k) * 3.0 + dl * 9
            px = sx + (x - sx) * k + math.cos(ang) * swirl
            py = sy + (y - sy) * k + math.sin(ang) * swirl
            px += math.sin(t * 3 + y * 0.05) * 1.6
            if out > 0:  # sopra para fora
                e = out * out
                px += (x - C.W / 2) * e * 1.8 + math.sin(dl * 40) * 300 * e
                py += (y - C.H * 0.47) * e * 1.8 - 500 * e * (0.5 + dl)
            (b_pts if ca else a_pts).append(skia.Point(px, py))
        size = step * 0.95
        p = stroke(self.text, size, 1 - out * 0.6)
        c.drawPoints(skia.Canvas.kPoints_PointMode, a_pts, p)
        c.drawPoints(skia.Canvas.kPoints_PointMode, b_pts, stroke(self.accent, size * 1.1, 1 - out * 0.6))
        if self.d.get("sub"):
            f = fit(self.fonts["body"], self.d["sub"], 60, W * 0.85)
            k = clamp((t - 1.2) / 0.4) * (1 - out)
            text(c, self.d["sub"], W / 2, H * 0.6 + 30 * (1 - k), f, self.text, k * 0.85)

    # 2. palavra que enche de líquido ------------------------------------------------
    def _liquid_text(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.14 if self.dark else 0.06), self.bg)
        word = self.d["text"].upper()
        f = fit(self.fonts["title"], word, 420 if portrait() else 320, W * 0.92)
        cy = H * 0.47
        base = cy + f.getSize() * 0.36
        path = text_path(word, f, W / 2, base)
        b = path.getBounds()
        # contorno sendo desenhado
        k_out = clamp(t / 0.9)
        c.drawPath(path, trim(stroke(self.accent, 14, 0.35), ease_io(k_out)))
        c.drawPath(path, trim(stroke(self.text, 6), ease_io(k_out)))
        # nível do líquido sobe com ondas
        level = ease_io(clamp((t - 0.5) / max(1.6, span * 0.55)))
        if level > 0:
            c.save()
            c.clipPath(path, skia.ClipOp.kIntersect, True)
            top = b.bottom() - (b.height() + 40) * level
            for layer, (amp, speed, colr, a) in enumerate(((22, 3.2, mix(self.accent, self.text, 0.35), 0.9), (16, -2.4, self.accent, 1.0))):
                wave = skia.Path()
                wave.moveTo(b.left() - 20, b.bottom() + 20)
                x = b.left() - 20
                while x <= b.right() + 24:
                    wave.lineTo(x, top + 10 * layer + amp * math.sin(x * 0.018 + t * speed))
                    x += 12
                wave.lineTo(b.right() + 24, b.bottom() + 20)
                wave.close()
                c.drawPath(wave, fill(colr, a))
            rng = random.Random(3)  # bolhas
            for i in range(26):
                bx = rng.uniform(b.left(), b.right())
                ph = (t * rng.uniform(0.3, 0.7) + rng.random()) % 1
                by = b.bottom() - ph * (b.bottom() - top)
                c.drawCircle(bx + math.sin(t * 4 + i) * 6, by, rng.uniform(4, 11), stroke(self.on_accent, 3, 0.5 * (1 - ph)))
            c.restore()
        if self.d.get("sub"):
            sf = fit(self.fonts["body"], self.d["sub"], 58, W * 0.85)
            k = clamp((t - 1.4) / 0.4)
            text(c, self.d["sub"], W / 2, b.bottom() + 110 + 20 * (1 - k), sf, self.text, k * 0.85)

    # 3. pôster tipográfico cinético --------------------------------------------------
    def _kinetic_poster(self, c, t, span, n):
        W, H = C.W, C.H
        words = self.d["items"]
        m = len(words)
        slot = max(0.32, (span - 0.3) / m)
        i = min(int(t / slot), m - 1)
        lt = t - i * slot
        schemes = [(self.accent, self.on_accent), (self.text, self.bg), (self.bg, self.text)]
        back, fore = schemes[i % 3]
        prev_back = schemes[(i - 1) % 3][0] if i else self.bg
        # cor nova entra por um círculo que cresce de onde a palavra bate
        bg(c, prev_back)
        r = expo_out(clamp(lt / 0.32)) * math.hypot(W, H)
        c.drawCircle(W * (0.3 + 0.4 * ((i * 37) % 10) / 10), H * (0.35 + 0.3 * ((i * 53) % 10) / 10), r, fill(back))
        # faixas diagonais correndo
        c.save()
        c.rotate(-12, W / 2, H / 2)
        for j in range(6):
            y = (j * 340 + t * 420 * (1 if j % 2 else -1)) % (H + 600) - 300
            c.drawRect(skia.Rect(-W, y, 2 * W, y + 14), fill(fore, 0.08))
        c.restore()
        word = words[i].upper()
        f = fit(self.fonts["title"], word, 420 if portrait() else 300, W * 0.92)
        z = 1 + 1.4 * (1 - expo_out(clamp(lt / 0.28)))
        rot = (8 if i % 2 else -8) * (1 - spring(lt, 16, 7))
        c.save()
        c.translate(W / 2, H * 0.5)
        c.rotate(rot)
        c.scale(z, z)
        # palavra anterior encolhendo atrás (eco)
        text(c, word, 0, f.getSize() * 0.36, f, fore)
        c.restore()
        # palavras menores orbitando (contexto)
        small = font(self.fonts["body"], 46)
        for j in range(3):
            w2 = words[(i + j + 1) % m].upper()
            yy = H * (0.2, 0.8, 0.68)[j]
            xx = (W * 0.5 + (t * 160 * (1 if j % 2 else -1)) % W) % (W + 400) - 200
            text(c, w2, xx, yy, small, fore, 0.25)

    # 4. globo girando com rotas -------------------------------------------------------
    CITIES = [(-23.5, -46.6), (40.7, -74.0), (38.7, -9.1), (35.7, 139.7), (6.5, 3.4), (-33.9, 151.2), (51.5, -0.1),
              (19.4, -99.1), (28.6, 77.2), (-1.3, 36.8)]
    ROUTES = [(0, 1), (0, 2), (2, 3), (1, 6), (4, 8), (0, 9), (7, 5), (6, 3)]

    def _globe(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.22 if self.dark else 0.1), self.bg)
        R = min(W, H) * (0.38 if portrait() else 0.36)
        cx, cy = W / 2, H * (0.45 if portrait() else 0.48)
        enter = expo_out(clamp(t / 0.8))
        R *= 0.6 + 0.4 * enter
        rot = math.radians(-60 + t * 22)
        tilt = math.radians(18)

        def proj(lat, lon):
            la, lo = math.radians(lat), math.radians(lon) + rot
            x, y, z = math.cos(la) * math.sin(lo), math.sin(la), math.cos(la) * math.cos(lo)
            y, z = y * math.cos(tilt) - z * math.sin(tilt), y * math.sin(tilt) + z * math.cos(tilt)
            return cx + x * R, cy - y * R, z

        c.drawCircle(cx, cy, R * 1.04, glow(self.accent, 40, 0.25 * enter))
        c.drawCircle(cx, cy, R, fill(mix(self.bg, self.accent, 0.12)))
        front, back = [], []
        for lat in range(-80, 81, 6):
            step = max(4, int(6 / max(math.cos(math.radians(lat)), 0.15)))
            for lon in range(-180, 180, step):
                x, y, z = proj(lat, lon)
                # "continentes" falsos: ruído de seno deixa manchas mais densas
                land = math.sin(math.radians(lon) * 2.1 + 1.3) * math.cos(math.radians(lat) * 2.7) + 0.35 * math.sin(math.radians(lon * 5 + lat * 3))
                (front if z > 0 else back).append((skia.Point(x, y), land > 0.3))
        c.drawPoints(skia.Canvas.kPoints_PointMode, [p for p, _ in back], stroke(self.text, 3, 0.07 * enter))
        c.drawPoints(skia.Canvas.kPoints_PointMode, [p for p, l in front if not l], stroke(self.text, 3, 0.16 * enter))
        land = [p for p, l in front if l]
        c.drawPoints(skia.Canvas.kPoints_PointMode, land, stroke(self.accent, 14, 0.25 * enter))
        c.drawPoints(skia.Canvas.kPoints_PointMode, land, stroke(mix(self.accent, self.text, 0.35), 7, enter))
        c.drawCircle(cx, cy, R, stroke(self.accent, 3, 0.6 * enter))
        # rotas em arco com cometa
        for j, (a, b) in enumerate(self.ROUTES):
            k = clamp((t - 0.6 - j * 0.22) / 0.9)
            if k <= 0:
                continue
            (la1, lo1), (la2, lo2) = self.CITIES[a], self.CITIES[b]
            pts, vis = [], []
            for s in range(41):
                u = s / 40
                lat, lon = la1 + (la2 - la1) * u, lo1 + (lo2 - lo1) * u
                x, y, z = proj(lat, lon)
                lift = 1 + 0.22 * math.sin(math.pi * u)
                pts.append((cx + (x - cx) * lift, cy + (y - cy) * lift))
                vis.append(z > -0.15)
            m = int(40 * ease_io(k))
            path = skia.Path()
            started = False
            for s in range(m + 1):
                if not vis[s]:
                    started = False
                    continue
                (path.lineTo if started else path.moveTo)(*pts[s])
                started = True
            c.drawPath(path, stroke(hues(self.accent, 3)[j % 3], 4, 0.9))
            if 0 < k < 1 and vis[m]:
                c.drawCircle(*pts[m], 18, glow(self.text, 10, 0.9))
                c.drawCircle(*pts[m], 7, fill(self.text))
            if k >= 1 and vis[-1]:  # chegada: anel pulsando
                ph = ((t - 1.5 - j * 0.22) * 1.2) % 1
                c.drawCircle(*pts[-1], 10 + 40 * ph, stroke(self.accent, 3, 1 - ph))
        if self.d.get("label"):
            f = fit(self.fonts["title"], self.d["label"].upper(), 110, W * 0.9)
            k = clamp((t - 0.9) / 0.4)
            text(c, self.d["label"].upper(), W / 2, cy + R + 190 - 30 * (1 - k), f, self.text, k)
        if self.d.get("sub"):
            f = fit(self.fonts["body"], self.d["sub"], 52, W * 0.85)
            k = clamp((t - 1.2) / 0.4)
            text(c, self.d["sub"], W / 2, cy + R + 270, f, self.text, k * 0.75)

    # 5. trajeto no mapa -------------------------------------------------------------
    def _route(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, mix(self.bg, self.text, 0.04))
        rng = random.Random(11)
        # quarteirões do "mapa"
        grid = 150
        for gx in range(-1, int(W / grid) + 2):
            for gy in range(-1, int(H / grid) + 2):
                if rng.random() < 0.82:
                    x0, y0 = gx * grid + 12, gy * grid + 12
                    rrect(c, x0, y0, x0 + grid - 24, y0 + grid - 24, 14, fill(mix(self.bg, self.text, 0.09)))
        # rio
        river = skia.Path()
        river.moveTo(-50, H * 0.18)
        river.cubicTo(W * 0.4, H * 0.1, W * 0.5, H * 0.42, W + 50, H * 0.36)
        c.drawPath(river, stroke(mix(self.bg, self.accent, 0.35), 46, 0.5))
        # trajeto
        p0, p3 = (W * 0.2, H * 0.74), (W * 0.78, H * 0.26)
        path = skia.Path()
        path.moveTo(*p0)
        path.cubicTo(W * 0.95, H * 0.66, W * 0.05, H * 0.42, W * 0.5, H * 0.38)
        path.cubicTo(W * 0.7, H * 0.36, W * 0.66, H * 0.3, *p3)
        k = ease_io(clamp((t - 0.4) / max(1.6, span * 0.5)))
        dash = stroke(self.accent, 14)
        de = skia.DashPathEffect.Make([34, 22], -t * 60)
        dash.setPathEffect(de if k >= 0.999 else skia.PathEffect.MakeCompose(de, skia.TrimPathEffect.Make(0.0, max(0.0005, k))))
        c.drawPath(path, stroke(self.accent, 30, 0.15)) if k > 0 else None
        c.drawPath(path, dash)
        # pontos de origem e destino
        for (x, y), lbl, kk, dy in ((p0, self.d["from"], clamp(t / 0.4), -190), (p3, self.d["to"], clamp((t - 0.4) / 0.4), -190)):
            c.drawCircle(x, y, 26 * spring(kk, 14, 6), fill(self.text))
            c.drawCircle(x, y, 12 * spring(kk, 14, 6), fill(self.bg))
            f = fit(self.fonts["title"], lbl.upper(), 60, W * 0.5)
            w = f.measureText(lbl.upper()) + 70
            xc = min(max(x, w / 2 + 30), W - w / 2 - 30)
            shadow(c, xc - w / 2, y + dy, xc + w / 2, y + dy + 96, 48, 0.3, 20, 10)
            rrect(c, xc - w / 2, y + dy + 20 * (1 - kk), xc + w / 2, y + dy + 96 + 20 * (1 - kk), 48, fill(self.text, kk))
            text(c, lbl.upper(), xc, y + dy + 70 + 20 * (1 - kk), f, self.bg, kk)
        # pino andando
        pm = skia.PathMeasure(path, False)
        L = pm.getLength()
        pos, tan = pm.getPosTan(L * k)
        hop = abs(math.sin(t * 9)) * 14 * (1 if k < 1 else 0)
        px, py = pos.x(), pos.y() - hop
        pin = skia.Path()
        pin.moveTo(px, py)
        pin.cubicTo(px - 46, py - 60, px - 40, py - 120, px, py - 120)
        pin.cubicTo(px + 40, py - 120, px + 46, py - 60, px, py)
        c.drawOval(skia.Rect(px - 26, pos.y() - 8, px + 26, pos.y() + 8), fill((0, 0, 0), 0.25))
        c.drawPath(pin, fill(self.accent))
        c.drawCircle(px, py - 82, 16, fill(self.on_accent))
        if k >= 1:
            ph = (t * 1.3) % 1
            c.drawCircle(*p3, 30 + 90 * ph, stroke(self.accent, 6, 1 - ph))
        if self.d.get("value"):
            from .mograph import fmt_number, parse_number
            f = fit(self.fonts["title"], self.d["value"], 150, W * 0.8)
            pn = parse_number(self.d["value"])
            s = f"{pn[0]}{fmt_number(pn[1] * k, pn[3])}{pn[2]}" if pn else self.d["value"]
            rrect(c, W * 0.1, H * 0.84 - f.getSize() * 0.95, W * 0.9, H * 0.84 + f.getSize() * 0.3, 30, fill(self.bg, 0.9))
            text(c, s, W / 2, H * 0.84, f, self.text)

    # 6. relógio de placas -------------------------------------------------------------
    def _flip_clock(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.text, 0.08), self.bg)
        chars = list(self.d["value"])
        nd = len(chars)
        cw = min(W * 0.86 / nd, 230)
        chh = cw * 1.5
        x0 = W / 2 - cw * nd / 2
        cy = H * 0.46
        f = font(self.fonts["title"], chh * 0.78)
        card = mix(self.bg, self.text, 0.13) if self.dark else (30, 30, 34)
        ink = self.text if self.dark else (245, 245, 245)
        for i, ch in enumerate(chars):
            x = x0 + i * cw + cw * 0.06
            w = cw * 0.88
            if not ch.isdigit():
                text(c, ch, x + w / 2, cy + f.getSize() * 0.32, f, self.text)
                continue
            target = int(ch)
            dur = 0.7 + 0.28 * i
            flips = target + 10 * (1 + (i % 2))
            k = clamp((t - 0.15) / dur)
            pos = expo_out(k) * flips
            cur = int(pos) % 10
            nxt = (cur + 1) % 10 if int(pos) < flips else cur
            p = pos - int(pos) if int(pos) < flips else 0.0
            top, bot, mid = cy - chh / 2, cy + chh / 2, cy
            shadow(c, x, top, x + w, bot, 18, 0.4)

            def half(digit, upper, sy=1.0, a=1.0):
                c.save()
                c.clipRect(skia.Rect(x, top if upper else mid, x + w, mid if upper else bot))
                c.translate(0, mid)
                c.scale(1, sy)
                c.translate(0, -mid)
                rrect(c, x, top, x + w, bot, 18, fill(mix(card, (0, 0, 0), 0.0 if upper else 0.08), a))
                text(c, str(digit), x + w / 2, cy + f.getSize() * 0.35, f, ink, a)
                c.restore()

            half(nxt, True)
            half(cur, False)
            if p > 0:
                if p < 0.5:
                    half(cur, True, 1 - 2 * p)
                else:
                    half(nxt, False, 2 * p - 1)
            c.drawLine(x, mid, x + w, mid, stroke((0, 0, 0), 4, 0.5))
            for yy in (mid - 6, mid + 6):
                c.drawCircle(x + 4, yy, 3, fill((0, 0, 0), 0.4))
        if self.d.get("label"):
            lf = fit(self.fonts["body"], self.d["label"].upper(), 60, W * 0.86)
            k = clamp((t - 0.6) / 0.4)
            text(c, self.d["label"].upper(), W / 2, cy + chh / 2 + 120 + 20 * (1 - k), lf, self.text, k)

    # 7. conversa de chat -----------------------------------------------------------
    def _chat(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, mix(self.bg, self.text, 0.03))
        rows = self.d["items"]
        m = len(rows)
        per = max(0.7, (span - 0.6) / m)
        f = font(self.fonts["body"], 64 if portrait() else 46)
        max_w = W * (0.7 if portrait() else 0.42)
        bubbles = []
        for i, r in enumerate(rows):
            s = r.get("text") or r.get("label")
            words, lines, cur = s.split(), [], ""
            for w in words:
                nxt = (cur + " " + w).strip()
                if f.measureText(nxt) > max_w - 70 and cur:
                    lines.append(cur)
                    cur = w
                else:
                    cur = nxt
            lines.append(cur)
            right = r.get("side") == "right" if r.get("side") else i % 2 == 1
            bw = max(f.measureText(x) for x in lines) + 80
            bh = len(lines) * f.getSize() * 1.25 + 60
            bubbles.append((lines, right, bw, bh))
        gap = 34
        visible = [i for i in range(m) if t >= i * per]
        total_h = sum(bubbles[i][3] + gap for i in visible)
        y = H * 0.52 - total_h / 2
        hdr = font(self.fonts["title"], 54)
        c.drawRect(skia.Rect(0, 0, W, H * 0.11), fill(mix(self.bg, self.text, 0.07)))
        c.drawCircle(W * 0.1, H * 0.065, 40, fill(self.accent))
        text(c, self.d.get("label") or "Assistente", W * 0.1 + 66, H * 0.065 + 20, hdr, self.text, align="left")
        for i in visible:
            lines, right, bw, bh = bubbles[i]
            lt = t - i * per
            typing = lt < 0.45
            k = spring(max(lt - 0.45, 0), 15, 6.5)
            x1 = W * 0.94 if right else W * 0.06 + 104
            x0 = x1 - bw if right else x1
            if right:
                x0, x1 = x1 - bw, x1
            else:
                x1 = x0 + bw
            color = self.accent if right else (mix(self.bg, self.text, 0.12) if self.dark else (255, 255, 255))
            ink = self.on_accent if right else self.text
            if not right:  # avatar
                c.drawCircle(W * 0.06 + 42, y + bh - 42, 42, fill(hues(self.accent, 3)[i % 3]))
            if typing:
                tw, th = 150, 90
                ax = x1 - tw if right else x0
                rrect(c, ax, y + bh - th, ax + tw, y + bh, 45, fill(color))
                for d in range(3):
                    bounce = abs(math.sin(lt * 12 - d * 0.9)) * 12
                    c.drawCircle(ax + 42 + d * 33, y + bh - th / 2 - bounce, 11, fill(ink, 0.7))
            else:
                c.save()
                ox = x1 if right else x0
                c.translate(ox, y + bh)
                c.scale(k, k)
                c.translate(-ox, -(y + bh))
                shadow(c, x0, y, x1, y + bh, 40, 0.18, 22, 10)
                rrect(c, x0, y, x1, y + bh, 40, fill(color))
                for li, line in enumerate(lines):
                    text(c, line, x0 + 40, y + 34 + f.getSize() * (li + 0.95) * 1.2, f, ink, align="left")
                c.restore()
            y += bh + gap

    # 8. celular com notificações -----------------------------------------------------
    def _phone(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.2), self.bg)
        pw = min(W * 0.66, H * 0.36)
        ph = pw * 2.05
        cx, cy = W / 2, H * 0.5
        e = spring(t, 9, 5.5)
        y_off = (1 - min(e, 1.2)) * H * 0.6
        rot = 6 * (1 - expo_out(clamp(t / 1.0)))
        c.save()
        c.translate(cx, cy + y_off)
        c.rotate(rot)
        x0, y0, x1, y1 = -pw / 2, -ph / 2, pw / 2, ph / 2
        shadow(c, x0, y0, x1, y1, 70, 0.45, 50, 40)
        rrect(c, x0, y0, x1, y1, 70, fill((18, 18, 22)))
        sx0, sy0, sx1, sy1 = x0 + 16, y0 + 16, x1 - 16, y1 - 16
        sp = skia.Paint(AntiAlias=True)
        a1, a2 = hues(self.accent, 2, 0.12)
        sp.setShader(skia.GradientShader.MakeLinear([skia.Point(0, sy0), skia.Point(0, sy1)], [col(a1), col(mix(a2, (10, 10, 20), 0.55))]))
        rrect(c, sx0, sy0, sx1, sy1, 56, sp)
        rrect(c, -70, sy0 + 14, 70, sy0 + 50, 18, fill((0, 0, 0)))  # ilha
        clock = font(self.fonts["title"], pw * 0.24)
        text(c, "9:41", 0, sy0 + pw * 0.42, clock, (255, 255, 255), 0.95)
        # grade de apps
        for r_ in range(2):
            for k_ in range(4):
                ax = sx0 + (sx1 - sx0) * (0.14 + 0.24 * k_)
                ay = sy1 - 230 + r_ * 110
                rrect(c, ax - 38, ay - 38, ax + 38, ay + 38, 20, fill((255, 255, 255), 0.18))
        # notificações caindo
        rows = self.d["items"]
        nf, tf = font(self.fonts["body"], pw * 0.06), font(self.fonts["body"], pw * 0.05)
        ny = sy0 + pw * 0.58
        for i, r in enumerate(rows):
            lt = t - 0.7 - i * 0.55
            if lt <= 0:
                break
            k = spring(lt, 13, 6)
            hgt = pw * 0.26
            yy = ny + i * (hgt + 18)
            c.save()
            c.translate(0, -(1 - min(k, 1.15)) * 260)
            a = clamp(lt / 0.15)
            rrect(c, sx0 + 18, yy, sx1 - 18, yy + hgt, 34, fill((255, 255, 255), 0.92 * a))
            ic = hues(self.accent, 4)[i % 4]
            rrect(c, sx0 + 40, yy + hgt / 2 - 38, sx0 + 116, yy + hgt / 2 + 38, 20, fill(ic, a))
            icon_draw(c, r.get("icon") or "bell", sx0 + 78, yy + hgt / 2, 44, 1.0, (255, 255, 255))
            text(c, _s(r.get("label"), 22), sx0 + 140, yy + hgt * 0.42, nf, (20, 20, 24), a, align="left")
            text(c, _s(r.get("text"), 30), sx0 + 140, yy + hgt * 0.75, tf, (90, 90, 100), a, align="left")
            c.restore()
        c.restore()
        if self.d.get("label"):
            f = fit(self.fonts["title"], self.d["label"].upper(), 90, W * 0.9)
            k = clamp((t - 0.5) / 0.4)
            text(c, self.d["label"].upper(), W / 2, H * 0.12 + 30 * (1 - k), f, self.text, k)

    # 9. barras 3D isométricas --------------------------------------------------------
    def _iso_bars(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.1 if self.dark else 0.05), self.bg)
        from .mograph import fmt_number, parse_number
        rows = self.d["items"]
        m = len(rows)
        vals = [(parse_number(r.get("value")) or ("", 0.0, "", 0)) for r in rows]
        vmax = max(v[1] for v in vals) or 1
        area = W * (0.84 if portrait() else 0.6)
        slot = area / m
        bw = slot * 0.58
        dx, dy = bw * 0.42, -bw * 0.3  # profundidade (oblíqua)
        x_start = W / 2 - area / 2 + (slot - bw - dx) / 2
        floor = H * (0.72 if portrait() else 0.8)
        maxh = H * (0.5 if portrait() else 0.52)
        # piso em perspectiva com linhas correndo
        for j in range(9):
            yy = floor + 20 + j * j * 7 + (t * 30) % 14
            c.drawLine(0, yy, W, yy, stroke(self.text, 2, 0.08 * (1 - j / 9)))
        for j in range(-8, 9):
            c.drawLine(W / 2 + j * 70, floor + 20, W / 2 + j * 260, H, stroke(self.text, 2, 0.06))
        cols = hues(self.accent, m, 0.12)
        unit = (" " + self.d["unit"]) if self.d.get("unit") else ""
        vsz = min(fit(self.fonts["title"], f"{v[0]}{fmt_number(v[1], v[3])}{v[2]}{unit}", 100, slot * 1.05).getSize() for v in vals)
        vf = font(self.fonts["title"], vsz)
        lf = fit(self.fonts["body"], max((r["label"] for r in rows), key=len), 46, slot * 0.95)
        lead = max(range(m), key=lambda i: vals[i][1])
        for i, (r, v) in enumerate(zip(rows, vals)):
            k = expo_out(clamp((t - 0.25 - i * 0.2) / 1.1))
            hh = maxh * (v[1] / vmax) * k + 8
            x0 = x_start + i * slot
            x1 = x0 + bw
            top = floor - hh
            colr = cols[i]
            c.drawOval(skia.Rect(x0 - 10, floor - 16, x1 + dx + 20, floor + 30), glow((0, 0, 0), 18, 0.45))
            front = skia.Paint(AntiAlias=True)
            front.setShader(skia.GradientShader.MakeLinear([skia.Point(0, top), skia.Point(0, floor)],
                                                          [col(mix(colr, (255, 255, 255), 0.15)), col(mix(colr, (0, 0, 0), 0.25))]))
            c.drawPath(path_q([(x1, top), (x1 + dx, top + dy), (x1 + dx, floor + dy), (x1, floor)]), fill(mix(colr, (0, 0, 0), 0.42)))
            c.drawRect(skia.Rect(x0, top, x1, floor), front)
            c.drawPath(path_q([(x0, top), (x0 + dx, top + dy), (x1 + dx, top + dy), (x1, top)]), fill(mix(colr, (255, 255, 255), 0.4)))
            # brilho que passa pela frente
            sh = ((t * 0.7 + i * 0.23) % 1.6) - 0.3
            if 0 < sh < 1:
                c.save()
                c.clipRect(skia.Rect(x0, top, x1, floor))
                yb = top + (floor - top) * sh
                c.drawRect(skia.Rect(x0, yb - 30, x1, yb + 30), glow((255, 255, 255), 20, 0.18))
                c.restore()
            if i == lead and k > 0.95:  # coroa no maior
                ph = (t * 1.2) % 1
                c.drawCircle(x0 + bw / 2 + dx / 2, top + dy / 2 - 160, 40 + 30 * ph, stroke(colr, 4, 1 - ph))
            if r.get("value"):
                s = f"{v[0]}{fmt_number(v[1] * k, v[3])}{v[2]}{unit}"
                text(c, s, x0 + bw / 2 + dx / 2, top + dy - 34, vf, self.text, clamp(k * 2))
            text(c, r["label"], x0 + bw / 2, floor + 80, lf, self.text, clamp(k * 3) * 0.85)

    # 10. espectro de áudio circular ---------------------------------------------------
    def _equalizer(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.25 if self.dark else 0.12), self.bg)
        cx, cy = W / 2, H * 0.46
        R = min(W, H) * 0.24
        enter = expo_out(clamp(t / 0.6))
        bars = 72
        cols = hues(self.accent, 3, 0.2)
        beat = abs(math.sin(t * math.pi * 2.1)) ** 6
        for i in range(bars):
            a = 2 * math.pi * i / bars - math.pi / 2
            v = (0.5 + 0.5 * math.sin(t * 7 + i * 0.7)) * (0.5 + 0.5 * math.sin(t * 3.1 - i * 0.31))
            v = 0.15 + 0.85 * v * (0.6 + 0.4 * beat)
            L = R * 0.75 * v * enter
            r0 = R * (1.05 + 0.04 * beat)
            colr = cols[0] if i % 3 == 0 else cols[1] if i % 3 == 1 else cols[2]
            c.drawLine(cx + math.cos(a) * r0, cy + math.sin(a) * r0, cx + math.cos(a) * (r0 + L), cy + math.sin(a) * (r0 + L),
                       stroke(colr, 11))
        c.drawCircle(cx, cy, R * (0.95 + 0.05 * beat), glow(self.accent, 50, 0.4))
        c.drawCircle(cx, cy, R * 0.92 * enter, fill(self.accent))
        ring = stroke(self.text, 4, 0.5)
        ring.setPathEffect(skia.DashPathEffect.Make([18, 18], t * 60))
        c.drawCircle(cx, cy, R * 1.95, ring)
        icon_draw(c, self.d.get("icon") or "mic", cx, cy, R * 0.9, clamp(t / 0.9), self.on_accent, width=10)
        # onda embaixo
        wave = skia.Path()
        y0 = cy + R * 2.35
        for x in range(0, int(W) + 10, 10):
            amp = 50 * math.sin(math.pi * x / W) * (0.4 + 0.6 * beat)
            yy = y0 + amp * math.sin(x * 0.03 + t * 9) * math.sin(x * 0.011 - t * 3)
            (wave.lineTo if x else wave.moveTo)(x, yy)
        c.drawPath(wave, stroke(self.text, 5, 0.8 * enter))
        if self.d.get("text"):
            f = fit(self.fonts["title"], self.d["text"].upper(), 100, W * 0.9)
            text(c, self.d["text"].upper(), W / 2, H * 0.14, f, self.text, clamp((t - 0.3) / 0.4))

    # 11. explosão de formas ----------------------------------------------------------
    def _burst(self, c, t, span, n):
        W, H = C.W, C.H
        cx, cy = W / 2, H * 0.44
        bg(c, self.bg)
        t0 = 0.25
        lt = t - t0
        if lt > 0:
            # raios de sol girando ao fundo depois da explosão
            sun = clamp((lt - 0.3) / 0.6)
            if sun > 0:
                c.save()
                c.rotate(lt * 8, cx, cy)
                for i in range(16):
                    a0 = 2 * math.pi * i / 16
                    a1 = a0 + math.pi / 16
                    R = max(W, H)
                    c.drawPath(path_q([(cx, cy), (cx + math.cos(a0) * R, cy + math.sin(a0) * R), (cx + math.cos(a1) * R, cy + math.sin(a1) * R)]),
                               fill(self.accent, 0.08 * sun))
                c.restore()
            ph = expo_out(clamp(lt / 0.7))
            c.drawCircle(cx, cy, ph * max(W, H) * 0.9, stroke(self.accent, 40 * (1 - ph) + 1, 1 - ph))
            ra = 1 - clamp((lt - 0.2) / 0.4)
            if ra > 0:
                for i in range(28):  # raios
                    a = 2 * math.pi * i / 28
                    r0 = 160 + 400 * expo_out(clamp(lt / 0.5))
                    r1 = r0 + 220 * (1 - expo_out(clamp((lt - 0.05) / 0.5)))
                    c.drawLine(cx + math.cos(a) * r0, cy + math.sin(a) * r0, cx + math.cos(a) * r1, cy + math.sin(a) * r1,
                               stroke(self.accent if i % 2 else self.text, 9, ra))
            rng = random.Random(5)
            cols = hues(self.accent, 4, 0.25) + [self.text]
            for i in range(90):
                a = rng.uniform(0, 2 * math.pi)
                v = rng.uniform(600, 1900)
                tt = lt
                x = cx + math.cos(a) * v * tt * math.exp(-tt * 1.2)
                y = cy + math.sin(a) * v * tt * math.exp(-tt * 1.2) + 380 * tt * tt
                if y > H + 60:
                    continue
                s = rng.uniform(16, 38)
                c.save()
                c.translate(x, y)
                c.rotate(tt * rng.uniform(-400, 400))
                c.scale(1, 0.4 + 0.6 * abs(math.cos(tt * rng.uniform(4, 9))))  # confete girando
                kind = i % 4
                colr = cols[i % len(cols)]
                if kind == 0:
                    c.drawCircle(0, 0, s * 0.6, fill(colr))
                elif kind == 1:
                    c.drawRect(skia.Rect(-s / 2, -s / 4, s / 2, s / 4), fill(colr))
                elif kind == 2:
                    c.drawPath(path_q([(0, -s * 0.6), (s * 0.55, s * 0.4), (-s * 0.55, s * 0.4)]), fill(colr))
                else:
                    sq = skia.Path()
                    sq.moveTo(-s, 0)
                    sq.cubicTo(-s / 2, -s, 0, s, s / 2, -s / 3)
                    c.drawPath(sq, stroke(colr, 6))
                c.restore()
        k = spring(max(lt, 0), 12, 5) if lt > 0 else 0.0
        if lt > 0.8:  # anel pulsando em volta
            ph = ((lt - 0.8) * 0.9) % 1
            c.drawCircle(cx, cy, 230 + 160 * ph, stroke(self.accent, 6, 0.7 * (1 - ph)))
        c.save()
        c.translate(cx, cy + math.sin(max(lt, 0) * 2.4) * 10)
        c.scale(k, k)
        c.drawCircle(0, 0, 230, glow(self.accent, 60, 0.5))
        c.drawCircle(0, 0, 220, fill(self.accent))
        if self.d.get("icon"):
            icon_draw(c, self.d["icon"], 0, 0, 240, clamp((lt - 0.1) / 0.6), self.on_accent, width=12)
        c.restore()
        if self.d.get("text"):
            f = fit(self.fonts["title"], self.d["text"].upper(), 190, W * 0.9)
            st = spring(max(lt - 0.3, 0), 14, 6) if lt > 0.3 else 0
            c.save()
            c.translate(W / 2, cy + 430)
            c.scale(st, st)
            c.rotate(-4 * (1 - min(st, 1)))
            text(c, self.d["text"].upper(), 0, f.getSize() * 0.35, f, self.text)
            c.restore()

    # 12. pilha de cartões -------------------------------------------------------------
    def _card_stack(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.12), self.bg)
        rows = self.d["items"]
        m = len(rows)
        per = max(0.8, (span - 0.4) / m)
        cw, ch = W * (0.74 if portrait() else 0.36), H * (0.46 if portrait() else 0.62)
        cx, cy = W / 2, H * 0.48
        top = min(int(t / per), m - 1)
        lt = t - top * per
        cols = hues(self.accent, m, 0.14)
        lf = font(self.fonts["title"], 110)
        tf = font(self.fonts["body"], 50)
        for i in reversed(range(top, min(m, top + 3))):
            depth = i - top
            r = rows[i]
            swipe = clamp((lt - (per - 0.45)) / 0.45) if (i == top and top < m - 1) else 0.0
            promote = clamp(lt / 0.4) if depth else 0
            d_eff = max(depth - promote, 0) if depth else 0
            s = 1 - 0.07 * d_eff
            yo = -46 * d_eff
            ang = (-3 + 6 * (i % 2)) * d_eff + 28 * ease_io(swipe)
            xo = ease_io(swipe) * W * 1.1
            entry = expo_out(clamp(t / 0.6)) if i == 0 else 1
            c.save()
            c.translate(cx + xo, cy + yo + (1 - entry) * H * 0.6)
            c.rotate(ang)
            c.scale(s, s)
            shadow(c, -cw / 2, -ch / 2, cw / 2, ch / 2, 50, 0.3, 40, 26)
            rrect(c, -cw / 2, -ch / 2, cw / 2, ch / 2, 50, fill((255, 255, 255) if not self.dark else mix(self.bg, self.text, 0.1)))
            rrect(c, -cw / 2, -ch / 2, cw / 2, -ch / 2 + ch * 0.42, 50, fill(cols[i]))
            c.drawRect(skia.Rect(-cw / 2, -ch / 2 + ch * 0.3, cw / 2, -ch / 2 + ch * 0.42), fill(cols[i]))
            if r.get("icon"):
                icon_draw(c, r["icon"], 0, -ch / 2 + ch * 0.21, ch * 0.2, 1.0, (255, 255, 255), width=9)
            ink = self.text if self.dark else (20, 20, 24)
            f = fit(self.fonts["title"], r["label"], 110, cw * 0.85)
            text(c, r["label"], 0, ch * 0.08 + f.getSize() * 0.35, f, ink)
            if r.get("text"):
                text(c, _s(r["text"], 34), 0, ch * 0.3, fit(self.fonts["body"], r["text"], 50, cw * 0.85), ink, 0.7)
            if swipe > 0.05:  # carimbo
                c.save()
                c.rotate(-18)
                a = clamp(swipe * 3)
                rrect(c, -cw * 0.3, -ch * 0.42, cw * 0.1, -ch * 0.28, 16, stroke(self.accent, 8, a))
                text(c, "OK", -cw * 0.1, -ch * 0.31, font(self.fonts["title"], 70), self.accent, a)
                c.restore()
            c.restore()

    # 13. carregando -> pronto ----------------------------------------------------------
    def _loader(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.15), self.bg)
        cx, cy = W / 2, H * 0.44
        R = min(W, H) * 0.26
        dur = max(1.4, span * 0.6)
        k = ease_io(clamp((t - 0.2) / dur))
        done = clamp((t - 0.2 - dur) / 0.5)
        c.drawCircle(cx, cy, R, stroke(self.text, 26, 0.1))
        arc = skia.Path()
        arc.addArc(skia.Rect(cx - R, cy - R, cx + R, cy + R), -90, 359.9 * k)
        p = stroke(self.accent, 26)
        a1, a2 = hues(self.accent, 2, 0.2)
        p.setShader(skia.GradientShader.MakeSweep(cx, cy, [col(a2), col(a1), col(a2)]))
        c.drawPath(arc, p)
        for j in range(3):  # pontinhos orbitando
            a = t * 4 + j * 2.1
            rr = R * 1.32
            c.drawCircle(cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.4, 12 - j * 2, fill(self.accent, (1 - done) * 0.8))
        if done > 0:
            c.drawCircle(cx, cy, R * expo_out(done), fill(self.accent))
            chk = skia.Path()
            chk.moveTo(cx - R * 0.42, cy + R * 0.02)
            chk.lineTo(cx - R * 0.1, cy + R * 0.32)
            chk.lineTo(cx + R * 0.46, cy - R * 0.3)
            cp = stroke(self.on_accent, 30)
            trim(cp, ease_io(clamp((done - 0.3) / 0.7)))
            c.drawPath(chk, cp)
        else:
            f = font(self.fonts["title"], R * 0.6)
            text(c, f"{int(k * 100)}%", cx, cy + f.getSize() * 0.35, f, self.text)
        # barra listrada
        bx0, bx1, by = W * 0.14, W * 0.86, cy + R + 170
        rrect(c, bx0, by, bx1, by + 40, 20, fill(self.text, 0.1))
        c.save()
        c.clipRect(skia.Rect(bx0, by, bx0 + (bx1 - bx0) * k, by + 40))
        rrect(c, bx0, by, bx1, by + 40, 20, fill(self.accent))
        for x in range(int(bx0) - 80, int(bx1) + 80, 40):
            xx = x + (t * 120) % 40
            c.drawPath(path_q([(xx, by + 40), (xx + 20, by + 40), (xx + 40, by), (xx + 20, by)]), fill(self.on_accent, 0.25))
        c.restore()
        if self.d.get("text"):
            lf = fit(self.fonts["title"], self.d["text"].upper(), 110, W * 0.86)
            st = spring(done, 14, 6) if done > 0 else 0
            c.save()
            c.translate(W / 2, by + 220)
            c.scale(max(st, 0.001), max(st, 0.001))
            text(c, self.d["text"].upper(), 0, lf.getSize() * 0.35, lf, self.text)
            c.restore()

    # 14. editor de código -------------------------------------------------------------
    KEYWORDS = {"const", "let", "function", "return", "if", "else", "for", "def", "import", "from", "await", "async",
                "class", "new", "true", "false", "print", "while", "in"}

    def _code(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.12), self.bg)
        lines = self.d["lines"]
        ww = W * (0.94 if portrait() else 0.6)
        longest = max(len(s) for s in lines) + 3
        f = mono(min(52 if portrait() else 40, (ww - 70) / (longest * 0.6)))
        lh = f.getSize() * 1.45
        wh = lh * (len(lines) + 1.4) + 120
        x0, y0 = W / 2 - ww / 2, H * 0.42 - wh / 2
        e = expo_out(clamp(t / 0.6))
        c.save()
        z = 1 + 0.1 * ease_io(clamp(t / max(span, 1)))  # câmera aproximando devagar
        c.translate(W / 2, H * 0.45)
        c.scale(z, z)
        c.translate(-W / 2, -H * 0.45)
        c.translate(0, (1 - e) * 200)
        shadow(c, x0, y0, x0 + ww, y0 + wh, 30, 0.5, 40, 30)
        rrect(c, x0, y0, x0 + ww, y0 + wh, 30, fill((24, 24, 32), e))
        c.drawRect(skia.Rect(x0, y0 + 80, x0 + ww, y0 + 82), fill((255, 255, 255), 0.06))
        for j, cc in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
            c.drawCircle(x0 + 44 + j * 40, y0 + 40, 12, fill(cc))
        text(c, "app.js", x0 + ww / 2, y0 + 52, font(self.fonts["body"], 32), (200, 200, 210), 0.7)
        total = sum(len(s) for s in lines)
        typed = int(clamp((t - 0.4) / max(1.4, span * 0.55)) * total)
        y = y0 + 80 + lh
        cursor = None
        for li, s in enumerate(lines):
            shown = s[:max(0, min(len(s), typed))]
            typed -= len(s)
            text(c, f"{li + 1:>2}", x0 + 30, y, f, (110, 110, 130), 0.8, align="left")
            x = x0 + 30 + f.measureText("00  ")
            for tok, colr in _tokens(shown, self.KEYWORDS, self.accent):
                c.drawString(tok, x, y, f, fill(colr))
                x += f.measureText(tok)
            if typed <= 0 and cursor is None:
                cursor = (x, y)
            y += lh
        if cursor and int(t * 2.5) % 2 == 0:
            c.drawRect(skia.Rect(cursor[0] + 2, cursor[1] - f.getSize() * 0.8, cursor[0] + f.getSize() * 0.55, cursor[1] + 8),
                       fill(self.accent, 0.9))
        done_at = 0.4 + max(1.4, span * 0.55) + 0.2
        if t > done_at and self.d.get("output"):
            k = clamp((t - done_at) / 0.35)
            oy = y0 + wh + 70
            rrect(c, x0, oy, x0 + ww, oy + 120, 26, fill((39, 201, 63), 0.16 * k))
            c.drawPath(path_q([(x0 + 40, oy + 38), (x0 + 72, oy + 60), (x0 + 40, oy + 82)]), fill((60, 220, 90), k))
            text(c, self.d["output"], x0 + 96, oy + 76, fit(self.fonts["body"], self.d["output"], 46, ww - 130), (60, 220, 90), k, align="left")
        c.restore()

    # 15. forma que se transforma -------------------------------------------------------
    def _morph(self, c, t, span, n):
        from .mograph import _poly
        W, H = C.W, C.H
        words = self.d["items"]
        m = len(words)
        slot = (span - 0.2) / m
        i = min(int(t / slot), m - 1)
        lt = t - i * slot
        kinds = ["circle", "square", "triangle", "hex", "diamond"]
        cols = hues(self.accent, m, 0.2)
        k = expo_out(clamp(lt / 0.5))
        cx, cy = W / 2, H * 0.47
        R = min(W, H) * 0.36
        a = _poly(kinds[(i - 1) % 5] if i else kinds[0], cx, cy, R, 96, (i - 1) * 0.6)
        b = _poly(kinds[i % 5], cx, cy, R, 96, i * 0.6)
        pts = [(pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k) for pa, pb in zip(a, b)] if i else b
        wob = 1 + 0.03 * math.sin(t * 6)
        pts = [(cx + (x - cx) * wob, cy + (y - cy) * wob) for x, y in pts]
        colr = mix(cols[i - 1], cols[i], k) if i else cols[0]
        bg(c, mix(self.bg, colr, 0.12))
        path = path_q(pts)
        c.drawPath(path, glow(colr, 60, 0.45))
        c.drawPath(path, fill(colr))
        c.drawPath(path_q([(cx + (x - cx) * 1.12, cy + (y - cy) * 1.12) for x, y in pts]), stroke(self.text, 4, 0.35))
        word = words[i].upper()
        f = fit(self.fonts["title"], word, 170, R * 1.3)
        c.save()
        c.clipRect(skia.Rect(0, cy - f.getSize(), W, cy + f.getSize() * 0.5))
        text(c, word, cx, cy + f.getSize() * 0.35 + f.getSize() * 1.2 * (1 - expo_out(clamp((lt - 0.1) / 0.4))), f,
             (255, 255, 255) if lum(colr) < 150 else (20, 20, 24))
        c.restore()

    # 16. tela que se abre em fatias -------------------------------------------------
    def _split_reveal(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.12 if self.dark else 0.05), self.bg)
        word = self.d["text"].upper()
        f = fit(self.fonts["title"], word, 360 if portrait() else 280, W * 0.88)
        cy = H * 0.48
        close = clamp((t - (span - 0.7)) / 0.6) if span > 2.5 else 0.0
        # letras sobem uma a uma por trás das fatias, depois o texto respira
        glyphs = list(word)
        total = f.measureText(word)
        x = W / 2 - total / 2
        spread = 1 + 0.06 * ease_io(clamp((t - 1.0) / 2.5))
        c.save()
        c.translate(W / 2, cy)
        c.scale(spread, spread)
        c.translate(-W / 2, -cy)
        c.save()
        c.clipRect(skia.Rect(0, cy - f.getSize(), W, cy + f.getSize() * 0.4))
        for i, ch in enumerate(glyphs):
            k = expo_out(clamp((t - 0.35 - i * 0.05) / 0.6))
            c.drawString(ch, x, cy + f.getSize() * 0.35 + f.getSize() * (1 - k), f, fill(self.text))
            x += f.measureText(ch)
        c.restore()
        c.restore()
        # sublinhado que corre
        u = expo_out(clamp((t - 0.9) / 0.7))
        ux0 = W / 2 - total / 2 * spread
        c.drawRect(skia.Rect(ux0, cy + f.getSize() * 0.55, ux0 + total * spread * u, cy + f.getSize() * 0.55 + 16), fill(self.accent))
        if self.d.get("sub"):
            sf = fit(self.fonts["body"], self.d["sub"], 64, W * 0.86)
            k = clamp((t - 1.1) / 0.4)
            text(c, self.d["sub"], W / 2, cy + f.getSize() * 0.55 + 120 + 20 * (1 - k), sf, self.text, k * 0.85)
        nsl = 7
        sw = W / nsl
        cols = hues(self.accent, 3, 0.12)
        for i in range(nsl):
            k = expo_out(clamp((t - 0.1 - i * 0.05) / 0.75))
            kc = expo_out(clamp((close * 0.6 + 0.4 * close - (nsl - 1 - i) * 0.04) / 0.6)) if close > 0 else 0
            d = -1 if i % 2 else 1
            y = d * (k - kc) * (H + 40)
            c.drawRect(skia.Rect(i * sw - 1, y, (i + 1) * sw + 1, y + H), fill(cols[i % 3]))

    # 17. órbita de ícones --------------------------------------------------------------
    def _orbit(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.18), self.bg)
        rows = self.d["items"]
        m = len(rows)
        cx, cy = W / 2, H * 0.47
        Rx, Ry = W * (0.38 if portrait() else 0.3), W * (0.3 if portrait() else 0.12)
        enter = expo_out(clamp(t / 0.8))
        rng = random.Random(21)  # estrelas
        for i in range(90):
            sx, sy = rng.uniform(0, W), rng.uniform(0, H)
            tw = 0.5 + 0.5 * math.sin(t * rng.uniform(1, 4) + i)
            c.drawCircle((sx + t * 12 * rng.uniform(0.3, 1)) % W, sy, rng.uniform(1.5, 3.5), fill(self.text, 0.35 * tw))
        for rr, aa in ((1.35, 0.12), (0.62, 0.18)):  # anéis extras
            c.drawCircle(cx, cy, min(W, H) * 0.42 * rr * enter, stroke(self.accent, 2, aa))
        ell = skia.Path()
        ell.addOval(skia.Rect(cx - Rx, cy - Ry, cx + Rx, cy + Ry))
        ep = stroke(self.text, 3, 0.3)
        trim(ep, enter)
        c.save()
        c.rotate(-12, cx, cy)
        c.drawPath(ell, ep)
        items = []
        for i, r in enumerate(rows):
            a = 2 * math.pi * i / m + t * 0.9
            x, y, z = cx + math.cos(a) * Rx, cy + math.sin(a) * Ry, math.sin(a)
            items.append((z, x, y, r, i))
        cols = hues(self.accent, m, 0.12)

        def draw_item(z, x, y, r, i):
            s = (0.75 + 0.3 * (z + 1) / 2) * enter
            # linha até o centro com pulso
            c.drawLine(cx, cy, x, y, stroke(self.text, 2, 0.15))
            ph = (t * 0.8 + i / m) % 1
            c.drawCircle(cx + (x - cx) * ph, cy + (y - cy) * ph, 6, fill(self.accent, 0.8))
            c.save()
            c.translate(x, y)
            c.rotate(12)
            c.scale(s, s)
            c.drawCircle(0, 0, 136, glow(cols[i], 34, 0.45))
            c.drawCircle(0, 0, 122, fill(cols[i]))
            icon_draw(c, r.get("icon") or r.get("label") or "star", 0, 0, 112, clamp((t - 0.2 - i * 0.1) / 0.6), (255, 255, 255), 8)
            if r.get("label"):
                text(c, r["label"], 0, 200, font(self.fonts["title"], 56), self.text, 0.9)
            c.restore()

        for it in sorted(items):
            if it[0] < 0:
                draw_item(*it)
        c.restore()
        core = spring(t, 11, 5.5)
        c.drawCircle(cx, cy, 230 * core, glow(self.accent, 50, 0.55))
        c.drawCircle(cx, cy, 205 * core, fill(self.accent))
        if self.d.get("text"):
            f = fit(self.fonts["title"], self.d["text"].upper(), 100, 340)
            text(c, self.d["text"].upper(), cx, cy + f.getSize() * 0.35, f, self.on_accent, clamp((t - 0.3) / 0.3))
        c.save()
        c.rotate(-12, cx, cy)
        for it in sorted(items):
            if it[0] >= 0:
                draw_item(*it)
        c.restore()

    # 18. busca com resultados ----------------------------------------------------------
    def _search(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, mix(self.bg, self.text, 0.03))
        q = self.d["text"]
        bw = W * (0.86 if portrait() else 0.6)
        bx0 = W / 2 - bw / 2
        typed_dur = 0.06 * len(q)
        go = 0.5 + typed_dur + 0.25
        mv = expo_out(clamp((t - go) / 0.5))
        by = H * 0.45 - (H * 0.45 - H * 0.2) * mv
        e = spring(t, 12, 6)
        c.save()
        c.translate(W / 2, by)
        c.scale(e, e)
        c.translate(-W / 2, -by)
        shadow(c, bx0, by - 80, bx0 + bw, by + 80, 80, 0.2, 30, 14)
        rrect(c, bx0, by - 80, bx0 + bw, by + 80, 80, fill((255, 255, 255)))
        rrect(c, bx0, by - 80, bx0 + bw, by + 80, 80, stroke(self.accent, 6, 0.8))
        icon_draw(c, "search", bx0 + 84, by, 64, 1.0, self.accent, 7)
        f = fit(self.fonts["body"], q, 60, bw - 200)
        shown = q[:int(clamp((t - 0.5) / max(typed_dur, 0.01)) * len(q))]
        text(c, shown, bx0 + 140, by + 18, f, (25, 25, 30), align="left")
        if t < go and int(t * 2.5) % 2 == 0:
            cx_ = bx0 + 144 + f.measureText(shown)
            c.drawRect(skia.Rect(cx_, by - 30, cx_ + 4, by + 30), fill(self.accent))
        c.restore()
        rows = self.d.get("items") or []
        for i, r in enumerate(rows):
            lt = t - go - 0.3 - i * 0.25
            if lt <= 0:
                continue
            k = expo_out(clamp(lt / 0.5))
            y0 = H * 0.3 + i * 330 + 60 * (1 - k)
            shadow(c, bx0, y0, bx0 + bw, y0 + 250, 40, 0.18 * k, 26, 12)
            rrect(c, bx0, y0, bx0 + bw, y0 + 250, 40, fill((255, 255, 255), k))
            if i == 0 and lt > 1.2:  # resultado escolhido
                kk = expo_out(clamp((lt - 1.2) / 0.4))
                rrect(c, bx0 - 6 * kk, y0 - 6 * kk, bx0 + bw + 6 * kk, y0 + 250 + 6 * kk, 44, stroke(self.accent, 8, kk))
            shimmer = clamp(1 - (lt - 0.4) / 0.4)  # esqueleto antes do texto
            if shimmer > 0:
                for j, ww in enumerate((0.5, 0.8, 0.65)):
                    rrect(c, bx0 + 40, y0 + 60 + j * 60, bx0 + 40 + (bw - 80) * ww, y0 + 92 + j * 60, 13,
                          fill((210, 210, 220), shimmer * k))
            a = 1 - shimmer
            colr = hues(self.accent, 3)[i % 3]
            c.drawCircle(bx0 + 90, y0 + 125, 50, fill(colr, a))
            icon_draw(c, r.get("icon") or "sparkles", bx0 + 90, y0 + 125, 52, 1.0, (255, 255, 255), 5)
            text(c, _s(r.get("label"), 28), bx0 + 175, y0 + 112, fit(self.fonts["title"], _s(r.get("label"), 28), 60, bw - 220), (25, 25, 30), a, align="left")
            text(c, _s(r.get("text"), 40), bx0 + 175, y0 + 180, fit(self.fonts["body"], _s(r.get("text"), 40), 44, bw - 220), (110, 110, 120), a, align="left")


def path_q(pts):
    p = skia.Path()
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    p.close()
    return p


def _tokens(s, keywords, accent):
    """Coloração simples de sintaxe: palavras-chave, textos entre aspas, números e o resto."""
    out, i = [], 0
    kw, st, num, base = accent, (152, 220, 120), (240, 170, 90), (225, 228, 240)
    while i < len(s):
        ch = s[i]
        if ch in "\"'":
            j = s.find(ch, i + 1)
            j = len(s) if j < 0 else j + 1
            out.append((s[i:j], st))
            i = j
        elif ch.isdigit():
            j = i
            while j < len(s) and (s[j].isdigit() or s[j] == "."):
                j += 1
            out.append((s[i:j], num))
            i = j
        elif ch.isalpha() or ch == "_":
            j = i
            while j < len(s) and (s[j].isalnum() or s[j] == "_"):
                j += 1
            w = s[i:j]
            out.append((w, kw if w in keywords else base))
            i = j
        else:
            out.append((ch, (150, 150, 170)))
            i += 1
    return out

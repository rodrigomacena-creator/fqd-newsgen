"""Motion graphics do motor genérico (render/template_engine.py), desenhados com Skia (vetor com antialias).

- Grafismo por cena (scene["graphic"]): infográficos e desenhos animados no lugar da imagem — contador,
  barras, ranking, item de ranking em sequência (contagem tipo odômetro entre cenas), gráfico de linha,
  rosca, passos com setas, checklist, versus, linha do tempo, ícone e fileira de ícones desenhados traço a
  traço (ícones do Lucide, assets/icons/lucide.json.gz).
- Traço em tempo real: todo contorno aparece sendo desenhado (TrimPathEffect) com ponta de caneta; estilo
  "hand" treme o traço (DiscretePathEffect) e o faz "ferver" a cada poucos quadros.
- Fundo vivo (spec["graphics"]["decor"]): grade que se desenha, linhas, pontos em onda, formas que se
  transformam umas nas outras (morph) e anéis.
- Tipografia cinética para o título: write_on (contorno das letras traçado e depois preenchido),
  letters (letra a letra com mola e giro) e mask_up (linhas sobem de trás de uma máscara).
- Transições de forma: circle_reveal, stripes, diagonal, blocks.

Tudo lê W/H/FPS de render.common na hora de desenhar (prévia rápida e 16:9 trocam esses valores).
"""
import gzip
import json
import math
import re
from functools import lru_cache

import numpy as np
import skia

from . import common as C
from . import mograph_fx, mograph_fx2
from .motion import bounce_out, clamp, ease_io, expo_out, spring

# ---------- ficha ----------

GRAPHICS_DEFAULT = {"style": "clean", "stroke": 10, "color": "accent", "glow": False, "decor": "none",
                    "pen": True, "usage": "some"}
GRAPHICS_CHOICES = {
    "graphics.style": ["clean", "hand"],
    "graphics.color": ["accent", "text"],
    "graphics.decor": ["none", "grid", "lines", "dots", "shapes", "rings"],
    "graphics.usage": ["none", "some", "many"],
}
BASE_TYPES = ("counter", "bars", "ranking", "rank_item", "line_chart", "donut", "steps", "checklist", "versus",
              "timeline", "icon", "icons")
# cenas de motion de tela cheia (render/mograph_fx.py): pintam a tela inteira, sem imagem
GRAPHIC_TYPES = BASE_TYPES + mograph_fx2.ALL_FX
# tipos que mostram a imagem da cena (os outros não geram imagem)
IMAGE_GRAPHICS = ("rank_item",)
TITLE_ANIMATIONS = ("write_on", "letters", "mask_up")
SHAPE_TRANSITIONS = ("circle_reveal", "stripes", "diagonal", "blocks")


def normalize_graphics(raw):
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for k, d in GRAPHICS_DEFAULT.items():
        v = raw.get(k, d)
        ch = GRAPHICS_CHOICES.get(f"graphics.{k}")
        if ch:
            out[k] = v if v in ch else d
        elif isinstance(d, bool):
            out[k] = bool(v)
        else:
            try:
                out[k] = min(max(float(v), 3.0), 26.0)
            except (TypeError, ValueError):
                out[k] = d
    return out


def _s(v, n=60):
    return re.sub(r"\s+", " ", str(v if v is not None else "")).strip()[:n]


def normalize_graphic(g):
    """Grafismo de uma cena, limpo. None se não serve (a cena fica como sem grafismo)."""
    if not isinstance(g, dict) or g.get("type") not in GRAPHIC_TYPES:
        return None
    if g["type"] in mograph_fx2.ALL_FX:
        return mograph_fx2.normalize(g)
    t = g["type"]
    items = [i for i in (g.get("items") or []) if isinstance(i, (dict, str))] if isinstance(g.get("items"), list) else []

    def item(i):
        return i if isinstance(i, dict) else {"label": i}

    if t == "counter":
        if parse_number(g.get("value")) is None:
            return None
        return {"type": t, "value": _s(g.get("value"), 24), "from": _s(g.get("from"), 24), "label": _s(g.get("label"), 50)}
    if t in ("bars", "ranking"):
        rows = [{"label": _s(item(i).get("label"), 32), "value": _s(item(i).get("value"), 20)} for i in items][:6]
        rows = [r for r in rows if r["label"]]
        if len(rows) < 2:
            return None
        return {"type": t, "items": rows, "unit": _s(g.get("unit"), 12)}
    if t == "rank_item":
        return {"type": t, "rank": _s(g.get("rank"), 6), "label": _s(g.get("label"), 40), "value": _s(g.get("value"), 24),
                "sub": _s(g.get("sub"), 40), "header": _s(g.get("header"), 40)}
    if t == "line_chart":
        pts = [parse_number(p) for p in (g.get("points") or [])] if isinstance(g.get("points"), list) else []
        pts = [p[1] for p in pts if p is not None][:12]
        if len(pts) < 2:
            return None
        labels = [_s(x, 10) for x in (g.get("labels") or [])][:len(pts)] if isinstance(g.get("labels"), list) else []
        return {"type": t, "points": pts, "labels": labels, "unit": _s(g.get("unit"), 12), "label": _s(g.get("label"), 40)}
    if t == "donut":
        n = parse_number(g.get("value"))
        if n is None:
            return None
        return {"type": t, "value": _s(g.get("value"), 12), "label": _s(g.get("label"), 40)}
    if t in ("steps", "checklist", "icons"):
        rows = [{"label": _s(item(i).get("label") or item(i).get("text"), 34), "icon": _s(item(i).get("icon"), 30)}
                for i in items][:5 if t != "icons" else 3]
        rows = [r for r in rows if r["label"] or r["icon"]]
        if len(rows) < (1 if t == "icons" else 2):
            return None
        return {"type": t, "items": rows}
    if t == "versus":
        def side(v):
            v = v if isinstance(v, dict) else {"label": v}
            return {"label": _s(v.get("label"), 24), "value": _s(v.get("value"), 16), "icon": _s(v.get("icon"), 30)}
        left, right = side(g.get("left")), side(g.get("right"))
        if not left["label"] or not right["label"]:
            return None
        return {"type": t, "left": left, "right": right}
    if t == "timeline":
        rows = [{"label": _s(item(i).get("label") or item(i).get("year"), 14), "text": _s(item(i).get("text"), 34)}
                for i in items][:5]
        rows = [r for r in rows if r["label"] or r["text"]]
        if len(rows) < 2:
            return None
        return {"type": t, "items": rows}
    if t == "icon":
        return {"type": t, "icon": _s(g.get("icon"), 30) or "sparkles", "label": _s(g.get("label"), 40)}
    return None


def needs_image(g):
    return bool(g) and g.get("type") in IMAGE_GRAPHICS


# ---------- números ----------

_NUM = re.compile(r"-?\d[\d.,]*")


def parse_number(v):
    """'R$ 1,2 mi' -> ('R$ ', 1.2, ' mi', 1). Devolve (prefixo, valor, sufixo, casas) ou None."""
    if isinstance(v, (int, float)) and math.isfinite(v):
        s = f"{v}"
    else:
        s = str(v or "").strip()
    m = _NUM.search(s)
    if not m:
        return None
    raw = m.group(0)
    # pt-BR: 1.500,5 ; en: 1,500.5 ; ambíguo "1.5" / "1,5" = decimal
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        parts = raw.split(",")
        raw = raw.replace(",", ".") if len(parts) == 2 and len(parts[1]) != 3 else raw.replace(",", "")
    elif raw.count(".") > 1 or (raw.count(".") == 1 and len(raw.split(".")[1]) == 3 and not s.startswith("0")):
        raw = raw.replace(".", "")
    try:
        val = float(raw)
    except ValueError:
        return None
    dec = len(raw.split(".")[1]) if "." in raw else 0
    return s[:m.start()], val, s[m.end():], min(dec, 2)


def fmt_number(val, dec):
    s = f"{abs(val):,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if val < 0 else "") + s


# ---------- Skia: superfície sobre o quadro ----------

_BUF = {}


class Canvas:
    """Desenha com Skia direto em cima de um quadro numpy RGB (H, W, 3), só nas linhas rows=(y0, y1)."""

    def __init__(self, fr, rows=None):
        self.fr = fr
        h, w = fr.shape[:2]
        y0, y1 = rows or (0, h)
        self.y0, self.y1 = max(0, int(y0)), min(h, int(y1))
        key = (h, w)
        if key not in _BUF:
            buf = np.empty((h, w, 4), np.uint8)
            buf[..., 3] = 255
            _BUF[key] = (buf, skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kPremul_AlphaType))
        self.buf, self.surface = _BUF[key]

    def __enter__(self):
        if self.y1 <= self.y0:
            self.canvas = None
            return None
        self.buf[self.y0:self.y1, :, :3] = self.fr[self.y0:self.y1]
        self.buf[self.y0:self.y1, :, 3] = 255
        c = self.surface.getCanvas()
        c.save()
        c.clipRect(skia.Rect(0, self.y0, self.fr.shape[1], self.y1))
        self.canvas = c
        return c

    def __exit__(self, *exc):
        if self.canvas is not None:
            self.canvas.restore()
            self.fr[self.y0:self.y1] = self.buf[self.y0:self.y1, :, :3]
        return False


def col(rgb_t, a=1.0):
    return skia.Color(int(rgb_t[0]), int(rgb_t[1]), int(rgb_t[2]), int(255 * clamp(a)))


def _hex(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


@lru_cache(maxsize=32)
def typeface(path):
    tf = skia.Typeface.MakeFromFile(str(path)) if path else None
    return tf or skia.Typeface.MakeDefault()


def sk_font(path, size):
    f = skia.Font(typeface(path), float(size))
    f.setEdging(skia.Font.Edging.kAntiAlias)
    f.setSubpixel(True)
    return f


def text_w(font, s):
    return font.measureText(s)


def fit_font(path, s, size, max_w, min_size=24):
    while size > min_size and text_w(sk_font(path, size), s) > max_w:
        size *= 0.92
    return sk_font(path, size)


def draw_text(c, s, x, y, font, color, align="center", alpha=1.0, shadow=False):
    """Texto com a linha de base em y; align center|left|right."""
    if not s:
        return
    w = text_w(font, s)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    if shadow:
        sp = skia.Paint(Color=skia.Color(0, 0, 0, int(110 * alpha)), AntiAlias=True,
                        MaskFilter=skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 8))
        c.drawString(s, x0 + 3, y + 5, font, sp)
    c.drawString(s, x0, y, font, skia.Paint(Color=col(color, alpha), AntiAlias=True))


# ---------- traço desenhado ----------

def stroke_paint(color, width, alpha=1.0, frac=1.0, hand=False, boil=0, glow=False, cap=True):
    p = skia.Paint(Color=col(color, alpha), AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=float(width))
    if cap:
        p.setStrokeCap(skia.Paint.kRound_Cap)
        p.setStrokeJoin(skia.Paint.kRound_Join)
    effects = []
    if frac < 0.999:
        effects.append(skia.TrimPathEffect.Make(0.0, max(0.0005, clamp(frac))))
    if hand:
        effects.append(skia.DiscretePathEffect.Make(14.0, max(1.2, width * 0.22), 7 + boil))
    if effects:
        pe = effects[0]
        for e in effects[1:]:
            pe = skia.PathEffect.MakeCompose(e, pe)
        p.setPathEffect(pe)
    if glow:
        p.setImageFilter(skia.ImageFilters.DropShadow(0, 0, width * 0.9, width * 0.9, col(color, alpha * 0.9)))
    return p


def path_from(points, closed=False):
    p = skia.Path()
    if not points:
        return p
    p.moveTo(*points[0])
    for pt in points[1:]:
        p.lineTo(*pt)
    if closed:
        p.close()
    return p


def pen_tip(c, path, frac, color, width, alpha=1.0):
    """Bolinha na ponta do traço enquanto ele está sendo desenhado (a "caneta")."""
    if not (0.02 < frac < 0.985):
        return
    pm = skia.PathMeasure(path, False)
    total, contours = 0.0, []
    while True:
        ln = pm.getLength()
        contours.append(ln)
        total += ln
        if not pm.nextContour():
            break
    if total <= 0:
        return
    target = total * frac
    pm = skia.PathMeasure(path, False)
    for ln in contours:
        if target <= ln:
            pos, _ = pm.getPosTan(max(0.0, target))
            c.drawCircle(pos.x(), pos.y(), width * 0.95, skia.Paint(Color=col(color, alpha), AntiAlias=True))
            c.drawCircle(pos.x(), pos.y(), width * 2.2,
                         skia.Paint(Color=col(color, alpha * 0.25), AntiAlias=True,
                                    MaskFilter=skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, width)))
            return
        target -= ln
        pm.nextContour()


class Pen:
    """Estilo de traço da ficha (spec["graphics"]) + cores da paleta."""

    def __init__(self, spec, frame_index=0):
        g = spec.get("graphics") or GRAPHICS_DEFAULT
        pal = spec["palette"]
        self.accent = _hex(pal["accent"])
        self.text = _hex(pal["text"])
        self.bg = _hex(pal["background"])
        self.accent_text = _hex(pal["accentText"])
        self.line = self.accent if g.get("color", "accent") == "accent" else self.text
        self.width = float(g.get("stroke", 10))
        self.hand = g.get("style") == "hand"
        self.glow = bool(g.get("glow"))
        self.pen = bool(g.get("pen", True))
        self.boil = (frame_index // 4) % 3 if self.hand else 0
        # a cor do texto sobre o fundo da cena (fundo claro = texto escuro)
        self.on_bg = self.text

    def stroke(self, c, path, frac, color=None, width=None, alpha=1.0, tip=True):
        if frac <= 0:
            return
        color = color or self.line
        width = width or self.width
        c.drawPath(path, stroke_paint(color, width, alpha, frac, self.hand, self.boil, self.glow))
        if tip and self.pen:
            pen_tip(c, path, frac, color, width, alpha)


# ---------- ícones (Lucide, ISC) ----------

@lru_cache(maxsize=1)
def _icons():
    try:
        return json.loads(gzip.decompress(open(C.asset("icons", "lucide.json.gz"), "rb").read()))
    except Exception:
        return {}


_ICON_ALIASES = {"dinheiro": "banknote", "money": "banknote", "grafico": "chart-line", "chart": "chart-line",
                 "growth": "trending-up", "crescimento": "trending-up", "idea": "lightbulb", "ideia": "lightbulb",
                 "time": "clock", "tempo": "clock", "people": "users", "pessoas": "users", "phone": "smartphone",
                 "celular": "smartphone", "world": "globe", "mundo": "globe", "search": "search", "ai": "brain",
                 "ia": "brain", "money-bag": "hand-coins", "trophy": "trophy", "car": "car", "game": "gamepad-2"}


def find_icon(name):
    """Ícone pelo nome ou palavra-chave (inglês). Sem nada parecido: 'sparkles'."""
    icons = _icons()
    if not icons:
        return None
    key = re.sub(r"[^a-z0-9-]+", "-", str(name or "").lower()).strip("-")
    key = _ICON_ALIASES.get(key, key)
    if key in icons:
        return icons[key]
    words = [w for w in key.split("-") if len(w) > 2]
    best, score = None, 0
    for n, ic in icons.items():
        s = 0
        parts = n.split("-")
        for w in words:
            if w in parts:
                s += 3
            elif w in ic.get("t", []):
                s += 2
            elif any(t.startswith(w) for t in ic.get("t", [])):
                s += 1
        if s > score or (s == score and s > 0 and best and len(n) < len(best[0])):
            best, score = (n, ic), s
    return best[1] if best else icons.get("sparkles")


def icon_paths(icon, cx, cy, size):
    """Caminhos Skia do ícone (24x24) centrado em (cx, cy) com o tamanho dado."""
    if not icon:
        return []
    k = size / 24.0
    out = []
    for s in icon["s"]:
        flat, closed = (s["p"], s["c"]) if isinstance(s, dict) else (s, False)
        pts = [(cx + (flat[i] - 12) * k, cy + (flat[i + 1] - 12) * k) for i in range(0, len(flat), 2)]
        out.append(path_from(pts, closed))
    return out


def draw_icon(c, pen, icon, cx, cy, size, prog, color=None, width=None):
    """Desenha o ícone traço a traço: cada traço começa um pouco depois do anterior."""
    paths = icon_paths(icon, cx, cy, size)
    if not paths:
        return
    n = len(paths)
    width = width or max(3.0, size / 24 * 1.9)
    for i, p in enumerate(paths):
        k = clamp((prog * (n * 0.55 + 1) - i * 0.55))
        if k > 0:
            pen.stroke(c, p, ease_io(k), color=color, width=width, tip=k < 1)


# ---------- grafismos ----------

def region():
    """Área do grafismo: meio da tela (título em cima, legenda embaixo)."""
    W, H = C.W, C.H
    if C.landscape():
        return W * 0.1, H * 0.2, W * 0.9, H * 0.78
    return W * 0.08, H * 0.22, W * 0.92, H * 0.7


def _stagger(t, i, n, start=0.15, total=1.1, each=0.45):
    gap = max(0.0, (total - each) / max(n - 1, 1)) if n > 1 else 0
    return clamp((t - start - i * gap) / each)


class Graphic:
    def __init__(self, data, spec, fonts, image=None, prev=None):
        self.d = data
        self.spec = spec
        self.fonts = fonts  # {"title": caminho, "body": caminho}
        self.image = image  # PIL RGB/RGBA (rank_item/versus)
        self.prev = prev  # grafismo da cena anterior (rank_item encadeia o contador)
        self._img = None
        self.fx = mograph_fx2.FXPlus(data, spec, fonts) if data["type"] in mograph_fx2.ALL_FX else None

    def rows(self):
        if self.fx:
            return 0, C.H
        x0, y0, x1, y1 = region()
        return y0 - 320, y1 + 260

    def draw(self, fr, t, span, n_frame=0):
        if self.fx:  # tela cheia: a transição da cena cuida da saída
            with Canvas(fr, self.rows()) as c:
                if c is not None:
                    c.save()
                    try:
                        self.fx.draw(c, t, span, n_frame)
                    except Exception as e:  # um quadro com problema não derruba o vídeo inteiro
                        if not getattr(self, "_fx_err", False):
                            print(f"grafismo {self.d['type']}: {e}", flush=True)
                            self._fx_err = True
                    c.restore()
            return
        pen = Pen(self.spec, n_frame)
        out = 0.0
        if span > 1.0:
            out = clamp((t - (span - 0.22)) / 0.22)
        with Canvas(fr, self.rows()) as c:
            if c is None:
                return
            if out > 0:
                c.saveLayerAlpha(None, int(255 * (1 - out)))
            getattr(self, "_" + self.d["type"])(c, pen, t, span)
            if out > 0:
                c.restore()
            if self.d.get("header"):
                self._header(c, pen, t)

    def _header(self, c, pen, t):
        """Faixa fixa do topo (ex.: nome do ranking). Se a cena anterior tinha a mesma faixa, ela fica
        parada (não anima de novo), como num quadro de TV."""
        W = C.W
        text = self.d["header"].upper()
        same = self.prev is not None and self.prev.d.get("header") == self.d["header"]
        k = 1.0 if same else expo_out(clamp(t / 0.5))
        x0, y0, x1, y1 = region()
        f = fit_font(self.fonts["title"], text, 84 if not C.landscape() else 60, (x1 - x0) * 0.9)
        tw = text_w(f, text)
        bw, bh = tw + 70, f.getSize() * 1.45
        cy = y0 - 250 + bh / 2 if not C.landscape() else y0 - 120
        cx = W / 2
        c.save()
        c.clipRect(skia.Rect(cx - bw / 2, cy - bh / 2, cx - bw / 2 + bw * k, cy + bh / 2))
        p = skia.Paint(AntiAlias=True, Color=col(pen.accent))
        c.drawRoundRect(skia.Rect(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), 10, 10, p)
        ta = 1.0 if same else clamp((t - 0.2) / 0.3)
        draw_text(c, text, cx, cy + f.getSize() * 0.36 + 18 * (1 - ta), f, pen.accent_text, alpha=ta)
        c.restore()

    # números grandes -----------------------------------------------------------
    def _counter(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        pre, val, suf, dec = parse_number(self.d["value"])
        frm = parse_number(self.d.get("from"))
        start = frm[1] if frm else 0.0
        k = expo_out(clamp((t - 0.1) / min(1.4, max(span * 0.6, 0.5))))
        cur = start + (val - start) * k
        s = f"{pre}{fmt_number(cur, dec)}{suf}"
        final = f"{pre}{fmt_number(val, dec)}{suf}"
        f = fit_font(self.fonts["title"], final, (x1 - x0) * 0.42, (x1 - x0) * 0.92)
        pop = 1.0 + 0.12 * (1 - spring(max(t - 0.1, 0), 12, 6))
        c.save()
        c.translate(cx, cy)
        c.scale(pop, pop)
        # anel desenhado atrás do número
        # oval "rabiscado" em volta do número: largo como o número, sem subir até o título
        rx = max(text_w(f, final) * 0.62, f.getSize() * 0.9)
        ry = min(max(f.getSize() * 0.95, rx * 0.55), rx)
        r = ry
        ring = skia.Path()
        ring.addOval(skia.Rect(-rx, -f.getSize() * 0.32 - ry, rx, -f.getSize() * 0.32 + ry))
        pen.stroke(c, ring, ease_io(clamp((t - 0.05) / 0.9)), alpha=0.9, tip=True)
        draw_text(c, s, 0, 0, f, pen.on_bg, shadow=False)
        c.restore()
        if self.d.get("label"):
            lf = fit_font(self.fonts["body"], self.d["label"], 54, (x1 - x0) * 0.9)
            a = clamp((t - 0.5) / 0.3)
            draw_text(c, self.d["label"], cx, cy + r + 30 * a + 40, lf, pen.on_bg, alpha=a)

    def _donut(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - 20
        pre, val, suf, dec = parse_number(self.d["value"])
        pct = clamp(val / 100.0) if val <= 100 else 1.0
        r = min(x1 - x0, y1 - y0) * 0.33
        k = expo_out(clamp((t - 0.15) / 1.2))
        track = skia.Path()
        track.addCircle(cx, cy, r)
        pen.stroke(c, track, ease_io(clamp(t / 0.5)), color=pen.on_bg, width=pen.width * 2.6, alpha=0.14, tip=False)
        arc = skia.Path()
        arc.addArc(skia.Rect(cx - r, cy - r, cx + r, cy + r), -90, 359.9 * pct * k)
        if pct * k > 0.002:
            c.drawPath(arc, stroke_paint(pen.accent, pen.width * 2.6, 1.0, 1.0, False, 0, pen.glow))
        s = f"{pre}{fmt_number(val * k, dec)}{suf}"
        f = fit_font(self.fonts["title"], f"{pre}{fmt_number(val, dec)}{suf}", r * 0.75, r * 1.45)
        draw_text(c, s, cx, cy + f.getSize() * 0.35, f, pen.on_bg)
        if self.d.get("label"):
            lf = fit_font(self.fonts["body"], self.d["label"], 52, (x1 - x0) * 0.9)
            a = clamp((t - 0.6) / 0.3)
            draw_text(c, self.d["label"], cx, cy + r + 110 - 20 * (1 - a), lf, pen.on_bg, alpha=a)

    # barras e rankings ---------------------------------------------------------
    def _bars(self, c, pen, t, span, ranking=False):
        x0, y0, x1, y1 = region()
        rows = self.d["items"]
        n = len(rows)
        vals = [(parse_number(r["value"]) or ("", 0.0, "", 0)) for r in rows]
        vmax = max([v[1] for v in vals] + [1e-9])
        row_h = (y1 - y0) / n
        if ranking and vmax <= 1e-9:  # ranking sem números: lista grande com selos
            return self._list(c, pen, t, span)
        bar_h = min(row_h * 0.42, 100)
        lf = sk_font(self.fonts["body"], min(66, row_h * 0.3))
        vf = sk_font(self.fonts["title"], min(86, row_h * 0.38))
        left = x0 + (100 if ranking else 0)
        top_i = max(range(n), key=lambda i: vals[i][1])
        unit = (" " + self.d["unit"]) if self.d.get("unit") else ""
        room = 30 + max(text_w(vf, f"{v[0]}{fmt_number(v[1], v[3])}{v[2]}{unit}") for v in vals)  # espaço do número
        for i, (r, v) in enumerate(zip(rows, vals)):
            k = _stagger(t, i, n, total=min(1.3, span * 0.55), each=0.6)
            if k <= 0:
                continue
            e = expo_out(k)
            y = y0 + row_h * i + row_h * 0.55
            if ranking:  # selo com a posição
                badge = skia.Path()
                badge.addCircle(x0 + 40, y, 40)
                pen.stroke(c, badge, ease_io(clamp(k * 1.6)), width=pen.width * 0.6, tip=False)
                draw_text(c, str(i + 1), x0 + 40, y + 17, sk_font(self.fonts["title"], 46), pen.on_bg, alpha=clamp(k * 2))
            draw_text(c, r["label"], left, y - bar_h / 2 - 14, lf, pen.on_bg, align="left", alpha=clamp(k * 2))
            full = (x1 - left - room) * (v[1] / vmax if vmax else 0)
            w = max(bar_h * 0.3, full * e)
            color = pen.accent if i == top_i else pen.on_bg
            alpha = 1.0 if i == top_i else 0.55
            rect = skia.RRect.MakeRectXY(skia.Rect(left, y - bar_h / 2, left + w, y + bar_h / 2), bar_h / 2, bar_h / 2)
            c.drawRRect(rect, skia.Paint(Color=col(color, alpha), AntiAlias=True))
            if r["value"]:
                pre, val, suf, dec = v
                s = f"{pre}{fmt_number(val * e, dec)}{suf}{(' ' + self.d['unit']) if self.d.get('unit') else ''}"
                draw_text(c, s, left + w + 18, y + vf.getSize() * 0.35, vf, pen.on_bg, align="left", alpha=clamp(k * 2))

    def _ranking(self, c, pen, t, span):
        self._bars(c, pen, t, span, ranking=True)

    def _list(self, c, pen, t, span):
        """Ranking sem números: posições grandes, cada linha entra com máscara; a 1ª em destaque."""
        x0, y0, x1, y1 = region()
        rows = self.d["items"]
        n = len(rows)
        row_h = (y1 - y0) / n
        r = min(62, row_h * 0.36)
        lf = sk_font(self.fonts["title"], min(78, row_h * 0.42))
        nf = sk_font(self.fonts["title"], r * 1.1)
        for i, row in enumerate(rows):
            k = _stagger(t, n - 1 - i, n, total=min(1.6, span * 0.65), each=0.55)  # do último para o 1º
            if k <= 0:
                continue
            y = y0 + row_h * (i + 0.5)
            top = i == 0
            pop = spring(k * 0.7, 15, 6)
            c.drawCircle(x0 + r, y, r * pop, skia.Paint(Color=col(pen.accent if top else pen.on_bg, 1.0 if top else 0.12),
                                                       AntiAlias=True))
            ring = skia.Path()
            ring.addCircle(x0 + r, y, r)
            pen.stroke(c, ring, ease_io(k), width=pen.width * 0.5, tip=False)
            draw_text(c, str(i + 1), x0 + r, y + nf.getSize() * 0.36, nf, pen.accent_text if top else pen.on_bg,
                      alpha=clamp(k * 2))
            reveal_text(c, row["label"], x0 + r * 2 + 34, y + lf.getSize() * 0.36, lf, pen.accent if top else pen.on_bg,
                        clamp((k - 0.15) * 1.5))

    def _rank_item(self, c, pen, t, span):
        """Um item do ranking por cena: número da posição grande, valor que conta a partir do item
        anterior (odômetro), nome e uma pista que se desenha; a imagem atravessa a tela."""
        W = C.W
        x0, y0, x1, y1 = region()
        h = y1 - y0
        cx = (x0 + x1) / 2
        d = self.d
        prev = self.prev.d if self.prev is not None and self.prev.d.get("type") == "rank_item" else None
        enter = expo_out(clamp(t / 0.45))
        leave = clamp((t - (span - 0.25)) / 0.25) if span > 1.0 else 0.0
        # posição (odômetro a partir da anterior), grande, à esquerda
        rank_f = sk_font(self.fonts["title"], min(260, h * 0.27))
        rk = parse_number(d.get("rank"))
        if rk:
            frm = parse_number(prev.get("rank")) if prev else None
            draw_odometer(c, rk[1], frm[1] if frm else None, clamp(t / 0.55), x0, y0 + rank_f.getSize() * 0.8, rank_f,
                          pen.accent, prefix="#", align="left")
        a = clamp((t - 0.15) / 0.35)
        base = y0 + h * 0.52
        if d.get("label"):
            lf = fit_font(self.fonts["body"], d["label"].upper(), 54, (x1 - x0) * 0.95)
            draw_text(c, d["label"].upper(), cx, y0 + h * 0.33 + 14 * (1 - a), lf, pen.on_bg, alpha=a * 0.9)
        v = parse_number(d.get("value"))
        if d.get("value"):
            vf = fit_font(self.fonts["title"], d["value"], min(200, h * 0.21), (x1 - x0) * 0.98)
            c.save()
            c.translate((1 - enter) * 420 - leave * 420, 0)
            pv = parse_number(prev.get("value")) if prev else None
            if v and pv and pv[0] == v[0] and pv[2] == v[2]:
                draw_odometer(c, v[1], pv[1], clamp(t / 0.7), cx, base, vf, pen.on_bg, prefix=v[0], suffix=v[2], dec=v[3])
            else:
                draw_text(c, d["value"], cx, base, vf, pen.on_bg, alpha=enter)
            c.restore()
        if d.get("sub"):
            sf = fit_font(self.fonts["body"], d["sub"], 50, (x1 - x0) * 0.9)
            sv = parse_number(d["sub"])
            ps = parse_number(prev.get("sub")) if prev and prev.get("sub") else None
            if sv and ps and ps[0] == sv[0] and ps[2] == sv[2]:  # "273 dias" -> "58 dias" também rola
                draw_odometer(c, sv[1], ps[1], clamp((t - 0.1) / 0.7), cx, base + 78, sf, pen.on_bg, prefix=sv[0],
                              suffix=sv[2], dec=sv[3], alpha=0.65)
            else:
                draw_text(c, d["sub"], cx, base + 78, sf, pen.on_bg, alpha=a * 0.65)
        # imagem atravessando (entra pela direita com rastro, desacelera no meio, sai à esquerda)
        land = C.landscape()
        img_cy = y0 + h * (0.93 if land else 0.86)
        if self.image is not None:
            if self._img is None:  # faixa de ponta a ponta, como a pista do quadro de TV
                self._img = _to_skimage(self.image, int(W * 1.2), int(h * (0.32 if land else 0.44)), cover=True, radius=0)
            im = self._img
            slide = (1 - enter) * W * 0.9 + W * 0.08 - min(t, 6.0) * 26 - leave * W  # anda devagar, sem mostrar a borda
            blur = 30 * (1 - enter) + 30 * leave
            p = skia.Paint(AntiAlias=True)
            if blur > 1:
                p.setImageFilter(skia.ImageFilters.Blur(blur, 0.5))
            c.drawImage(im, cx - im.width() / 2 + slide, img_cy - im.height() / 2, skia.SamplingOptions(skia.FilterMode.kLinear), p)
        track_y = img_cy + h * (0.19 if land else 0.25)
        pen.stroke(c, path_from([(x0 - 80, track_y), (x1 + 80, track_y)]), ease_io(clamp(t / 0.5)), color=pen.on_bg,
                   width=5, alpha=0.35, tip=False)

    # gráfico de linha ------------------------------------------------------------
    def _line_chart(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        pts = self.d["points"]
        n = len(pts)
        lo, hi = min(pts), max(pts)
        if hi - lo < 1e-9:
            hi = lo + 1
        gx0, gx1 = x0 + 40, x1 - 40
        gy0, gy1 = y0 + 90, y1 - 90
        axis = path_from([(gx0, gy0 - 20), (gx0, gy1), (gx1, gy1)])
        pen.stroke(c, axis, ease_io(clamp(t / 0.45)), color=pen.on_bg, width=4, alpha=0.5, tip=False)
        xy = [(gx0 + (gx1 - gx0) * i / (n - 1), gy1 - (gy1 - gy0) * (p - lo) / (hi - lo) * 0.9) for i, p in enumerate(pts)]
        line = skia.Path()
        line.moveTo(*xy[0])
        for i in range(1, n):  # curva suave entre os pontos
            (ax, ay), (bx, by) = xy[i - 1], xy[i]
            mx = (ax + bx) / 2
            line.cubicTo(mx, ay, mx, by, bx, by)
        k = ease_io(clamp((t - 0.3) / min(1.4, max(span * 0.6, 0.6))))
        # área preenchida que acompanha o traço
        if k > 0.02:
            area = skia.Path(line)
            area.lineTo(xy[-1][0], gy1)
            area.lineTo(xy[0][0], gy1)
            area.close()
            c.save()
            c.clipRect(skia.Rect(gx0, gy0 - 200, gx0 + (gx1 - gx0) * k, gy1))
            shader = skia.GradientShader.MakeLinear([skia.Point(0, gy0), skia.Point(0, gy1)],
                                                    [col(pen.accent, 0.35), col(pen.accent, 0.0)])
            c.drawPath(area, skia.Paint(Shader=shader, AntiAlias=True))
            c.restore()
        pen.stroke(c, line, k, color=pen.accent, width=pen.width)
        for i, (px, py) in enumerate(xy):
            if (i / max(n - 1, 1)) <= k + 1e-6:
                pop = spring(max(0.0, t - 0.3 - i * 0.12), 16, 7)
                c.drawCircle(px, py, pen.width * 0.9 * pop, skia.Paint(Color=col(pen.accent), AntiAlias=True))
                if self.d["labels"] and i < len(self.d["labels"]):
                    draw_text(c, self.d["labels"][i], px, gy1 + 56, sk_font(self.fonts["body"], 42), pen.on_bg, alpha=0.7 * pop)
        if k >= 0.999:
            px, py = xy[-1]
            pulse = 0.5 + 0.5 * math.sin(t * 6)
            c.drawCircle(px, py, pen.width * (1.6 + pulse), skia.Paint(Color=col(pen.accent, 0.35 * (1 - pulse)), AntiAlias=True))
        if self.d.get("label"):
            a = clamp((t - 0.2) / 0.3)
            draw_text(c, self.d["label"], (x0 + x1) / 2, y0 + 30, fit_font(self.fonts["body"], self.d["label"], 48, x1 - x0),
                      pen.on_bg, alpha=a)
        if n:
            pre, val, suf, dec = parse_number(pts[-1]) or ("", pts[-1], "", 0)
            unit = self.d.get("unit") or ""
            vk = clamp((t - 0.3 - min(1.4, max(span * 0.6, 0.6))) / 0.3)
            if vk > 0:
                px, py = xy[-1]
                draw_text(c, f"{fmt_number(pts[-1], 0 if float(pts[-1]).is_integer() else 1)}{unit}", px, py - 40,
                          sk_font(self.fonts["title"], 56), pen.on_bg, align="right", alpha=vk)

    # passos, checklist, linha do tempo ------------------------------------------
    def _steps(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        rows = self.d["items"]
        n = len(rows)
        step_h = (y1 - y0) / n
        r = min(74, step_h * 0.3)
        lf = sk_font(self.fonts["body"], min(80, step_h * 0.34))
        has_icon = any(row.get("icon") for row in rows)
        bw = r * (4.0 if has_icon else 1.9) + max(text_w(lf, row["label"]) for row in rows)
        cx = max(x0 + 10, (C.W - bw) / 2) + r  # bloco centralizado na tela
        nf = sk_font(self.fonts["title"], r * 1.05)
        total = min(1.6, span * 0.7)
        for i, row in enumerate(rows):
            k = _stagger(t, i, n, total=total, each=0.5)
            if k <= 0:
                continue
            y = y0 + step_h * (i + 0.5)
            circle = skia.Path()
            circle.addCircle(cx, y, r)
            pen.stroke(c, circle, ease_io(k), width=pen.width * 0.7, tip=False)
            if k > 0.5:
                pop = spring(max(0.0, (k - 0.5) * 0.5), 18, 7)
                c.drawCircle(cx, y, r * 0.78 * pop, skia.Paint(Color=col(pen.accent), AntiAlias=True))
                draw_text(c, str(i + 1), cx, y + nf.getSize() * 0.36, nf, pen.accent_text, alpha=clamp((k - 0.5) * 3))
            if row.get("icon"):
                ic = find_icon(row["icon"])
                draw_icon(c, pen, ic, cx + r * 2.6, y, r * 1.5, clamp(k * 1.3), color=pen.on_bg)
                tx = cx + r * 4.0
            else:
                tx = cx + r * 1.9
            reveal_text(c, row["label"], tx, y + lf.getSize() * 0.35, lf, pen.on_bg, clamp((k - 0.25) * 1.6))
            if i < n - 1:  # seta até o próximo
                ka = clamp((t - 0.15 - (i + 0.6) * total / max(n, 1)) / 0.35)
                arrow = path_from([(cx, y + r + 8), (cx, y + step_h - r - 8)])
                pen.stroke(c, arrow, ease_io(ka), width=pen.width * 0.5, tip=False)
                if ka >= 1:
                    head = path_from([(cx - 12, y + step_h - r - 22), (cx, y + step_h - r - 8), (cx + 12, y + step_h - r - 22)])
                    pen.stroke(c, head, 1.0, width=pen.width * 0.5, tip=False)

    def _checklist(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        rows = self.d["items"]
        n = len(rows)
        step_h = (y1 - y0) / n
        box = min(100, step_h * 0.44)
        lf = sk_font(self.fonts["body"], min(82, step_h * 0.36))
        x0 = max(x0, (C.W - box - 32 - max(text_w(lf, row["label"]) for row in rows)) / 2)  # centralizado
        total = min(1.8, span * 0.75)
        for i, row in enumerate(rows):
            k = _stagger(t, i, n, total=total, each=0.55)
            if k <= 0:
                continue
            y = y0 + step_h * (i + 0.5)
            sq = skia.Path()
            sq.addRoundRect(skia.Rect(x0, y - box / 2, x0 + box, y + box / 2), 12, 12)
            pen.stroke(c, sq, ease_io(clamp(k * 1.8)), color=pen.on_bg, width=5, alpha=0.8, tip=False)
            check = path_from([(x0 + box * 0.2, y), (x0 + box * 0.43, y + box * 0.25), (x0 + box * 1.05, y - box * 0.55)])
            pen.stroke(c, check, ease_io(clamp((k - 0.45) * 2.2)), width=pen.width * 0.9)
            reveal_text(c, row["label"], x0 + box + 32, y + lf.getSize() * 0.35, lf, pen.on_bg, clamp((k - 0.2) * 1.5))

    def _timeline(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        rows = self.d["items"]
        n = len(rows)
        step_h = (y1 - y0) / n
        yf = sk_font(self.fonts["title"], min(100, step_h * 0.4))
        tf = sk_font(self.fonts["body"], min(64, step_h * 0.28))
        bw = 60 + max(max(text_w(yf, r["label"]), text_w(tf, r["text"])) for r in rows)
        lx = max(x0 + 30, (C.W - bw) / 2)
        total = min(1.8, span * 0.75)
        pen.stroke(c, path_from([(lx, y0), (lx, y1)]), ease_io(clamp(t / total)), color=pen.on_bg, width=5, alpha=0.5, tip=False)
        for i, row in enumerate(rows):
            k = _stagger(t, i, n, total=total, each=0.45)
            if k <= 0:
                continue
            y = y0 + step_h * (i + 0.5)
            pop = spring(k * 0.6, 16, 6)
            c.drawCircle(lx, y, 16 * pop, skia.Paint(Color=col(pen.accent), AntiAlias=True))
            ring = skia.Path()
            ring.addCircle(lx, y, 28)
            pen.stroke(c, ring, ease_io(k), width=4, tip=False)
            a = clamp(k * 2)
            draw_text(c, row["label"], lx + 60 + 30 * (1 - a), y - 6, yf, pen.accent, align="left", alpha=a)
            if row.get("text"):
                reveal_text(c, row["text"], lx + 60, y + tf.getSize() + 6, tf, pen.on_bg, clamp((k - 0.3) * 1.6))

    # versus e ícones -------------------------------------------------------------
    def _versus(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        half = (x1 - x0) / 2
        for side, sgn in (("left", -1), ("right", 1)):
            d = self.d[side]
            k = expo_out(clamp((t - (0.05 if sgn < 0 else 0.25)) / 0.5))
            sx = cx + sgn * half * 0.5 + sgn * (1 - k) * 300
            color = pen.on_bg if sgn < 0 else pen.accent
            if d.get("icon"):
                draw_icon(c, pen, find_icon(d["icon"]), sx, cy - 90, min(220, half * 0.6), clamp(k * 1.2), color=color)
            lf = fit_font(self.fonts["title"], d["label"], 78, half * 0.85)
            draw_text(c, d["label"], sx, cy + 110, lf, pen.on_bg, alpha=k)
            if d.get("value"):
                vf = fit_font(self.fonts["title"], d["value"], 110, half * 0.88)
                draw_text(c, d["value"], sx, cy + 220, vf, color, alpha=clamp((k - 0.3) * 2))
        # divisa e selo "VS"
        k = clamp((t - 0.35) / 0.4)
        pen.stroke(c, path_from([(cx, y0 + 20), (cx, y1 - 20)]), ease_io(clamp(t / 0.5)), color=pen.on_bg, width=4,
                   alpha=0.3, tip=False)
        if k > 0:
            pop = 1.0 + 0.4 * (1 - spring(k * 0.7, 14, 6))
            c.drawCircle(cx, cy, 64 * pop * min(1, k * 3), skia.Paint(Color=col(pen.accent), AntiAlias=True))
            draw_text(c, "VS", cx, cy + 20 * pop, sk_font(self.fonts["title"], 54 * pop), pen.accent_text, alpha=min(1, k * 3))

    def _icon(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - 30
        size = min(x1 - x0, y1 - y0) * 0.5
        ring = skia.Path()
        ring.addCircle(cx, cy, size * 0.78)
        k = clamp(t / 0.6)
        if k > 0:
            fill = spring(t, 10, 5)
            c.drawCircle(cx, cy, size * 0.78 * fill, skia.Paint(Color=col(pen.accent, 0.12), AntiAlias=True))
        pen.stroke(c, ring, ease_io(k), width=pen.width * 0.6, tip=False)
        draw_icon(c, pen, find_icon(self.d["icon"]), cx, cy, size, clamp((t - 0.15) / 1.0), color=pen.on_bg,
                  width=pen.width * 0.9)
        # faíscas quando termina de desenhar
        b = clamp((t - 1.1) / 0.4)
        if 0 < b < 1:
            for j in range(8):
                ang = j * math.pi / 4
                r0, r1 = size * (0.85 + 0.15 * b), size * (0.95 + 0.3 * b)
                pen.stroke(c, path_from([(cx + math.cos(ang) * r0, cy + math.sin(ang) * r0),
                                         (cx + math.cos(ang) * r1, cy + math.sin(ang) * r1)]), 1.0, width=pen.width * 0.5,
                           alpha=1 - b, tip=False)
        if self.d.get("label"):
            a = clamp((t - 0.6) / 0.3)
            draw_text(c, self.d["label"], cx, cy + size * 0.78 + 90, fit_font(self.fonts["body"], self.d["label"], 54, x1 - x0),
                      pen.on_bg, alpha=a)

    def _icons(self, c, pen, t, span):
        x0, y0, x1, y1 = region()
        rows = self.d["items"]
        n = len(rows)
        vertical = not C.landscape() and n > 2
        lf = sk_font(self.fonts["body"], 76)
        vsize = min(200, (y1 - y0) / n * 0.62)
        vx = max(x0 + vsize * 0.8, (C.W - vsize * 1.75 - 30 - max(text_w(lf, r["label"]) for r in rows)) / 2 + vsize * 0.8)
        for i, row in enumerate(rows):
            k = _stagger(t, i, n, total=min(1.4, span * 0.6), each=0.7)
            if k <= 0:
                continue
            if vertical:
                cx, cy, size = vx, y0 + (y1 - y0) * (i + 0.5) / n, vsize
            else:
                cx, cy, size = x0 + (x1 - x0) * (i + 0.5) / n, (y0 + y1) / 2 - 40, min(200, (x1 - x0) / n * 0.6)
            ring = skia.Path()
            ring.addCircle(cx, cy, size * 0.75)
            c.drawCircle(cx, cy, size * 0.75 * spring(k * 0.7, 12, 6), skia.Paint(Color=col(pen.accent, 0.14), AntiAlias=True))
            pen.stroke(c, ring, ease_io(k), width=pen.width * 0.5, tip=False)
            draw_icon(c, pen, find_icon(row.get("icon") or row.get("label")), cx, cy, size * 0.8, clamp(k * 1.2),
                      color=pen.on_bg)
            if row.get("label"):
                if vertical:
                    reveal_text(c, row["label"], cx + size + 30, cy + lf.getSize() * 0.35, lf, pen.on_bg, clamp((k - 0.3) * 1.6), align="left")
                else:
                    f = fit_font(self.fonts["body"], row["label"], 44, (x1 - x0) / n * 0.95)
                    draw_text(c, row["label"], cx, cy + size + 50, f, pen.on_bg, alpha=clamp((k - 0.3) * 2))


def reveal_text(c, s, x, y, font, color, k, align="left"):
    """Texto revelado da esquerda para a direita por uma máscara (com leve subida)."""
    if not s or k <= 0:
        return
    w = text_w(font, s)
    x0 = x if align == "left" else x - w / 2
    c.save()
    c.clipRect(skia.Rect(x0 - 4, y - font.getSize() * 1.2, x0 + (w + 8) * ease_io(k), y + font.getSize() * 0.5))
    draw_text(c, s, x0, y + 18 * (1 - ease_io(k)), font, color, align="left")
    c.restore()


def draw_odometer(c, target, start, k, x, y, font, color, prefix="", suffix="", dec=0, align="center", alpha=1.0):
    """Número com dígitos que rolam (tipo odômetro) do valor inicial até o alvo."""
    start = target if start is None else start
    e = expo_out(k)
    cur = start + (target - start) * e
    scale = 10 ** dec
    v = cur * scale
    final = fmt_number(target, dec)
    now = fmt_number(cur, dec)
    if sum(ch.isdigit() for ch in now) > sum(ch.isdigit() for ch in final):
        final = now  # descendo de 273 para 58: enquanto passa de 100 ainda mostra 3 dígitos
    digits = sum(ch.isdigit() for ch in final)
    size = font.getSize()
    # posição de cada caractere a partir do texto final (dígitos de largura igual na maioria das fontes)
    full = f"{prefix}{final}{suffix}"
    w = text_w(font, full)
    x0 = x - w / 2 if align == "center" else x if align == "left" else x - w
    paint = skia.Paint(Color=col(color, alpha), AntiAlias=True)
    c.save()
    c.clipRect(skia.Rect(x0 - 10, y - size * 0.95, x0 + w + 10, y + size * 0.25))
    cx = x0
    if prefix:
        c.drawString(prefix, cx, y, font, paint)
        cx += text_w(font, prefix)
    pos = digits - 1
    for ch in final:
        cw = text_w(font, ch)
        if ch.isdigit():
            place = 10 ** pos
            col_val = v / place
            d0 = int(math.floor(col_val)) % 10
            frac = col_val - math.floor(col_val)
            # só a coluna que está mudando rola; as de cima "viram" no fim
            if pos > 0:
                frac = clamp((frac - 0.85) / 0.15) if abs(target - cur) * scale > 1e-6 else 0
            off = frac * size * 1.05
            c.drawString(str(d0), cx, y - off, font, paint)
            if off > 0.5:
                c.drawString(str((d0 + 1) % 10), cx, y - off + size * 1.05, font, paint)
            pos -= 1
        else:
            c.drawString(ch, cx, y, font, paint)
        cx += cw
    if suffix:
        c.drawString(suffix, cx, y, font, paint)
    c.restore()


def _to_skimage(pil, max_w, max_h, cover=False, radius=0):
    """Imagem Skia. Recorte com transparência = cabe inteiro; foto com cover = preenche a faixa (cantos arredondados)."""
    from PIL import Image as PImage, ImageDraw as PDraw
    im = pil.convert("RGBA")
    transparent = pil.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 250
    if cover and not transparent:
        s = max(max_w / im.width, max_h / im.height)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), PImage.LANCZOS)
        x, y = (im.width - max_w) // 2, (im.height - max_h) // 2
        im = im.crop((x, y, x + max_w, y + max_h))
        if radius:
            m = PImage.new("L", im.size, 0)
            PDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=radius, fill=255)
            im.putalpha(m)
    else:
        s = min(max_w / im.width, max_h / im.height)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), PImage.LANCZOS)
    arr = np.ascontiguousarray(np.asarray(im))
    return skia.Image.fromarray(arr, colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


# ---------- fundo vivo ----------

def _poly(kind, cx, cy, r, n=72, rot=0.0):
    """Forma como n pontos (para o morph entre formas ter o mesmo número de pontos)."""
    pts = []
    corners = {"circle": 0, "square": 4, "triangle": 3, "diamond": 4, "hex": 6}[kind]
    off = math.pi / 4 if kind == "square" else -math.pi / 2
    for i in range(n):
        a = 2 * math.pi * i / n
        if corners:
            seg = 2 * math.pi / corners
            k = ((a - off) % seg) / seg
            a0 = off + math.floor((a - off) / seg) * seg
            p0 = (math.cos(a0), math.sin(a0))
            p1 = (math.cos(a0 + seg), math.sin(a0 + seg))
            x, y = p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k
        else:
            x, y = math.cos(a), math.sin(a)
        ca, sa = math.cos(rot), math.sin(rot)
        pts.append((cx + r * (x * ca - y * sa), cy + r * (x * sa + y * ca)))
    return pts


_SHAPES = ["circle", "square", "triangle", "hex", "diamond"]


class Decor:
    """Elementos de fundo em loop, por cima do fundo e por baixo da imagem/texto."""

    def __init__(self, spec, seed=3):
        g = spec.get("graphics") or GRAPHICS_DEFAULT
        self.kind = g.get("decor", "none")
        self.spec = spec
        rnd = np.random.default_rng(seed)
        self.rnd = rnd.uniform(0, 1, (12, 4))

    def active(self):
        return self.kind != "none"

    def draw(self, fr, t, local_t, n_frame=0):
        if self.kind == "none":
            return
        pen = Pen(self.spec, n_frame)
        W, H = C.W, C.H
        with Canvas(fr) as c:
            if self.kind == "grid":
                step = W / 9
                k = ease_io(clamp(local_t / 0.8))
                drift = (t * 14) % step
                for i in range(-1, int(W / step) + 2):
                    x = i * step + drift
                    pen.stroke(c, path_from([(x, 0), (x, H)]), k, color=pen.on_bg, width=2, alpha=0.08, tip=False)
                for j in range(-1, int(H / step) + 2):
                    y = j * step + drift * 0.6
                    pen.stroke(c, path_from([(0, y), (W, y)]), k, color=pen.on_bg, width=2, alpha=0.08, tip=False)
            elif self.kind == "lines":
                for i in range(5):
                    r = self.rnd[i]
                    y = H * (0.1 + 0.8 * r[0]) + math.sin(t * 0.6 + r[1] * 6) * 40
                    x = ((t * (60 + 80 * r[2]) + r[3] * W * 2) % (W * 2.2)) - W * 0.6
                    pen.stroke(c, path_from([(x, y), (x + W * 0.45, y - W * 0.12)]), 1.0, color=pen.accent,
                               width=3 + 4 * r[1], alpha=0.22, tip=False)
            elif self.kind == "dots":
                step = W / 12
                p = skia.Paint(Color=col(pen.on_bg, 0.12), AntiAlias=True)
                for i in range(13):
                    for j in range(int(H / step) + 1):
                        s = 2.5 + 3.5 * (0.5 + 0.5 * math.sin(t * 2.2 - (i * 0.5 + j * 0.35)))
                        c.drawCircle(i * step, j * step + step / 2, s, p)
            elif self.kind == "shapes":
                for i in range(4):
                    r = self.rnd[i]
                    cx = W * (0.12 + 0.76 * r[0]) + math.sin(t * 0.5 + r[1] * 6) * 50
                    cy = H * (0.1 + 0.8 * r[1]) + math.cos(t * 0.4 + r[2] * 6) * 70
                    rad = W * (0.05 + 0.06 * r[2])
                    # morph: a forma vira a próxima a cada ~2,5s
                    ph = t / 2.5 + r[3] * 5
                    a, b = _SHAPES[int(ph) % 5], _SHAPES[(int(ph) + 1) % 5]
                    m = ease_io(clamp((ph % 1 - 0.6) / 0.4))
                    rot = t * (0.3 + 0.4 * r[0]) * (1 if i % 2 else -1)
                    pa, pb = _poly(a, cx, cy, rad, rot=rot), _poly(b, cx, cy, rad, rot=rot)
                    pts = [(x0 + (x1 - x0) * m, y0 + (y1 - y0) * m) for (x0, y0), (x1, y1) in zip(pa, pb)]
                    pen.stroke(c, path_from(pts, True), ease_io(clamp(local_t / 0.7)), color=pen.accent,
                               width=5, alpha=0.35, tip=False)
            elif self.kind == "rings":
                for i in range(4):
                    ph = (t * 0.35 + i / 4) % 1
                    ring = skia.Path()
                    ring.addCircle(W / 2, H * 0.45, W * 0.15 + ph * W * 0.7)
                    c.drawPath(ring, stroke_paint(pen.accent, 4, 0.3 * (1 - ph)))


# ---------- tipografia cinética (título) ----------

def _lines(text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if text_w(font, trial) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def title_layout(text, font_path, size, max_w):
    while True:
        f = sk_font(font_path, size)
        lines = _lines(text, f, max_w)
        if len(lines) <= 4 or size <= 40:
            return f, lines
        size *= 0.9


def draw_title(fr, text, cfg_anim, style, local_t, span, cx, cy, max_w, exit_k=0.0, box_color=None, n_frame=0):
    """Título com animação Skia. style: dict(path, size, color, stroke, stroke_w, accent)."""
    f, lines = title_layout(text, style["path"], style["size"], max_w)
    size = f.getSize()
    lh = size * 1.18
    top = cy - lh * len(lines) / 2
    W = C.W
    with Canvas(fr, (top - lh, top + lh * (len(lines) + 1))) as c:
        if c is None:
            return
        if exit_k > 0:
            c.saveLayerAlpha(None, int(255 * (1 - exit_k)))
            c.translate(0, -40 * exit_k)
        if box_color is not None:
            wmax = max(text_w(f, ln) for ln in lines)
            a = clamp(local_t / 0.2)
            c.drawRRect(skia.RRect.MakeRectXY(skia.Rect(cx - wmax / 2 - 30, top - 18, cx + wmax / 2 + 30,
                                                        top + lh * len(lines) + 10), 14, 14),
                        skia.Paint(Color=col(box_color, 0.9 * a), AntiAlias=True))
        fill = skia.Paint(Color=col(style["color"]), AntiAlias=True)
        stroke = None
        if style.get("stroke"):
            stroke = skia.Paint(Color=col(style["stroke"]), AntiAlias=True, Style=skia.Paint.kStroke_Style,
                                StrokeWidth=float(style["stroke_w"]) * 2, StrokeJoin=skia.Paint.kRound_Join)
        glyph_i = 0
        n_glyphs = sum(len(ln.replace(" ", "")) for ln in lines)
        for li, ln in enumerate(lines):
            y = top + lh * (li + 0.82)
            x = cx - text_w(f, ln) / 2
            if cfg_anim == "mask_up":
                k = expo_out(clamp((local_t - li * 0.1) / 0.5))
                c.save()
                c.clipRect(skia.Rect(0, y - size * 1.0, W, y + size * 0.3))
                yy = y + (1 - k) * lh
                if stroke:
                    c.drawString(ln, x, yy, f, stroke)
                c.drawString(ln, x, yy, f, fill)
                c.restore()
                continue
            if cfg_anim == "write_on":
                # contorno das letras sendo traçado, depois o preenchimento entra
                tp = skia.Path()
                gx = x
                for ch in ln:
                    if ch != " ":
                        gp = f.getPath(f.textToGlyphs(ch)[0])
                        if gp is not None:
                            gp.offset(gx, y)
                            tp.addPath(gp)
                    gx += text_w(f, ch)
                dur = 0.35 + 0.05 * len(ln)
                k = clamp((local_t - li * 0.25) / dur)
                if k > 0:
                    c.drawPath(tp, stroke_paint(style["accent"], max(2.5, size / 34), 1.0, ease_io(k), cap=True))
                fk = clamp((local_t - li * 0.25 - dur * 0.75) / 0.3)
                if fk > 0:
                    if stroke:
                        c.drawString(ln, x, y, f, skia.Paint(Color=col(style["stroke"], fk), AntiAlias=True,
                                                             Style=skia.Paint.kStroke_Style,
                                                             StrokeWidth=float(style["stroke_w"]) * 2))
                    c.drawString(ln, x, y, f, skia.Paint(Color=col(style["color"], fk), AntiAlias=True))
                continue
            # letters: letra a letra com mola, giro e escala
            gx = x
            for ch in ln:
                cw = text_w(f, ch)
                if ch != " ":
                    d = local_t - glyph_i * min(0.035, 0.6 / max(n_glyphs, 1))
                    glyph_i += 1
                    if d > 0:
                        s = spring(d, 15, 6)
                        rot = (1 - s) * (-35 if glyph_i % 2 else 25)
                        c.save()
                        c.translate(gx + cw / 2, y - size * 0.35 + (1 - s) * 60)
                        c.rotate(rot)
                        c.scale(max(0.01, s), max(0.01, s))
                        if stroke:
                            c.drawString(ch, -cw / 2, size * 0.35, f, stroke)
                        c.drawString(ch, -cw / 2, size * 0.35, f, skia.Paint(Color=col(style["color"], clamp(d * 6)),
                                                                              AntiAlias=True))
                        c.restore()
                gx += cw
        if exit_k > 0:
            c.restore()


# ---------- transições de forma ----------

def shape_transition(prev, cur, k, kind, accent_hex):
    """Mistura prev -> cur (k 0..1) com uma forma na cor de destaque."""
    W, H = C.W, C.H
    accent = np.array(_hex(accent_hex), np.uint8)
    k = clamp(k)
    if kind == "circle_reveal":
        yy, xx = np.ogrid[:H, :W]
        r = math.hypot(W, H) * 0.55 * ease_io(k)
        d = np.sqrt((xx - W / 2) ** 2 + (yy - H / 2) ** 2)
        inside = d < r
        out = prev.copy()
        out[inside] = cur[inside]
        ring = (d >= r) & (d < r + 18) if 0 < k < 1 else None
        if ring is not None:
            out[ring] = accent
        return out
    if kind == "stripes":  # faixas descem cobrindo e sobem revelando
        n = 6
        out = (prev if k < 0.5 else cur).copy()
        sw = int(math.ceil(W / n))
        for i in range(n):
            if k < 0.5:
                kk = ease_io(clamp(k * 2 * 1.4 - i * 0.07))
                h = int(H * kk)
                out[:h, i * sw:(i + 1) * sw] = accent
            else:
                kk = ease_io(clamp((k - 0.5) * 2 * 1.4 - i * 0.07))
                h0 = int(H * kk)
                out[h0:, i * sw:(i + 1) * sw] = accent
        return out
    if kind == "diagonal":
        yy, xx = np.ogrid[:H, :W]
        diag = (xx / W + yy / H) / 2  # 0 no canto de cima à esquerda, 1 embaixo à direita
        edge = -0.15 + 1.3 * ease_io(k)
        out = prev.copy()
        m = diag < edge
        out[m] = cur[m]
        band = (diag >= edge) & (diag < edge + 0.06)
        out[band] = accent
        return out
    if kind == "blocks":
        n_x = 6
        bs = int(math.ceil(W / n_x))
        n_y = int(math.ceil(H / bs))
        out = (prev if k < 0.5 else cur).copy()
        for i in range(n_x):
            for j in range(n_y):
                delay = ((i + j) % 5) * 0.06
                kk = clamp(((k if k < 0.5 else 1 - k) * 2 * 1.3) - delay)
                s = int(bs * ease_io(kk))
                if s > 0:
                    x0 = i * bs + (bs - s) // 2
                    y0 = j * bs + (bs - s) // 2
                    out[y0:y0 + s, x0:x0 + s] = accent
        return out
    return cur

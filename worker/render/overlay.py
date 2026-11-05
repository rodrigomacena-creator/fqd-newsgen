"""Motion por cima da foto (scene["overlay"]), só no motor genérico.

Cena com imagem deixava de ter movimento além do zoom: a foto e o texto. Aqui a cena ganha um elemento
desenhado AO VIVO por cima da imagem, no meio da tela (entre o título e a legenda):

- callout: ponto pulsando num lugar da foto e uma linha que sai dele até uma etiqueta (anotação)
- stat: painel com um número contando e um rótulo (dado que acompanha a fala)
- tags: 1 a 3 etiquetas com ícone entrando uma a uma (palavras-chave da cena)
- progress: barra enchendo até a porcentagem, com o número contando
- focus: cantos de mira se fechando em volta do assunto, linha de varredura e uma etiqueta

normalize() é a fonte da verdade do formato (espelho em src/lib/videogen/graphics.ts, OVERLAY_TYPES).
Tudo lê W/H de render.common na hora de desenhar (prévia rápida e 16:9 trocam esses valores).
"""
import math

import skia

from . import common as C
from . import mograph as mg
from .motion import clamp, ease_io, expo_out, spring

OVERLAY_TYPES = ("callout", "stat", "tags", "progress", "focus")


def _s(v, n):
    return mg._s(v, n)


def _xy(v, d):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return d
    return min(max(x, 0.15), 0.85)


def normalize(o):
    """Overlay limpo, ou None (a cena fica só com a foto, como antes)."""
    if not isinstance(o, dict) or o.get("type") not in OVERLAY_TYPES:
        return None
    t = o["type"]
    if t == "callout":
        label = _s(o.get("label"), 28)
        return {"type": t, "label": label, "text": _s(o.get("text"), 36),
                "x": _xy(o.get("x"), 0.5), "y": _xy(o.get("y"), 0.45)} if label else None
    if t in ("stat", "progress"):
        if mg.parse_number(o.get("value")) is None:
            return None
        return {"type": t, "value": _s(o.get("value"), 16), "label": _s(o.get("label"), 40)}
    if t == "tags":
        items = o.get("items") if isinstance(o.get("items"), list) else []
        rows = []
        for i in items[:3]:
            i = i if isinstance(i, dict) else {"label": i}
            if _s(i.get("label"), 24):
                rows.append({"label": _s(i.get("label"), 24), "icon": _s(i.get("icon"), 30)})
        return {"type": t, "items": rows} if rows else None
    if t == "focus":
        return {"type": t, "label": _s(o.get("label"), 28)}
    return None


class Overlay:
    def __init__(self, data, spec, fonts):
        self.d = data
        self.spec = spec
        self.fonts = fonts
        pal = spec["palette"]
        self.accent = mg._hex(pal["accent"])
        self.accent_text = mg._hex(pal["accentText"])
        self.panel = mg._hex(pal["background"])
        self.ink = mg._hex(pal["text"])

    def zone(self):
        """Faixa livre entre o título (topo) e a legenda (base)."""
        H = C.H
        if C.landscape():
            return H * 0.2, H * 0.72
        return H * 0.26, H * 0.72

    def draw(self, fr, t, span, n_frame=0):
        out = clamp((t - (span - 0.25)) / 0.25) if span > 1.0 else 0.0
        with mg.Canvas(fr) as c:
            if c is None:
                return
            if out > 0:
                c.saveLayerAlpha(None, int(255 * (1 - out)))
            try:
                getattr(self, "_" + self.d["type"])(c, mg.Pen(self.spec, n_frame), t, span)
            except Exception as e:  # um quadro com problema não derruba o vídeo inteiro
                if not getattr(self, "_err", False):
                    print(f"overlay {self.d['type']}: {e}", flush=True)
                    self._err = True
            if out > 0:
                c.restore()

    # ---------- peças ----------

    def _pill(self, c, x, y, w, h, k, fill=None, alpha=0.9):
        """Cápsula que cresce a partir da esquerda (k 0-1)."""
        if k <= 0:
            return
        x1 = x + w * ease_io(k)
        r = skia.RRect.MakeRectXY(skia.Rect(x, y, x1, y + h), h / 2, h / 2)
        sh = skia.Paint(Color=skia.Color(0, 0, 0, int(70 * k)), AntiAlias=True,
                        MaskFilter=skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 14))
        c.drawRRect(skia.RRect.MakeRectXY(skia.Rect(x, y + 8, x1, y + h + 8), h / 2, h / 2), sh)
        c.drawRRect(r, skia.Paint(Color=mg.col(fill or self.panel, alpha * k), AntiAlias=True))

    def _start(self, span):
        return 0.25 if span > 1.6 else 0.1

    # ---------- tipos ----------

    def _callout(self, c, pen, t, span):
        W, H = C.W, C.H
        y0, y1 = self.zone()
        px, py = W * self.d["x"], y0 + (y1 - y0) * self.d["y"]
        t0 = self._start(span)
        # ponto + anel pulsando
        k = spring(max(t - t0, 0), 12, 6)
        c.drawCircle(px, py, 16 * k, skia.Paint(Color=mg.col(self.accent), AntiAlias=True))
        ring = ((t - t0) % 1.2) / 1.2 if t > t0 else 0
        c.drawCircle(px, py, 16 + 60 * ring, mg.stroke_paint(self.accent, 5, (1 - ring) * k))
        # linha em L até a etiqueta (vai para o lado com mais espaço)
        side = -1 if px > W * 0.5 else 1
        ex, ey = px + side * W * 0.16, py - H * 0.07
        lx = ex + side * W * 0.06
        line = mg.path_from([(px, py), (ex, ey), (lx, ey)])
        lk = ease_io(clamp((t - t0 - 0.2) / 0.45))
        pen.stroke(c, line, lk, color=self.accent, width=6, tip=lk < 1)
        # etiqueta
        f = mg.fit_font(self.fonts["title"], self.d["label"], 64, W * 0.56)
        sf = mg.fit_font(self.fonts["body"], self.d["text"] or "x", 40, W * 0.56)
        tw = max(mg.text_w(f, self.d["label"]), mg.text_w(sf, self.d["text"]) if self.d["text"] else 0)
        bh = 108 + (56 if self.d["text"] else 0)
        bw = tw + 64
        bx = lx if side > 0 else lx - bw
        bx = min(max(bx, W * 0.04), W * 0.96 - bw)
        by = ey - 54
        pk = clamp((t - t0 - 0.55) / 0.35)
        self._pill(c, bx, by, bw, bh, pk, alpha=0.92) if not self.d["text"] else self._box(c, bx, by, bw, bh, pk)
        a = clamp((t - t0 - 0.75) / 0.25)
        mg.draw_text(c, self.d["label"], bx + 32, by + 76, f, self.ink, align="left", alpha=a)
        if self.d["text"]:
            mg.draw_text(c, self.d["text"], bx + 32, by + 136, sf, self.ink, align="left", alpha=a * 0.85)

    def _box(self, c, x, y, w, h, k):
        if k <= 0:
            return
        r = skia.RRect.MakeRectXY(skia.Rect(x, y, x + w * ease_io(k), y + h), 26, 26)
        c.drawRRect(r, skia.Paint(Color=mg.col(self.panel, 0.92 * k), AntiAlias=True))
        c.drawRRect(r, mg.stroke_paint(self.accent, 4, k))

    def _stat(self, c, pen, t, span):
        W, H = C.W, C.H
        y0, y1 = self.zone()
        t0 = self._start(span)
        pre, val, suf, dec = mg.parse_number(self.d["value"])
        k = expo_out(clamp((t - t0 - 0.15) / min(1.3, max(span * 0.55, 0.5))))
        s = f"{pre}{mg.fmt_number(val * k, dec)}{suf}"
        final = f"{pre}{mg.fmt_number(val, dec)}{suf}"
        bw = W * (0.5 if C.landscape() else 0.78)
        nf = mg.fit_font(self.fonts["title"], final, 150, bw - 80)
        lf = mg.fit_font(self.fonts["body"], self.d["label"], 44, bw - 80) if self.d["label"] else None
        bh = nf.getSize() * 1.05 + (lf.getSize() * 1.6 if lf else 0) + 70
        bx = W * 0.06
        by = y1 - bh
        pk = clamp((t - t0) / 0.35)
        if pk <= 0:
            return
        r = skia.RRect.MakeRectXY(skia.Rect(bx, by + (1 - ease_io(pk)) * 60, bx + bw, by + bh + (1 - ease_io(pk)) * 60), 34, 34)
        c.drawRRect(r, skia.Paint(Color=mg.col(self.panel, 0.9 * pk), AntiAlias=True))
        # borda desenhada à mão em volta do painel
        edge = skia.Path()
        edge.addRRect(r)
        pen.stroke(c, edge, ease_io(clamp((t - t0 - 0.1) / 0.7)), color=self.accent, width=6, tip=True)
        # barra de destaque na esquerda
        c.drawRect(skia.Rect(bx + 34, by + 40, bx + 44, by + bh - 40), skia.Paint(Color=mg.col(self.accent, pk), AntiAlias=True))
        mg.draw_text(c, s, bx + 72, by + 30 + nf.getSize() * 0.92, nf, self.ink, align="left", alpha=pk)
        if lf:
            a = clamp((t - t0 - 0.45) / 0.3)
            mg.draw_text(c, self.d["label"], bx + 74, by + bh - 42, lf, self.ink, align="left", alpha=a * 0.9)

    def _tags(self, c, pen, t, span):
        W, H = C.W, C.H
        y0, y1 = self.zone()
        t0 = self._start(span)
        items = self.d["items"]
        f = mg.sk_font(self.fonts["title"], 50)
        h, gap = 104, 28
        y = y1 - len(items) * (h + gap)
        for i, it in enumerate(items):
            k = clamp((t - t0 - i * 0.35) / 0.4)
            if k <= 0:
                continue
            label = it["label"]
            lf = mg.fit_font(self.fonts["title"], label, 50, W * 0.6)
            w = mg.text_w(lf, label) + 64 + (90 if it["icon"] else 0)
            x = W * 0.06 - (1 - spring(k * 0.7, 10, 5)) * 120
            fill = self.accent if i == 0 else self.panel
            ink = self.accent_text if i == 0 else self.ink
            self._pill(c, x, y, w, h, k, fill=fill, alpha=0.94)
            tx = x + 34
            if it["icon"]:
                ic = mg.find_icon(it["icon"])
                mg.draw_icon(c, pen, ic, x + 34 + 26, y + h / 2, 52, clamp((t - t0 - i * 0.35 - 0.2) / 0.5),
                             color=ink, width=5)
                tx += 90
            mg.draw_text(c, label, tx, y + h / 2 + lf.getSize() * 0.35, lf, ink, align="left",
                         alpha=clamp((t - t0 - i * 0.35 - 0.15) / 0.25))
            y += h + gap
        del f

    def _progress(self, c, pen, t, span):
        W, H = C.W, C.H
        y0, y1 = self.zone()
        t0 = self._start(span)
        pre, val, suf, dec = mg.parse_number(self.d["value"])
        frac = clamp(val / 100.0) if "%" in self.d["value"] or val <= 100 else 1.0
        bw = W * (0.5 if C.landscape() else 0.84)
        bx, by, bh = (W - bw) / 2, y1 - 210, 62
        pk = clamp((t - t0) / 0.35)
        if pk <= 0:
            return
        panel = skia.RRect.MakeRectXY(skia.Rect(bx - 36, by - 120, bx + bw + 36, by + bh + 50), 34, 34)
        c.drawRRect(panel, skia.Paint(Color=mg.col(self.panel, 0.88 * pk), AntiAlias=True))
        track = skia.RRect.MakeRectXY(skia.Rect(bx, by, bx + bw, by + bh), bh / 2, bh / 2)
        c.drawRRect(track, skia.Paint(Color=mg.col(self.ink, 0.15 * pk), AntiAlias=True))
        k = expo_out(clamp((t - t0 - 0.2) / min(1.4, max(span * 0.6, 0.5))))
        fw = max(bh, bw * frac * k)
        c.drawRRect(skia.RRect.MakeRectXY(skia.Rect(bx, by, bx + fw, by + bh), bh / 2, bh / 2),
                    skia.Paint(Color=mg.col(self.accent, pk), AntiAlias=True))
        # brilho correndo na barra
        sx = bx + (fw - 40) * ((t * 0.8) % 1.0)
        c.drawRect(skia.Rect(sx, by + 6, sx + 30, by + bh - 6), skia.Paint(Color=skia.Color(255, 255, 255, int(60 * pk)), AntiAlias=True))
        nf = mg.sk_font(self.fonts["title"], 76)
        s = f"{pre}{mg.fmt_number(val * k, dec)}{suf}"
        mg.draw_text(c, s, bx + bw, by - 30, nf, self.ink, align="right", alpha=pk)
        if self.d["label"]:
            lf = mg.fit_font(self.fonts["body"], self.d["label"], 42, bw * 0.6)
            mg.draw_text(c, self.d["label"], bx, by - 34, lf, self.ink, align="left", alpha=pk * 0.9)

    def _focus(self, c, pen, t, span):
        W, H = C.W, C.H
        y0, y1 = self.zone()
        t0 = self._start(span)
        k = expo_out(clamp((t - t0) / 0.7))
        cx, cy = W / 2, (y0 + y1) / 2
        hw = W * (0.42 - 0.12 * k) if not C.landscape() else W * (0.3 - 0.08 * k)
        hh = (y1 - y0) * (0.62 - 0.14 * k)
        arm = min(hw, hh) * 0.32
        corners = [((cx - hw, cy - hh + arm), (cx - hw, cy - hh), (cx - hw + arm, cy - hh)),
                   ((cx + hw - arm, cy - hh), (cx + hw, cy - hh), (cx + hw, cy - hh + arm)),
                   ((cx + hw, cy + hh - arm), (cx + hw, cy + hh), (cx + hw - arm, cy + hh)),
                   ((cx - hw + arm, cy + hh), (cx - hw, cy + hh), (cx - hw, cy + hh - arm))]
        for i, pts in enumerate(corners):
            pk = ease_io(clamp((t - t0 - i * 0.06) / 0.4))
            pen.stroke(c, mg.path_from(list(pts)), pk, color=self.accent, width=9, tip=False)
        # linha de varredura subindo e descendo dentro da mira
        if t > t0 + 0.4:
            u = (math.sin((t - t0) * 2.2) + 1) / 2
            sy = cy - hh + 2 * hh * u
            c.drawRect(skia.Rect(cx - hw + 20, sy - 2, cx + hw - 20, sy + 2),
                       skia.Paint(Color=mg.col(self.accent, 0.7), AntiAlias=True))
        # mira no centro
        ck = clamp((t - t0 - 0.3) / 0.3)
        if ck > 0:
            p = skia.Paint(Color=mg.col(self.accent, 0.9 * ck), AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=4)
            c.drawCircle(cx, cy, 26, p)
            c.drawLine(cx - 44, cy, cx - 14, cy, p)
            c.drawLine(cx + 14, cy, cx + 44, cy, p)
            c.drawLine(cx, cy - 44, cx, cy - 14, p)
            c.drawLine(cx, cy + 14, cx, cy + 44, p)
        if self.d["label"]:
            f = mg.fit_font(self.fonts["title"], self.d["label"].upper(), 44, hw * 1.6)
            tw = mg.text_w(f, self.d["label"].upper())
            bx, by = cx - hw, cy - hh - 96
            lk = clamp((t - t0 - 0.5) / 0.3)
            self._pill(c, bx, by, tw + 92, 76, lk, fill=self.accent, alpha=0.95)
            blink = 1.0 if int(t * 2) % 2 == 0 else 0.35
            c.drawCircle(bx + 34, by + 38, 10, skia.Paint(Color=mg.col(self.accent_text, lk * blink), AntiAlias=True))
            mg.draw_text(c, self.d["label"].upper(), bx + 58, by + 38 + f.getSize() * 0.35, f, self.accent_text,
                         align="left", alpha=lk)

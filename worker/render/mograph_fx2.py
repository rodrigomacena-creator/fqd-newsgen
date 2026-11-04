"""Segunda leva de cenas de motion de tela cheia (mesmo contrato de render/mograph_fx.py).

Tipografia: glitch_text, stretch_text, wave_text, echo_text, scramble_text, marquee, highlight_text, quote, countdown.
Formas: kaleidoscope, tunnel, dot_wave, blob, spiro, fireworks, cube, helix.
Dados: activity_rings, pie, calendar_grid, candles, gauge, bubbles, venn, funnel, rating, battery, thermometer.
Interface: cursor_click, like_button, price_tag.

Cada tipo pinta a tela inteira. FXPlus herda de mograph_fx.FX (os 18 tipos da primeira leva continuam iguais).
Tudo lê W/H de render.common na hora de desenhar.
"""
import math
import random

import skia

from . import common as C
from . import mograph_fx as F
from .mograph_fx import (_s, bg, col, fill, fit, font, glow, hues, icon_draw, lum, mix, path_q, portrait, radial_bg,
                         rrect, shadow, stroke, text, text_path, trim)
from .motion import clamp, ease_io, expo_out, spring

FX2_TYPES = ("glitch_text", "stretch_text", "wave_text", "echo_text", "scramble_text", "marquee", "highlight_text",
             "quote", "countdown", "kaleidoscope", "tunnel", "dot_wave", "blob", "spiro", "fireworks", "cube", "helix",
             "activity_rings", "pie", "calendar_grid", "candles", "gauge", "bubbles", "venn", "funnel", "rating",
             "battery", "thermometer", "cursor_click", "like_button", "price_tag")
ALL_FX = F.FX_TYPES + FX2_TYPES


def _num(v):
    from .mograph import parse_number
    return parse_number(v)


def normalize(g):
    """Formato limpo de qualquer tipo de tela cheia (primeira ou segunda leva). None se não serve."""
    t = g.get("type")
    if t in F.FX_TYPES:
        return F.normalize(g)
    if t not in FX2_TYPES:
        return None
    raw = g.get("items") if isinstance(g.get("items"), list) else []

    def item(i):
        i = i if isinstance(i, dict) else {"label": i}
        return {k: _s(i.get(k), 40) for k in ("label", "value", "icon", "text") if i.get(k) not in (None, "")}

    items = [item(i) for i in raw][:6]
    text_ = _s(g.get("text") or g.get("label"), 40)
    label = _s(g.get("label"), 40)
    sub = _s(g.get("sub"), 50)
    value = _s(g.get("value"), 20)
    if t in ("glitch_text", "stretch_text", "wave_text", "echo_text", "scramble_text", "kaleidoscope", "tunnel",
             "dot_wave", "blob", "spiro", "fireworks", "helix"):
        return {"type": t, "text": _s(g.get("text") or g.get("label"), 24) or "MOTION", "sub": sub}
    if t == "marquee":
        words = [i.get("label") for i in items if i.get("label")] or ([text_] if text_ else [])
        return {"type": t, "items": [w[:24] for w in words]} if words else None
    if t == "highlight_text":
        s = _s(g.get("text"), 70)
        return {"type": t, "text": s, "value": value or (s.split()[-1] if s else "")} if s else None
    if t == "quote":
        s = _s(g.get("text"), 120)
        return {"type": t, "text": s, "label": label} if s else None
    if t == "countdown":
        try:
            n = int(float(str(g.get("value") or "3").replace(",", ".")))
        except ValueError:
            n = 3
        return {"type": t, "value": str(min(max(n, 1), 10)), "text": _s(g.get("text"), 24) or "JÁ!"}
    if t == "cube":
        words = [i.get("label") for i in items if i.get("label")][:4]
        return {"type": t, "items": [w[:16] for w in words]} if len(words) >= 2 else None
    if t in ("activity_rings", "pie", "bubbles", "funnel"):
        rows = [r for r in items if r.get("label")][: 3 if t == "activity_rings" else 6]
        if t != "activity_rings" and len(rows) < 2:
            return None
        return {"type": t, "items": rows, "label": label} if rows else None
    if t == "venn":
        rows = [r for r in items if r.get("label")][:3]
        return {"type": t, "items": rows, "text": _s(g.get("text"), 20)} if len(rows) >= 2 else None
    if t in ("calendar_grid", "candles", "gauge", "battery", "thermometer", "like_button"):
        return {"type": t, "value": value, "label": label}
    if t == "rating":
        return {"type": t, "value": value or "5", "label": label, "text": _s(g.get("text"), 80)}
    if t == "cursor_click":
        return {"type": t, "text": _s(g.get("text"), 24) or "Clique aqui", "label": label}
    if t == "price_tag":
        a, b = _s(g.get("from"), 16), _s(g.get("to") or g.get("value"), 16)
        return {"type": t, "from": a, "to": b, "label": label} if b else None
    return None


GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=?"


class FXPlus(F.FX):
    """Todos os tipos de tela cheia (herda os 18 da primeira leva)."""

    def _sub(self, c, y, t0, t, box=False):
        if self.d.get("sub"):
            f = fit(self.fonts["body"], self.d["sub"], 62, C.W * 0.86)
            k = clamp((t - t0) / 0.4)
            if box and k > 0:
                w = f.measureText(self.d["sub"]) + 70
                rrect(c, C.W / 2 - w / 2, y - f.getSize() - 4 + 24 * (1 - k), C.W / 2 + w / 2, y + f.getSize() * 0.45 + 24 * (1 - k),
                      40, fill(self.bg, 0.85 * k))
            text(c, self.d["sub"], C.W / 2, y + 24 * (1 - k), f, self.text, 0.85 * k)

    def _word(self, size_p=330, size_l=260, frac=0.9):
        word = self.d["text"].upper()
        return word, fit(self.fonts["title"], word, size_p if portrait() else size_l, C.W * frac)

    # ---------------- tipografia ----------------
    def _glitch_text(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, mix(self.bg, (0, 0, 0), 0.3))
        word, f = self._word()
        cy = H * 0.48
        base = cy + f.getSize() * 0.35
        # rajadas de glitch: forte na entrada e em pulsos curtos depois
        burst = max(1 - clamp(t / 0.9), 1.0 if (t % 0.9) < 0.1 else 0.0, 0.25)
        rng = random.Random(int(t * 24))
        # linhas de varredura
        for y in range(0, int(H), 6):
            c.drawRect(skia.Rect(0, y, W, y + 2), fill((255, 255, 255), 0.025))
        off = 26 * burst
        for dx, colr in ((-off, (255, 40, 90)), (off, (40, 230, 255))):
            c.save()
            c.translate(dx + rng.uniform(-6, 6) * burst, 0)
            text(c, word, W / 2, base, f, colr, 0.85)
            c.restore()
        if burst > 0.05:  # fatias deslocadas
            for i in range(9):
                y0 = cy - f.getSize() * 0.8 + rng.uniform(0, f.getSize() * 1.2)
                h = rng.uniform(10, 50)
                c.save()
                c.clipRect(skia.Rect(0, y0, W, y0 + h))
                c.translate(rng.uniform(-90, 90) * burst, 0)
                text(c, word, W / 2, base, f, self.text)
                c.restore()
            c.save()
            c.clipRect(skia.Rect(0, 0, W, H))
            text(c, word, W / 2, base, f, self.text, 1 - burst * 0.5)
            c.restore()
        else:
            text(c, word, W / 2, base, f, self.text)
        # blocos de ruído
        for i in range(int(14 * burst)):
            x, y = rng.uniform(0, W), rng.uniform(H * 0.3, H * 0.7)
            c.drawRect(skia.Rect(x, y, x + rng.uniform(40, 260), y + rng.uniform(6, 22)), fill(rng.choice([self.accent, self.text]), 0.7))
        self._sub(c, base + 140, 0.9, t)

    def _stretch_text(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.3), self.bg)
        word, f = self._word(300, 240, 0.86)
        total = f.measureText(word)
        x = W / 2 - total / 2
        base = H * 0.55
        cols = hues(self.accent, len(word), 0.3)
        for i, ch in enumerate(word):
            lt = t - 0.1 - i * 0.07
            # cai, achata no chão e estica de volta (squash & stretch), depois respira
            drop = 1 - expo_out(clamp(lt / 0.35))
            hit = clamp((lt - 0.3) / 0.6)
            sy = 1 + (0.6 * math.sin(hit * math.pi * 3) * (1 - hit) if hit > 0 else 0.5 * drop)
            sy += 0.12 * math.sin(t * 3 + i * 0.8) * clamp((lt - 1) / 0.5)
            sx = 1 / max(sy, 0.4) ** 0.5
            cw = f.measureText(ch)
            c.save()
            c.translate(x + cw / 2, base - drop * H * 0.6)
            c.scale(sx, sy)
            c.drawString(ch, -cw / 2, 0, f, fill(cols[i] if i % 2 else self.text))
            c.restore()
            x += cw
        c.drawRect(skia.Rect(W * 0.08, base + 16, W * 0.92, base + 22), fill(self.text, 0.25 * clamp(t / 0.4)))
        self._sub(c, base + 150, 1.2, t)

    def _wave_text(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        word, f = self._word(260, 220, 0.88)
        total = f.measureText(word)
        cy = H * 0.48
        # ondas de fundo
        for j in range(7):
            p = skia.Path()
            yb = H * (0.15 + j * 0.12)
            for x in range(-20, int(W) + 30, 20):
                y = yb + 30 * math.sin(x * 0.008 + t * (1.4 + j * 0.2) + j)
                (p.lineTo if x > -20 else p.moveTo)(x, y)
            c.drawPath(p, stroke(hues(self.accent, 7, 0.25)[j], 5, 0.18))
        x = W / 2 - total / 2
        for i, ch in enumerate(word):
            cw = f.measureText(ch)
            k = expo_out(clamp((t - 0.1 - i * 0.06) / 0.6))
            y = cy + f.getSize() * 0.35 + 70 * math.sin(t * 4 - i * 0.6) * k + (1 - k) * 300
            rot = 10 * math.cos(t * 4 - i * 0.6) * k
            c.save()
            c.translate(x + cw / 2, y)
            c.rotate(rot)
            c.drawString(ch, -cw / 2, 0, f, fill(self.accent if i % 3 == 1 else self.text, k))
            c.restore()
            x += cw
        self._sub(c, cy + f.getSize() + 140, 1.0, t)

    def _echo_text(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.accent)
        word, f = self._word(420, 300, 0.8)
        cy = H * 0.5
        cols = [self.on_accent, self.bg]
        copies = 14
        for i in reversed(range(copies)):
            k = expo_out(clamp((t - 0.05 * i) / 0.8))
            off = i * (34 + 14 * math.sin(t * 2)) * k
            sc = 1 - i * 0.03 * k
            c.save()
            c.translate(W / 2, cy - off * 0.6 + off * math.sin(t * 1.5) * 0.4)
            c.scale(sc, sc)
            if i == 0:
                text(c, word, 0, f.getSize() * 0.35, f, self.bg)
            else:
                p = text_path(word, f, 0, f.getSize() * 0.35)
                c.drawPath(p, stroke(cols[i % 2], 3, 0.9 - i * 0.05))
            c.restore()
        self._sub(c, cy + f.getSize() * 0.9 + 60, 1.0, t)

    def _scramble_text(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, (6, 8, 12))
        m = F.mono(30)
        rng = random.Random(int(t * 12))
        # chuva de caracteres
        cols_n = int(W / 34)
        for i in range(cols_n):
            r2 = random.Random(i)
            speed = r2.uniform(200, 600)
            y = (t * speed + r2.uniform(0, H)) % (H + 400) - 200
            for j in range(12):
                a = 0.5 * (1 - j / 12)
                c.drawString(rng.choice(GLYPHS), i * 34 + 6, y - j * 34, m, fill(self.accent, a * 0.5))
        word = self.d["text"].upper()
        f = fit(F.MONO_FONTS[0], word, 220 if portrait() else 180, W * 0.88)
        f = F.mono(f.getSize()) if True else f
        total = f.measureText(word)
        x = W / 2 - total / 2
        cy = H * 0.48 + f.getSize() * 0.35
        rrect(c, W * 0.04, cy - f.getSize() * 1.1, W * 0.96, cy + f.getSize() * 0.5, 30, fill((0, 0, 0), 0.75))
        for i, ch in enumerate(word):
            lock = 0.3 + i * 0.12
            shown = ch if t > lock or ch == " " else rng.choice(GLYPHS)
            colr = self.text if t > lock else self.accent
            c.drawString(shown, x, cy, f, fill(colr))
            if abs(t - lock) < 0.08:
                c.drawRect(skia.Rect(x, cy - f.getSize() * 0.8, x + f.measureText(ch), cy + 10), glow(self.accent, 20, 0.6))
            x += f.measureText(ch)
        self._sub(c, cy + 170, 0.4 + len(word) * 0.12, t)

    def _marquee(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        words = self.d["items"]
        rows = 7 if portrait() else 5
        rh = H / rows
        enter = expo_out(clamp(t / 0.7))
        c.save()
        c.rotate(-8, W / 2, H / 2)
        for r in range(rows):
            y = -H * 0.06 + r * rh * 1.12
            hl = r == rows // 2
            if hl:
                c.drawRect(skia.Rect(-W, y + rh * 0.05, 2 * W, y + rh * 1.0), fill(self.accent))
            s = "  •  ".join(w.upper() for w in (words * 3)) + "  •  "
            f = font(self.fonts["title"], rh * 0.72)
            wdt = f.measureText(s)
            d = 1 if r % 2 else -1
            x = -((t * (260 + 60 * r) * d) % wdt) - (1 - enter) * W * d
            colr = self.on_accent if hl else self.text
            a = 1.0 if hl else 0.16 + 0.1 * (r % 2)
            for k in range(-1, 3):
                if r % 2 == 0 and not hl:
                    c.drawPath(text_path(s, f, x + k * wdt, y + rh * 0.78, align="left"), stroke(colr, 3, 0.5))
                else:
                    text(c, s, x + k * wdt, y + rh * 0.78, f, colr, a, align="left")
        c.restore()

    def _highlight_text(self, c, t, span, n):
        W, H = C.W, C.H
        paper = (250, 247, 238)
        ink = (24, 24, 28)
        bg(c, paper)
        words = self.d["text"].split()
        key = self.d["value"].lower().strip(".,!?")
        f = font(self.fonts["title"], 120 if portrait() else 92)
        max_w = W * 0.84
        lines, cur = [], []
        for w in words:
            if cur and f.measureText(" ".join(cur + [w])) > max_w:
                lines.append(cur)
                cur = [w]
            else:
                cur.append(w)
        lines.append(cur)
        lh = f.getSize() * 1.3
        y = H * 0.48 - lh * len(lines) / 2 + f.getSize()
        idx = 0
        key_box = None
        placed = []
        for li, line in enumerate(lines):
            lw = f.measureText(" ".join(line))
            x = W / 2 - lw / 2
            for w in line:
                ww = f.measureText(w)
                if w.lower().strip(".,!?") == key and key_box is None:
                    key_box = (x, y, ww)
                placed.append((w, x, y, idx))
                x += ww + f.measureText(" ")
                idx += 1
            y += lh
        t0 = 0.3 + idx * 0.09
        if key_box:  # marca-texto passando por baixo da palavra
            x, y, ww = key_box
            k = ease_io(clamp((t - t0) / 0.5))
            if k > 0:
                c.drawRect(skia.Rect(x - 14, y - f.getSize() * 0.62, x - 14 + (ww + 28) * k, y + 22), fill(self.accent, 0.85))
        for w, x, y, i in placed:
            k = expo_out(clamp((t - 0.15 - i * 0.09) / 0.4))
            text(c, w, x, y + 30 * (1 - k), f, ink, k, align="left")
        if key_box:
            x, y, ww = key_box
            k2 = clamp((t - t0 - 0.5) / 0.6)
            if k2 > 0:
                ov = skia.Path()
                ov.addOval(skia.Rect(x - 40, y - f.getSize() * 1.0, x + ww + 40, y + 40))
                pe = stroke(self.accent, 9)
                pe.setPathEffect(skia.DiscretePathEffect.Make(18, 2.5, 7))
                c.drawPath(ov, trim(pe, ease_io(k2)))

    def _quote(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.12), self.bg)
        qf = font(self.fonts["title"], 520)
        k = spring(t, 10, 6)
        c.save()
        c.translate(W * 0.18, H * 0.34)
        c.scale(k, k)
        text(c, "“", 0, 200, qf, self.accent)
        c.restore()
        words = self.d["text"].split()
        f = font(self.fonts["title"], 84 if portrait() else 64)
        max_w = W * 0.8
        lines, cur = [], []
        for w in words:
            if cur and f.measureText(" ".join(cur + [w])) > max_w:
                lines.append(cur)
                cur = [w]
            else:
                cur.append(w)
        lines.append(cur)
        lh = f.getSize() * 1.35
        y = H * 0.42
        idx = 0
        per = min(0.12, max(span - 1.6, 1) / max(len(words), 1))
        for line in lines:
            x = W * 0.1
            for w in line:
                kk = clamp((t - 0.4 - idx * per) / 0.25)
                text(c, w, x, y, f, self.text, 0.15 + 0.85 * kk, align="left")
                x += f.measureText(w + " ")
                idx += 1
            y += lh
        if self.d.get("label"):
            kk = expo_out(clamp((t - 0.6 - idx * per) / 0.5))
            c.drawRect(skia.Rect(W * 0.1, y + 20, W * 0.1 + 90 * kk, y + 28), fill(self.accent))
            text(c, self.d["label"], W * 0.1 + 120, y + 42, font(self.fonts["title"], 50), self.text, kk, align="left")

    def _countdown(self, c, t, span, n):
        W, H = C.W, C.H
        start = int(self.d["value"])
        steps = start + 1
        per = max(0.5, (span - 0.4) / steps)
        i = min(int(t / per), steps - 1)
        lt = t - i * per
        cols = hues(self.accent, steps, 0.3)
        colr = cols[i]
        bg(c, mix(self.bg, colr, 0.15))
        cx, cy = W / 2, H * 0.47
        R = min(W, H) * 0.36
        # ponteiro de radar girando
        c.drawCircle(cx, cy, R, stroke(self.text, 4, 0.25))
        c.drawCircle(cx, cy, R * 0.66, stroke(self.text, 3, 0.15))
        c.drawLine(cx - R * 1.2, cy, cx + R * 1.2, cy, stroke(self.text, 2, 0.15))
        c.drawLine(cx, cy - R * 1.2, cx, cy + R * 1.2, stroke(self.text, 2, 0.15))
        sweep = clamp(lt / per)
        arc = skia.Path()
        arc.moveTo(cx, cy)
        arc.arcTo(skia.Rect(cx - R, cy - R, cx + R, cy + R), -90, 360 * sweep, False)
        arc.close()
        c.drawPath(arc, fill(colr, 0.35))
        a = math.radians(-90 + 360 * sweep)
        c.drawLine(cx, cy, cx + math.cos(a) * R, cy + math.sin(a) * R, stroke(colr, 8))
        s = str(start - i) if i < start else self.d["text"].upper()
        f = fit(self.fonts["title"], s, 420 if i < start else 260, W * 0.86)
        k = spring(lt, 16, 6)
        c.save()
        c.translate(cx, cy)
        c.scale(max(k, 0.01), max(k, 0.01))
        text(c, s, 0, f.getSize() * 0.36, f, self.text)
        c.restore()

    # ---------------- formas ----------------
    def _kaleidoscope(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        cx, cy = W / 2, H * 0.46
        enter = expo_out(clamp(t / 0.9))
        cols = hues(self.accent, 6, 0.3)
        seg = 12
        for ring in range(6, 0, -1):
            r = ring * min(W, H) * 0.085 * enter
            for k in range(seg):
                a = 2 * math.pi * k / seg + t * (0.4 if ring % 2 else -0.3) + ring * 0.3
                x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
                s = 22 + ring * 10 + 10 * math.sin(t * 3 + ring + k)
                colr = cols[(ring + k) % 6]
                c.save()
                c.translate(x, y)
                c.rotate(math.degrees(a) + t * 60)
                if ring % 3 == 0:
                    c.drawRect(skia.Rect(-s / 2, -s / 2, s / 2, s / 2), stroke(colr, 5))
                elif ring % 3 == 1:
                    c.drawPath(path_q([(0, -s * 0.6), (s * 0.55, s * 0.4), (-s * 0.55, s * 0.4)]), fill(colr, 0.85))
                else:
                    c.drawCircle(0, 0, s * 0.45, fill(colr, 0.85))
                c.restore()
        c.drawCircle(cx, cy, 190 * spring(t, 10, 6), fill(self.bg))
        c.drawCircle(cx, cy, 190 * spring(t, 10, 6), stroke(self.text, 5, 0.6))
        word = self.d["text"].upper()
        f = fit(self.fonts["title"], word, 110, 330)
        text(c, word, cx, cy + f.getSize() * 0.35, f, self.text, clamp((t - 0.4) / 0.3))
        self._sub(c, H * 0.86, 0.9, t)

    def _tunnel(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, (4, 4, 10))
        cx, cy = W / 2 + 40 * math.sin(t * 0.9), H * 0.46 + 60 * math.cos(t * 0.7)
        cols = hues(self.accent, 4, 0.3)
        speed = 1.4
        for i in range(28):
            z = ((i / 28) - (t * speed * 0.25) % (1 / 28) * 28 / 28)
            z = (i - (t * speed * 7) % 1) / 28
            if z <= 0.01:
                continue
            s = 0.04 / z
            r = min(W, H) * s
            a = clamp(1.4 - z * 1.3) * clamp(r / 40)
            sq = skia.Path()
            ang = t * 0.6 + i * 0.12
            pts = [(cx + math.cos(ang + k * math.pi / 2) * r * 1.3, cy + math.sin(ang + k * math.pi / 2) * r * 1.3) for k in range(4)]
            c.drawPath(path_q(pts), stroke(cols[i % 4], 3 + 10 * s, a))
        # estrelas de velocidade
        rng = random.Random(9)
        for i in range(80):
            a0 = rng.uniform(0, 2 * math.pi)
            ph = (t * rng.uniform(0.6, 1.4) + rng.random()) % 1
            r0 = 40 + ph ** 2 * max(W, H)
            r1 = r0 + 30 + ph * 120
            c.drawLine(cx + math.cos(a0) * r0, cy + math.sin(a0) * r0, cx + math.cos(a0) * r1, cy + math.sin(a0) * r1,
                       stroke(self.text, 3, ph * 0.8))
        word = self.d["text"].upper()
        k = expo_out(clamp((t - 0.3) / 0.8))
        f = fit(self.fonts["title"], word, 230, W * 0.86)
        c.save()
        c.translate(W / 2, H * 0.48)
        z = 0.2 + 0.8 * k
        c.scale(z, z)
        c.drawPath(text_path(word, f, 0, f.getSize() * 0.35), glow(self.accent, 30, 0.8 * k))
        text(c, word, 0, f.getSize() * 0.35, f, self.text, k)
        c.restore()
        self._sub(c, H * 0.58 + 60, 1.1, t, box=True)

    def _dot_wave(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        cols = hues(self.accent, 3, 0.2)
        gap = 54
        ox, oy = W / 2, H * 0.5
        enter = clamp(t / 0.6)
        for gy in range(-2, int(H / gap) + 3):
            for gx in range(-1, int(W / gap) + 2):
                x, y = gx * gap + (gy % 2) * gap / 2, gy * gap
                d = math.hypot(x - ox, y - oy)
                wave = math.sin(d * 0.018 - t * 5)
                r = (4 + 9 * (wave + 1) / 2) * clamp(enter * 2 - d / max(W, H))
                if r <= 0.5:
                    continue
                colr = cols[0] if wave > 0.6 else cols[1] if wave > 0 else self.text
                c.drawCircle(x, y + wave * 10, r, fill(colr, 0.35 + 0.65 * (wave + 1) / 2))
        word = self.d["text"].upper()
        f = fit(self.fonts["title"], word, 260, W * 0.86)
        k = expo_out(clamp((t - 0.4) / 0.6))
        rrect(c, W / 2 - f.measureText(word) / 2 - 50, H * 0.48 - f.getSize() * 0.75, W / 2 + f.measureText(word) / 2 + 50,
              H * 0.48 + f.getSize() * 0.55, 40, fill(self.bg, 0.85 * k))
        text(c, word, W / 2, H * 0.48 + f.getSize() * 0.35 + 40 * (1 - k), f, self.text, k)
        self._sub(c, H * 0.48 + f.getSize() + 80, 0.9, t, box=True)

    def _blob(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        cx, cy = W / 2, H * 0.46
        R = min(W, H) * 0.34 * spring(t, 8, 5)
        cols = hues(self.accent, 3, 0.25)
        for layer in range(3):
            pts = []
            m = 72
            for k in range(m):
                a = 2 * math.pi * k / m
                rr = R * (1 - layer * 0.14) * (1 + 0.1 * math.sin(3 * a + t * 2 + layer) + 0.06 * math.sin(5 * a - t * 3)
                                              + 0.04 * math.cos(7 * a + t * 1.7))
                pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
            p = skia.Path()
            p.moveTo(*pts[0])
            for k in range(m):  # curva suave pelos pontos médios
                x1, y1 = pts[k]
                x2, y2 = pts[(k + 1) % m]
                p.quadTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2)
            p.close()
            sp = skia.Paint(AntiAlias=True)
            sp.setShader(skia.GradientShader.MakeLinear([skia.Point(cx - R, cy - R), skia.Point(cx + R, cy + R)],
                                                        [col(cols[layer]), col(cols[(layer + 1) % 3])]))
            if layer == 0:
                c.drawPath(p, glow(cols[0], 60, 0.5))
            c.drawPath(p, sp)
        # brilho especular
        c.drawOval(skia.Rect(cx - R * 0.5, cy - R * 0.7, cx - R * 0.05, cy - R * 0.45), glow((255, 255, 255), 20, 0.35))
        word = self.d["text"].upper()
        f = fit(self.fonts["title"], word, 170, R * 1.5)
        ka = clamp((t - 0.4) / 0.4)
        c.drawPath(text_path(word, f, cx, cy + f.getSize() * 0.35), glow((0, 0, 0), 16, 0.5 * ka))
        text(c, word, cx, cy + f.getSize() * 0.35, f, (255, 255, 255), ka)
        self._sub(c, cy + R * 1.35 + 70, 0.8, t)

    def _spiro(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.12), self.bg)
        cx, cy = W / 2, H * 0.45
        R, r, d = min(W, H) * 0.25, min(W, H) * 0.09, min(W, H) * 0.16
        k = ease_io(clamp(t / max(span * 0.8, 1.5)))
        steps = int(1400 * k)
        cols = hues(self.accent, 3, 0.25)
        for layer, (rr, dd, ph) in enumerate(((r, d, 0.0), (r * 0.75, d * 0.8, 1.0), (r * 1.25, d * 0.6, 2.0))):
            p = skia.Path()
            for s in range(steps + 1):
                th = s / 1400 * 2 * math.pi * 9
                x = (R - rr) * math.cos(th + ph) + dd * math.cos((R - rr) / rr * th)
                y = (R - rr) * math.sin(th + ph) - dd * math.sin((R - rr) / rr * th)
                (p.lineTo if s else p.moveTo)(cx + x, cy + y)
            c.drawPath(p, stroke(cols[layer], 3, 0.75))
            if 0 < k < 1:  # ponta da caneta
                c.drawCircle(cx + x, cy + y, 12, glow(self.text, 8, 0.9))
        c.save()
        c.rotate(t * 10, cx, cy)
        c.restore()
        word = self.d["text"].upper()
        f = fit(self.fonts["title"], word, 150, W * 0.86)
        kk = expo_out(clamp((t - 1.0) / 0.5))
        text(c, word, W / 2, cy + R * 1.45 + 60 * (1 - kk), f, self.text, kk)
        self._sub(c, cy + R * 1.45 + 140, 1.3, t)

    def _fireworks(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, (6, 6, 16))
        rng = random.Random(4)
        cols = hues(self.accent, 5, 0.35) + [(255, 230, 140)]
        shells = []
        for i in range(7):
            t0 = 0.1 + i * 0.55 + rng.uniform(0, 0.2)
            shells.append((t0, rng.uniform(W * 0.15, W * 0.85), rng.uniform(H * 0.12, H * 0.42), cols[i % len(cols)], rng.randint(26, 40)))
        for t0, x, y, colr, m in shells:
            lt = t - t0
            if lt < 0:
                continue
            if lt < 0.5:  # subida
                k = expo_out(lt / 0.5)
                yy = H + (y - H) * k
                c.drawCircle(x, yy, 6, fill((255, 255, 255)))
                c.drawLine(x, yy, x, yy + 80, stroke(colr, 4, 0.5))
                continue
            e = lt - 0.5
            if e > 2.2:
                continue
            fade = 1 - e / 2.2
            for k in range(m):
                a = 2 * math.pi * k / m
                v = 440 * (1 - math.exp(-e * 3))
                px, py = x + math.cos(a) * v, y + math.sin(a) * v + 90 * e * e
                tx, ty = x + math.cos(a) * v * 0.82, y + math.sin(a) * v * 0.82 + 90 * e * e * 0.8
                c.drawLine(tx, ty, px, py, stroke(colr, 9, fade))
                c.drawCircle(px, py, 9, fill((255, 255, 255), fade * (0.5 + 0.5 * math.sin(e * 30 + k))))
            if e < 0.15:
                c.drawCircle(x, y, 120 * (1 - e / 0.15), glow((255, 255, 255), 40, 0.6))
        word = self.d["text"].upper()
        f = fit(self.fonts["title"], word, 280, W * 0.9)
        k = spring(max(t - 0.9, 0), 12, 6) if t > 0.9 else 0
        c.save()
        c.translate(W / 2, H * 0.7)
        c.scale(k, k)
        c.drawPath(text_path(word, f, 0, f.getSize() * 0.35), glow(self.accent, 26, 0.7))
        text(c, word, 0, f.getSize() * 0.35, f, self.text)
        c.restore()

    def _cube(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.18), self.bg)
        words = self.d["items"]
        m = len(words)
        per = max(0.7, (span - 0.3) / m)
        i = min(int(t / per), m - 1)
        lt = t - i * per
        turn = ease_io(clamp((lt - (per - 0.55)) / 0.55)) if i < m - 1 else 0.0
        yaw = math.radians(-(i + turn) * 90 + 8 * math.sin(t * 1.3))
        pitch = math.radians(22)
        size = min(W, H) * 0.3 * spring(t, 9, 5.5)
        cx, cy = W / 2, H * 0.47
        cols = hues(self.accent, 4, 0.18)
        if size < 4:
            return

        def rot(x, y, z):
            x, z = x * math.cos(yaw) + z * math.sin(yaw), -x * math.sin(yaw) + z * math.cos(yaw)
            y, z = y * math.cos(pitch) - z * math.sin(pitch), y * math.sin(pitch) + z * math.cos(pitch)
            return x, y, z

        def proj(v):
            x, y, z = rot(*v)
            p = 5 / (5 + z)
            return cx + x * size * p, cy + y * size * p

        # faces laterais: 0 frente (z=-1), 1 direita, 2 trás, 3 esquerda; 4 topo (y=-1)
        faces = [((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (0, 0, -1)),
                 ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1), (1, 0, 0)),
                 ((1, -1, 1), (-1, -1, 1), (-1, 1, 1), (1, 1, 1), (0, 0, 1)),
                 ((-1, -1, 1), (-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, 0, 0)),
                 ((-1, -1, 1), (1, -1, 1), (1, -1, -1), (-1, -1, -1), (0, -1, 0))]
        c.drawOval(skia.Rect(cx - size * 1.3, cy + size * 1.25, cx + size * 1.3, cy + size * 1.55), glow((0, 0, 0), 30, 0.45))
        vis = []
        for fi, (*quad, nrm) in enumerate(faces):
            nz = rot(*nrm)[2]
            if nz < -0.01:
                vis.append((nz, fi, [proj(v) for v in quad]))
        for nz, fi, pts in sorted(vis, reverse=True):
            light = clamp(-nz)
            colr = mix(self.text, self.accent, 0.35) if fi == 4 else cols[fi]
            c.drawPath(path_q(pts), fill(mix(mix(colr, (0, 0, 0), 0.45), colr, light)))
            c.drawPath(path_q(pts), stroke((255, 255, 255), 3, 0.3))
            if fi < 4 and light > 0.15:
                wi = (4 - fi) % 4  # a rotação traz as faces na ordem 0, 3, 2, 1
                word = words[wi].upper() if wi < m else ""
                if not word:
                    continue
                (x0, y0), (x1, y1), (x2, y2), (x3, y3) = pts
                f = fit(self.fonts["title"], word, 150, size * 1.7)
                # texto mapeado na face: matriz afim que leva o quadrado unitário à face
                mtx = skia.Matrix()
                mtx.setAll((x1 - x0) / (2 * size), (x3 - x0) / (2 * size), x0, (y1 - y0) / (2 * size), (y3 - y0) / (2 * size), y0, 0, 0, 1)
                c.save()
                c.concat(mtx)
                text(c, word, size, size + f.getSize() * 0.35, f, (255, 255, 255), clamp(light * 2))
                c.restore()

    def _helix(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        cx = W / 2
        cols = hues(self.accent, 2, 0.3)
        enter = clamp(t / 0.8)
        pts = []
        for i in range(44):
            y = H * 0.06 + i * (H * 0.88 / 43)
            a = i * 0.32 + t * 2.2
            for s, colr in ((0, cols[0]), (math.pi, cols[1])):
                x = cx + math.cos(a + s) * W * 0.3
                z = math.sin(a + s)
                pts.append((z, x, y, colr, i, s))
            if i % 2 == 0 and clamp(enter * 44 - i) > 0:
                x1, x2 = cx + math.cos(a) * W * 0.3, cx + math.cos(a + math.pi) * W * 0.3
                c.drawLine(x1, y, x2, y, stroke(self.text, 3, 0.15))
        for z, x, y, colr, i, s in sorted(pts):
            k = clamp(enter * 44 - i)
            if k <= 0:
                continue
            r = (10 + 8 * (z + 1)) * k
            c.drawCircle(x, y, r, fill(colr, 0.35 + 0.65 * (z + 1) / 2))
        word = self.d["text"].upper()
        f = fit(self.fonts["title"], word, 230, W * 0.9)
        k = expo_out(clamp((t - 0.6) / 0.6))
        c.drawRect(skia.Rect(0, H * 0.48 - f.getSize() * 0.8, W, H * 0.48 + f.getSize() * 0.5), fill(self.bg, 0.8 * k))
        text(c, word, W / 2, H * 0.48 + f.getSize() * 0.35, f, self.text, k)
        self._sub(c, H * 0.48 + f.getSize() * 0.5 + 90, 1.0, t)

    # ---------------- dados ----------------
    def _title_top(self, c, t, y=None):
        if self.d.get("label"):
            f = fit(self.fonts["title"], self.d["label"].upper(), 92, C.W * 0.88)
            k = expo_out(clamp((t - 0.1) / 0.5))
            text(c, self.d["label"].upper(), C.W / 2, (y or C.H * 0.13) + 30 * (1 - k), f, self.text, k)

    def _activity_rings(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, (8, 8, 12) if self.dark else self.bg)
        rows = self.d["items"]
        cols = hues(self.accent, 3, 0.22)
        cx, cy = W / 2, H * 0.44
        R = min(W, H) * 0.36
        thick = R * 0.2
        for i, r in enumerate(rows):
            rr = R - i * (thick + 14)
            pn = _num(r.get("value")) or ("", 75.0, "%", 0)
            target = pn[1] / 100 if pn[2].strip() == "%" or pn[1] <= 100 else 1
            k = expo_out(clamp((t - 0.2 - i * 0.2) / 1.4)) * target
            c.drawCircle(cx, cy, rr, stroke(cols[i], thick, 0.2))
            arc = skia.Path()
            arc.addArc(skia.Rect(cx - rr, cy - rr, cx + rr, cy + rr), -90, 359.9 * min(k, 0.9999))
            c.drawPath(arc, stroke(cols[i], thick))
            if k > 0.02:
                a = math.radians(-90 + 360 * k)
                c.drawCircle(cx + math.cos(a) * rr, cy + math.sin(a) * rr, thick * 0.5, glow((0, 0, 0), 12, 0.5))
                c.drawCircle(cx + math.cos(a) * rr, cy + math.sin(a) * rr, thick * 0.5, fill(mix(cols[i], (255, 255, 255), 0.2)))
            lf = font(self.fonts["title"], 56)
            ly = cy + R + 120 + i * 90
            c.drawCircle(W * 0.2, ly - 18, 18, fill(cols[i]))
            text(c, r["label"], W * 0.2 + 40, ly, lf, self.text, clamp((t - 0.3 - i * 0.2) / 0.3), align="left")
            if r.get("value"):
                vs = f"{pn[0]}{int(round(pn[1] * k / max(target, 1e-6)))}{pn[2]}"
                text(c, vs, W * 0.82, ly, lf, cols[i], clamp((t - 0.3 - i * 0.2) / 0.3), align="right")
        self._title_top(c, t)

    def _pie(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.1), self.bg)
        rows = self.d["items"]
        vals = [(_num(r.get("value")) or ("", 1.0, "", 0))[1] for r in rows]
        tot = sum(vals) or 1
        cols = hues(self.accent, len(rows), 0.5)
        cx, cy = W / 2, H * 0.43
        R = min(W, H) * 0.34
        sweep = expo_out(clamp((t - 0.2) / 1.2))
        lead = max(range(len(rows)), key=lambda i: vals[i])
        a0 = -90.0
        lf = font(self.fonts["title"], 54)
        for i, v in enumerate(vals):
            ang = 360 * v / tot
            mid = math.radians(a0 + ang / 2)
            pop = 50 * expo_out(clamp((t - 1.5) / 0.4)) if i == lead else 0
            ox, oy = math.cos(mid) * pop, math.sin(mid) * pop
            p = skia.Path()
            p.moveTo(cx + ox, cy + oy)
            p.arcTo(skia.Rect(cx - R + ox, cy - R + oy, cx + R + ox, cy + R + oy), a0 * 1.0, ang * sweep, False)
            p.close()
            c.drawPath(p, fill(cols[i]))
            c.drawPath(p, stroke(self.bg, 6))
            kk = clamp((t - 1.2 - i * 0.1) / 0.3)
            pct = f"{round(100 * v / tot)}%"
            text(c, pct, cx + ox + math.cos(mid) * R * 0.66, cy + oy + math.sin(mid) * R * 0.66 + 20, lf, (255, 255, 255), kk)
            ly = cy + R + 130 + (i // 2) * 84
            lx = W * (0.12 if i % 2 == 0 else 0.55)
            rrect(c, lx, ly - 40, lx + 40, ly, 10, fill(cols[i], kk))
            text(c, _s(rows[i]["label"], 14), lx + 60, ly - 4, font(self.fonts["body"], 48), self.text, kk, align="left")
            a0 += ang * sweep
        c.drawCircle(cx, cy, R * 0.32 * sweep, fill(mix(self.bg, self.accent, 0.1)))
        self._title_top(c, t)

    def _calendar_grid(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        cols, rows = 7, 6
        pn = _num(self.d.get("value")) or ("", 30.0, "", 0)
        goal = int(min(max(pn[1], 1), cols * rows))
        cell = min(W * 0.9 / cols, 140)
        gx0 = W / 2 - cell * cols / 2
        gy0 = H * 0.3
        sf = font(self.fonts["body"], 32)
        for i, d in enumerate("DSTQQSS"):
            text(c, d, gx0 + i * cell + cell / 2, gy0 - 24, sf, self.text, 0.6)
        filled = int(goal * ease_io(clamp((t - 0.4) / max(1.6, span * 0.5))))
        shades = [mix(self.bg, self.accent, k) for k in (0.25, 0.5, 0.75, 1.0)]
        rng = random.Random(3)
        for i in range(cols * rows):
            x, y = gx0 + (i % cols) * cell, gy0 + (i // cols) * cell
            k = expo_out(clamp((t - i * 0.012) / 0.4))
            s = cell * 0.82 * k
            on = i < filled
            colr = shades[rng.randint(0, 3)] if on else mix(self.bg, self.text, 0.08)
            pop = 1 + 0.25 * (1 - clamp((t - 0.4 - i / goal * max(1.6, span * 0.5)) / 0.25)) if on and i == filled - 1 else 1
            c.save()
            c.translate(x + cell / 2, y + cell / 2)
            c.scale(pop, pop)
            rrect(c, -s / 2, -s / 2, s / 2, s / 2, 16, fill(colr))
            c.restore()
        bf = font(self.fonts["title"], 140)
        val = f"{pn[0]}{filled}{pn[2]}"
        text(c, val, W / 2, gy0 + rows * cell + 190, bf, self.text)
        self._title_top(c, t)

    def _candles(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, (10, 12, 18) if self.dark else self.bg)
        x0, x1, y0, y1 = W * 0.08, W * 0.92, H * 0.24, H * 0.72
        for j in range(6):
            yy = y0 + (y1 - y0) * j / 5
            c.drawLine(x0, yy, x1, yy, stroke(self.text, 2, 0.08))
        rng = random.Random(8)
        m = 22
        cw = (x1 - x0) / m
        price = 40.0
        series = []
        for i in range(m):
            o = price
            price = max(5, price + rng.uniform(-6, 9) + i * 0.35)
            hi, lo = max(o, price) + rng.uniform(1, 6), min(o, price) - rng.uniform(1, 6)
            series.append((o, price, hi, lo))
        top = max(s[2] for s in series)
        bot = min(s[3] for s in series)
        Y = lambda v: y1 - (v - bot) / (top - bot) * (y1 - y0)
        green, red = (40, 210, 120), (240, 70, 90)
        shown = clamp((t - 0.2) / max(1.8, span * 0.6)) * m
        line = skia.Path()
        for i, (o, cl, hi, lo) in enumerate(series):
            k = clamp(shown - i)
            if k <= 0:
                break
            x = x0 + i * cw + cw / 2
            colr = green if cl >= o else red
            c.drawLine(x, Y(hi), x, Y(lo), stroke(colr, 4, k))
            ya, yb = Y(max(o, cl)), Y(min(o, cl))
            mid = (ya + yb) / 2
            hh = max((yb - ya) * k, 6)
            c.drawRect(skia.Rect(x - cw * 0.32, mid - hh / 2, x + cw * 0.32, mid + hh / 2), fill(colr))
            (line.lineTo if i else line.moveTo)(x, Y(cl))
        c.drawPath(line, stroke(self.accent, 5, 0.8))
        if shown > 1:
            i = min(int(shown), m - 1)
            last = series[i][1]
            yy = Y(last)
            c.drawLine(x0, yy, x1, yy, stroke(self.accent, 2, 0.5))
            rrect(c, x1 - 190, yy - 36, x1, yy + 36, 18, fill(self.accent))
            text(c, f"{last:.1f}", x1 - 95, yy + 15, font(self.fonts["title"], 40), self.on_accent)
        if self.d.get("value"):
            k = spring(max(t - (0.2 + max(1.8, span * 0.6)), 0), 12, 6)
            f = fit(self.fonts["title"], self.d["value"], 180, W * 0.8)
            c.save()
            c.translate(W / 2, H * 0.85)
            c.scale(k, k)
            text(c, self.d["value"], 0, f.getSize() * 0.35, f, green)
            c.restore()
        self._title_top(c, t)

    def _gauge(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.15), self.bg)
        pn = _num(self.d.get("value")) or ("", 87.0, "%", 0)
        v = clamp(pn[1] / 100 if pn[1] <= 100 else 1)
        cx, cy = W / 2, H * 0.52
        R = min(W, H) * 0.4
        cols = hues(self.accent, 3, 0.4)
        for i in range(60):  # escala colorida
            a = math.radians(180 + 180 * i / 59)
            on = i / 59 <= v * expo_out(clamp((t - 0.2) / 1.4))
            colr = cols[0] if i < 20 else cols[1] if i < 40 else cols[2]
            r0, r1 = R * 0.82, R * (0.98 if i % 5 == 0 else 0.92)
            c.drawLine(cx + math.cos(a) * r0, cy + math.sin(a) * r0, cx + math.cos(a) * r1, cy + math.sin(a) * r1,
                       stroke(colr if on else self.text, 9 if i % 5 == 0 else 6, 1 if on else 0.15))
        # agulha com mola e tremida
        k = spring(max(t - 0.2, 0), 7, 3.5)
        jitter = 0.01 * math.sin(t * 30) * clamp(t - 1.5)
        a = math.radians(180 + 180 * min(v * k + jitter, 1.02))
        c.drawLine(cx, cy, cx + math.cos(a) * R * 0.78, cy + math.sin(a) * R * 0.78, stroke(self.text, 12))
        c.drawCircle(cx, cy, 34, fill(self.accent))
        c.drawCircle(cx, cy, 14, fill(self.bg))
        f = font(self.fonts["title"], 150)
        s = f"{pn[0]}{int(round(pn[1] * min(k, 1)))}{pn[2]}"
        text(c, s, cx, cy + 210, f, self.text)
        self._title_top(c, t, H * 0.2)

    def _bubbles(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        rows = self.d["items"]
        vals = [(_num(r.get("value")) or ("", 1.0, "", 0))[1] for r in rows]
        vmax = max(vals) or 1
        cols = hues(self.accent, len(rows), 0.4)
        # posições fixas por empacotamento simples (espiral)
        key = ("bub", C.W, C.H)
        if key not in self.cache:
            placed = []
            order = sorted(range(len(rows)), key=lambda i: -vals[i])
            for i in order:
                r = min(W, H) * (0.12 + 0.2 * math.sqrt(vals[i] / vmax))
                a, d = 0.0, 0.0
                while True:
                    x, y = W / 2 + math.cos(a) * d, H * 0.47 + math.sin(a) * d * 1.3
                    if all(math.hypot(x - px, y - py) > r + pr + 14 for px, py, pr, _ in placed):
                        break
                    a += 0.35
                    d += 4
                placed.append((x, y, r, i))
            # cabe na área útil (entre o título e o rodapé): escala o conjunto todo em volta do centro
            bx0 = min(x - r for x, y, r, _ in placed)
            bx1 = max(x + r for x, y, r, _ in placed)
            by0 = min(y - r for x, y, r, _ in placed)
            by1 = max(y + r for x, y, r, _ in placed)
            sc = min(1.0, W * 0.92 / (bx1 - bx0), H * 0.66 / (by1 - by0))
            mx, my = (bx0 + bx1) / 2, (by0 + by1) / 2
            placed = [(W / 2 + (x - mx) * sc, H * 0.54 + (y - my) * sc, r * sc, i) for x, y, r, i in placed]
            self.cache[key] = placed
        for x, y, r, i in self.cache[key]:
            k = spring(max(t - 0.15 - i * 0.12, 0), 10, 5)
            fx, fy = 10 * math.sin(t * 1.3 + i), 12 * math.cos(t * 1.1 + i * 2)
            rr = r * k
            if rr < 2:
                continue
            c.drawCircle(x + fx, y + fy, rr, glow(cols[i], 30, 0.4))
            c.drawCircle(x + fx, y + fy, rr, fill(cols[i]))
            c.drawCircle(x + fx - rr * 0.35, y + fy - rr * 0.35, rr * 0.25, fill((255, 255, 255), 0.18))
            lf = fit(self.fonts["title"], rows[i]["label"], rr * 0.42, rr * 1.6, 16)
            text(c, rows[i]["label"], x + fx, y + fy + (0 if not rows[i].get("value") else -rr * 0.08), lf, (255, 255, 255))
            if rows[i].get("value"):
                vf = font(self.fonts["body"], max(18, rr * 0.26))
                text(c, rows[i]["value"], x + fx, y + fy + rr * 0.32, vf, (255, 255, 255), 0.85)
        self._title_top(c, t)

    def _venn(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.1), self.bg)
        rows = self.d["items"]
        m = len(rows)
        cols = hues(self.accent, m, 0.45)
        cx, cy = W / 2, H * 0.47
        R = min(W, H) * (0.27 if m == 3 else 0.3)
        k = expo_out(clamp((t - 0.2) / 1.0))
        d = R * 0.62 * k + R * 0.9 * (1 - k)
        lf = font(self.fonts["title"], 56)
        for i, r in enumerate(rows):
            a = -math.pi / 2 + 2 * math.pi * i / m + (math.pi / 2 if m == 2 else 0)
            x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            p = fill(cols[i], 0.55)
            p.setBlendMode(skia.BlendMode.kScreen if self.dark else skia.BlendMode.kMultiply)
            c.drawCircle(x, y, R * spring(max(t - i * 0.15, 0), 10, 6), p)
            c.drawCircle(x, y, R, stroke(cols[i], 4, 0.8 * k))
            lx, ly = cx + math.cos(a) * (d + R * 0.5), cy + math.sin(a) * (d + R * 0.5)
            text(c, r["label"], lx, ly + 20, lf, self.text, clamp((t - 0.6) / 0.4))
        if self.d.get("text"):
            kk = spring(max(t - 1.3, 0), 14, 6) if t > 1.3 else 0
            f = fit(self.fonts["title"], self.d["text"].upper(), 72, R * 0.9)
            c.save()
            c.translate(cx, cy)
            c.scale(kk, kk)
            c.drawCircle(0, 0, R * 0.42, fill(self.text))
            text(c, self.d["text"].upper(), 0, f.getSize() * 0.35, f, self.bg)
            c.restore()

    def _funnel(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        rows = self.d["items"]
        m = len(rows)
        cols = hues(self.accent, m, 0.3)
        top, bot = H * 0.24, H * 0.82
        sh = (bot - top) / m
        lf = font(self.fonts["title"], 58)
        vf = font(self.fonts["body"], 46)
        for i, r in enumerate(rows):
            k = expo_out(clamp((t - 0.2 - i * 0.22) / 0.6))
            w0 = W * (0.9 - 0.6 * i / m)
            w1 = W * (0.9 - 0.6 * (i + 1) / m)
            y0 = top + i * sh + 8
            y1 = y0 + sh - 16
            yo = (1 - k) * -120
            c.drawPath(path_q([(W / 2 - w0 / 2, y0 + yo), (W / 2 + w0 / 2, y0 + yo), (W / 2 + w1 / 2, y1 + yo), (W / 2 - w1 / 2, y1 + yo)]),
                       fill(cols[i], k))
            text(c, r["label"], W / 2, (y0 + y1) / 2 + yo + (0 if not r.get("value") else -6), lf, (255, 255, 255), k)
            if r.get("value"):
                text(c, r["value"], W / 2, (y0 + y1) / 2 + yo + 48, vf, (255, 255, 255), 0.85 * k)
        # gotas caindo pelo funil
        rng = random.Random(2)
        for i in range(30):
            ph = (t * 0.5 + rng.random()) % 1
            if t < 0.6:
                break
            y = top - 60 + ph * (bot - top + 120)
            spread = W * (0.42 - 0.3 * ph) * rng.uniform(-1, 1)
            c.drawCircle(W / 2 + spread, y, 7, fill(self.text, 0.6 * (1 - ph)))
        self._title_top(c, t)

    def _rating(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, self.accent, 0.14), self.bg)
        pn = _num(self.d.get("value")) or ("", 5.0, "", 0)
        v = min(pn[1], 5)
        cx, cy = W / 2, H * 0.36
        gold = (255, 196, 40)
        star_r = min(W * 0.08, 90)
        for i in range(5):
            x = cx + (i - 2) * star_r * 2.15
            k = spring(max(t - 0.2 - i * 0.15, 0), 14, 6)
            pts = []
            for j in range(10):
                a = -math.pi / 2 + j * math.pi / 5
                rr = star_r if j % 2 == 0 else star_r * 0.45
                pts.append((math.cos(a) * rr, math.sin(a) * rr))
            c.save()
            c.translate(x, cy)
            c.scale(k, k)
            c.rotate((1 - min(k, 1)) * 90)
            sp = path_q(pts)
            c.drawPath(sp, fill(self.text, 0.15))
            part = clamp(v - i)
            if part > 0:
                c.save()
                c.clipRect(skia.Rect(-star_r, -star_r, -star_r + 2 * star_r * part, star_r))
                c.drawPath(sp, glow(gold, 14, 0.6))
                c.drawPath(sp, fill(gold))
                c.restore()
            c.restore()
        f = font(self.fonts["title"], 190)
        k = clamp((t - 0.3) / 1.0)
        text(c, f"{pn[1] * ease_io(k):.1f}".replace(".", ","), cx, cy + 300, f, self.text)
        if self.d.get("label"):
            text(c, self.d["label"], cx, cy + 390, font(self.fonts["body"], 52), self.text, 0.7 * k)
        if self.d.get("text"):  # cartão de review subindo
            kk = expo_out(clamp((t - 1.3) / 0.6))
            y0 = H * 0.72 + (1 - kk) * 200
            words = self.d["text"]
            rf = fit(self.fonts["body"], "“" + words + "”", 48, W * 0.76)
            shadow(c, W * 0.08, y0, W * 0.92, y0 + 170, 36, 0.25 * kk)
            rrect(c, W * 0.08, y0, W * 0.92, y0 + 170, 36, fill((255, 255, 255), kk))
            text(c, "“" + words + "”", W / 2, y0 + 100, rf, (30, 30, 36), kk)

    def _battery(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.bg)
        pn = _num(self.d.get("value")) or ("", 100.0, "%", 0)
        v = clamp(pn[1] / 100)
        bw, bh = W * 0.42, H * 0.42
        x0, y0 = W / 2 - bw / 2, H * 0.24
        k = ease_io(clamp((t - 0.3) / max(1.6, span * 0.55)))
        lvl = v * k
        green = (60, 220, 120)
        colr = mix((240, 70, 80), green, clamp(lvl * 1.6))
        rrect(c, W / 2 - bw * 0.18, y0 - 40, W / 2 + bw * 0.18, y0 + 10, 14, fill(self.text, 0.8))
        rrect(c, x0, y0, x0 + bw, y0 + bh, 50, stroke(self.text, 14))
        ih = (bh - 56) * lvl
        c.save()
        c.clipRect(skia.Rect(x0 + 28, y0 + bh - 28 - ih, x0 + bw - 28, y0 + bh - 28))
        rrect(c, x0 + 28, y0 + 28, x0 + bw - 28, y0 + bh - 28, 28, fill(colr))
        # bolhas de energia subindo
        rng = random.Random(6)
        for i in range(16):
            ph = (t * rng.uniform(0.4, 0.9) + rng.random()) % 1
            c.drawCircle(x0 + 40 + rng.random() * (bw - 80), y0 + bh - 28 - ph * ih, rng.uniform(6, 14), fill((255, 255, 255), 0.3 * (1 - ph)))
        c.restore()
        # raio
        bolt = [(0.1, -0.32), (-0.14, 0.04), (0.0, 0.04), (-0.1, 0.32), (0.16, -0.06), (0.02, -0.06)]
        pulse = 1 + 0.08 * math.sin(t * 8) * (1 - k)
        c.save()
        c.translate(W / 2, y0 + bh / 2)
        c.scale(pulse, pulse)
        c.drawPath(path_q([(px * bw, py * bh) for px, py in bolt]), fill((255, 255, 255), 0.95))
        c.restore()
        f = font(self.fonts["title"], 160)
        text(c, f"{int(round(pn[1] * k))}%", W / 2, y0 + bh + 210, f, colr if k < 1 else green)
        self._title_top(c, t, H * 0.12)

    def _thermometer(self, c, t, span, n):
        W, H = C.W, C.H
        pn = _num(self.d.get("value")) or ("", 40.0, "°", 0)
        v = clamp(pn[1] / 50)
        k = ease_io(clamp((t - 0.3) / max(1.6, span * 0.5)))
        hot = mix((60, 140, 255), (255, 70, 50), v * k)
        radial_bg(c, mix(self.bg, hot, 0.25), self.bg)
        cx = W / 2
        top, bot = H * 0.18, H * 0.66
        tw = 70
        rrect(c, cx - tw, top - tw, cx + tw, bot, tw, fill(self.text, 0.12))
        c.drawCircle(cx, bot + 60, 120, fill(self.text, 0.12))
        lvl = bot - (bot - top) * v * k
        rrect(c, cx - tw * 0.55, lvl, cx + tw * 0.55, bot + 20, tw * 0.55, fill(hot))
        c.drawCircle(cx, bot + 60, 92, fill(hot))
        c.drawCircle(cx, bot + 60, 140, glow(hot, 40, 0.4 * k))
        for i in range(11):
            y = bot - (bot - top) * i / 10
            c.drawLine(cx + tw + 20, y, cx + tw + (60 if i % 5 == 0 else 40), y, stroke(self.text, 4, 0.5))
        # ondas de calor
        for j in range(3):
            p = skia.Path()
            for s in range(40):
                yy = top + s * 20
                xx = cx - tw - 120 - j * 50 + 18 * math.sin(yy * 0.03 - t * 6 + j)
                (p.lineTo if s else p.moveTo)(xx, yy)
            c.drawPath(p, stroke(hot, 5, 0.35 * k))
        f = font(self.fonts["title"], 170)
        text(c, f"{pn[0]}{int(round(pn[1] * k))}{pn[2] or '°'}", cx, bot + 330, f, self.text)
        self._title_top(c, t, H * 0.09)

    # ---------------- interface ----------------
    def _cursor_click(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, mix(self.bg, self.text, 0.04))
        # janela de navegador
        x0, y0, x1, y1 = W * 0.06, H * 0.2, W * 0.94, H * 0.78
        e = expo_out(clamp(t / 0.6))
        c.save()
        c.translate(0, (1 - e) * 120)
        shadow(c, x0, y0, x1, y1, 34, 0.35, 40, 24)
        rrect(c, x0, y0, x1, y1, 34, fill((255, 255, 255) if not self.dark else mix(self.bg, self.text, 0.1)))
        rrect(c, x0, y0, x1, y0 + 90, 34, fill(mix(self.bg, self.text, 0.15)))
        c.drawRect(skia.Rect(x0, y0 + 60, x1, y0 + 90), fill(mix(self.bg, self.text, 0.15)))
        for j, cc in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
            c.drawCircle(x0 + 44 + j * 40, y0 + 45, 12, fill(cc))
        rrect(c, x0 + 170, y0 + 24, x1 - 40, y0 + 66, 21, fill((255, 255, 255), 0.6))
        ink = (30, 30, 36) if not self.dark else self.text
        if self.d.get("label"):
            hf = fit(self.fonts["title"], self.d["label"], 80, (x1 - x0) * 0.85)
            text(c, self.d["label"], W / 2, y0 + 260, hf, ink)
        for j, ww in enumerate((0.7, 0.55, 0.62)):
            rrect(c, W / 2 - (x1 - x0) * ww / 2, y0 + 330 + j * 50, W / 2 + (x1 - x0) * ww / 2, y0 + 352 + j * 50, 11, fill(ink, 0.12))
        # botão
        bf = fit(self.fonts["title"], self.d["text"], 60, (x1 - x0) * 0.6)
        bw = bf.measureText(self.d["text"]) + 120
        bx, by = W / 2, y0 + (y1 - y0) * 0.72
        click = 1.8
        pressed = clamp((t - click) / 0.1) * (1 - clamp((t - click - 0.15) / 0.2))
        done = t > click + 0.2
        s = 1 - 0.08 * pressed
        c.save()
        c.translate(bx, by)
        c.scale(s, s)
        colr = (60, 200, 110) if done else self.accent
        rrect(c, -bw / 2, -60, bw / 2, 60, 60, fill(colr))
        label = "✓" if False else self.d["text"]
        text(c, label, 0, 20, bf, self.on_accent)
        c.restore()
        if t > click:  # ondas do clique
            ph = clamp((t - click) / 0.6)
            c.drawCircle(bx, by, 60 + 160 * ph, stroke(colr, 6, 1 - ph))
        c.restore()
        # cursor viajando em curva até o botão
        k = ease_io(clamp((t - 0.5) / 1.2))
        sx, sy = W * 0.85, H * 0.9
        mx, my = W * 0.2, H * 0.5
        px = (1 - k) ** 2 * sx + 2 * (1 - k) * k * mx + k * k * (bx + 40)
        py = (1 - k) ** 2 * sy + 2 * (1 - k) * k * my + k * k * (by + 20)
        cur = path_q([(0, 0), (0, 70), (18, 54), (32, 84), (44, 78), (30, 50), (54, 50)])
        c.save()
        c.translate(px, py)
        c.scale(1.4 - 0.15 * pressed, 1.4 - 0.15 * pressed)
        c.drawPath(cur, glow((0, 0, 0), 8, 0.4))
        c.drawPath(cur, fill((255, 255, 255)))
        c.drawPath(cur, stroke((20, 20, 24), 4))
        c.restore()

    def _like_button(self, c, t, span, n):
        W, H = C.W, C.H
        radial_bg(c, mix(self.bg, (255, 60, 100), 0.18), self.bg)
        cx, cy = W / 2, H * 0.42
        pink = (255, 56, 100)
        hit = 0.9
        lt = t - hit
        size = 260
        # coração vazio, depois enche com pulo + partículas
        k = spring(max(lt, 0), 12, 5) if lt > 0 else 0
        s = 1 + 0.35 * (k - 1) * (1 if lt > 0 else 0) if lt > 0 else 1 - 0.1 * clamp((t - 0.6) / 0.3)
        heart = skia.Path()
        heart.moveTo(0, size * 0.35)
        heart.cubicTo(-size * 0.9, -size * 0.2, -size * 0.45, -size * 0.85, 0, -size * 0.38)
        heart.cubicTo(size * 0.45, -size * 0.85, size * 0.9, -size * 0.2, 0, size * 0.35)
        c.save()
        c.translate(cx, cy)
        c.scale(s, s)
        if lt > 0:
            c.drawPath(heart, glow(pink, 40, 0.5))
            c.drawPath(heart, fill(pink))
        else:
            c.drawPath(heart, stroke(self.text, 14))
        c.restore()
        if lt > 0:
            ph = expo_out(clamp(lt / 0.6))
            c.drawCircle(cx, cy, 120 + 260 * ph, stroke(pink, 20 * (1 - ph) + 1, 1 - ph))
            cols = hues(pink, 4, 0.2)
            for i in range(14):
                a = 2 * math.pi * i / 14
                r = 200 + 220 * ph
                c.drawCircle(cx + math.cos(a) * r, cy + math.sin(a) * r, 16 * (1 - ph) + 1, fill(cols[i % 4], 1 - ph))
            # corações pequenos subindo
            rng = random.Random(1)
            for i in range(12):
                st = 0.1 + i * 0.12
                e = lt - st
                if e <= 0 or e > 1.8:
                    continue
                x = cx + rng.uniform(-300, 300) + 30 * math.sin(e * 5 + i)
                y = cy - e * 500
                sz = rng.uniform(0.15, 0.3)
                c.save()
                c.translate(x, y)
                c.scale(sz, sz)
                c.drawPath(heart, fill(pink, 1 - e / 1.8))
                c.restore()
        from .mograph import fmt_number
        pn = _num(self.d.get("value")) or ("", 12480.0, "", 0)
        kk = expo_out(clamp((lt) / 1.4)) if lt > 0 else 0
        val = pn[1] * (0.6 + 0.4 * kk)
        f = font(self.fonts["title"], 150)
        text(c, f"{pn[0]}{fmt_number(val, pn[3])}{pn[2]}", cx, cy + 420, f, self.text)
        if self.d.get("label"):
            text(c, self.d["label"], cx, cy + 510, font(self.fonts["body"], 54), self.text, 0.75)

    def _price_tag(self, c, t, span, n):
        W, H = C.W, C.H
        bg(c, self.accent)
        # faixas de "promoção" correndo
        c.save()
        c.rotate(-20, W / 2, H / 2)
        for j in range(-6, 14):
            x = j * 160 + (t * 140) % 160
            c.drawRect(skia.Rect(x, -H, x + 60, 2 * H), fill(self.on_accent, 0.06))
        c.restore()
        cx, cy = W / 2, H * 0.46
        sw = math.sin(t * 2.2) * 6 * clamp(t - 0.5)
        e = spring(t, 8, 4.5)
        c.save()
        c.translate(cx, cy - (1 - min(e, 1)) * H * 0.5)
        c.rotate(sw - 8)
        tw, th = W * 0.8, H * 0.28
        tag = path_q([(-tw / 2 + 120, -th / 2), (tw / 2, -th / 2), (tw / 2, th / 2), (-tw / 2 + 120, th / 2), (-tw / 2, 0)])
        c.drawPath(tag, glow((0, 0, 0), 40, 0.35))
        c.drawPath(tag, fill((255, 255, 255)))
        c.drawCircle(-tw / 2 + 110, 0, 26, fill(self.accent))
        c.drawLine(-tw / 2 + 110, 0, -tw / 2 + 60, -th, stroke((40, 40, 44), 5))
        ink = (24, 24, 28)
        if self.d.get("from"):
            of = fit(self.fonts["title"], self.d["from"], 110, tw * 0.6)
            text(c, self.d["from"], 60, -th * 0.12, of, (140, 140, 150))
            k = ease_io(clamp((t - 0.7) / 0.35))
            ow = of.measureText(self.d["from"])
            c.drawLine(60 - ow / 2 - 10, -th * 0.12 - of.getSize() * 0.3, 60 - ow / 2 - 10 + (ow + 20) * k,
                       -th * 0.12 - of.getSize() * 0.3 - 30 * k, stroke((230, 50, 60), 12))
        nf = fit(self.fonts["title"], self.d["to"], 190, tw * 0.62)
        kk = spring(max(t - 1.1, 0), 13, 6) if t > 1.1 else 0
        c.save()
        c.translate(60, th * 0.3)
        c.scale(kk, kk)
        text(c, self.d["to"], 0, 0, nf, ink)
        c.restore()
        c.restore()
        if self.d.get("label"):
            f = fit(self.fonts["title"], self.d["label"].upper(), 100, W * 0.88)
            k = expo_out(clamp((t - 0.3) / 0.4))
            text(c, self.d["label"].upper(), W / 2, H * 0.84 + 30 * (1 - k), f, self.on_accent, k)

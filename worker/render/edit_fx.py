"""Efeitos de "edição feita à mão" do motor genérico (o que faz quem assiste pensar que deu trabalho editar).

Por cena (scene["edit"], escolhido pelo roteiro):
- depth_title: o texto da tela fica ATRÁS da pessoa/objeto da foto (recorte U²-Net de render/cutout.py,
  acompanhando o zoom da câmera quadro a quadro). Só em cena de tela cheia com foto.
- subject_pop: no meio da cena o fundo perde a cor e escurece, a pessoa ganha contorno branco grosso e a
  tela dá um soco de zoom (congela a atenção no assunto). Só em cena de tela cheia com foto.

No vídeo todo (spec["edit"], ligado pelo estilo livre; fichas antigas não têm e ficam como antes):
- slam: palavra-chave batendo GRANDE na tela inteira no instante em que é falada (0,5 s)
- impact: começo de cada cena com soco de zoom e separação de cor (RGB) por alguns quadros

Tudo lê W/H/FPS de render.common na hora de desenhar.
"""
import math

import numpy as np
import skia
from PIL import Image, ImageFilter

from . import common as C
from . import mograph as mg
from .motion import clamp, expo_out

SCENE_EDITS = ("depth_title", "subject_pop")
EDIT_DEFAULT = {"slam": False, "impact": False}

SLAM_LEN = 0.55
SLAM_GAP = 3.2
POP_LEN = 0.9


def normalize_edit(raw):
    out = dict(EDIT_DEFAULT)
    if isinstance(raw, dict):
        for k in out:
            if isinstance(raw.get(k), bool):
                out[k] = raw[k]
    return out


def scene_edit(data):
    e = data.get("edit")
    return e if e in SCENE_EDITS else None


def subject_mask(img):
    """Máscara L do assunto principal, ou None (sem modelo, assunto minúsculo ou a imagem toda)."""
    try:
        from .cutout import object_mask
    except Exception:
        return None
    m = object_mask(img)
    if m is None:
        return None
    area = (np.asarray(m) > 128).mean()
    if not (0.05 <= area <= 0.8):
        return None
    return m


def depth_y(mask, landscape=False):
    """Altura (fração) do texto atrás do assunto: a faixa em que a pessoa cobre ~25% do texto (lê-se o
    texto e vê-se que está atrás dela); None se em toda altura a pessoa cobriria demais (aí o texto vai na frente)."""
    H, W = mask.shape
    best, score = 0.3, 9.0
    for y in (0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5) if not landscape else (0.3, 0.4, 0.5):
        band = mask[int(H * (y - 0.06)):int(H * (y + 0.06)), int(W * 0.2):int(W * 0.8)]
        cov = float(band.mean()) if band.size else 1.0
        d = abs(cov - 0.18) + (0.6 if cov > 0.32 else 0)
        if d < score:
            best, score = y, d
    return best if score < 0.6 else None


def depth_composite(fr_with_text, fr_before, mask):
    """Devolve o quadro com o texto atrás do assunto: onde a máscara é o assunto, volta o quadro sem texto."""
    m = mask[..., None]
    return (fr_with_text.astype(np.float32) * (1 - m) + fr_before.astype(np.float32) * m).astype(np.uint8)


def pop_strength(local, span):
    """0-1: quando o "congela no assunto" acontece (entra rápido, segura, sai)."""
    t0 = min(max(span * 0.3, 0.35), max(span - POP_LEN - 0.1, 0.2))
    u = (local - t0) / POP_LEN
    if u <= 0 or u >= 1:
        return 0.0
    return min(1.0, u / 0.15, (1 - u) / 0.25)


def subject_pop(fr, mask, k, accent):
    """Fundo sem cor e escuro, assunto com contorno branco grosso e um soco de zoom."""
    if k <= 0:
        return fr
    a = fr.astype(np.float32)
    gray = a.mean(axis=2, keepdims=True)
    bg = a * (1 - k) + (gray * 0.55) * k
    m = mask[..., None]
    out = bg * (1 - m) + a * m
    # contorno: máscara dilatada menos a máscara (calculado numa versão menor, rápido)
    h, w = mask.shape
    small = Image.fromarray((mask * 255).astype(np.uint8)).resize((w // 4, h // 4), Image.BILINEAR)
    grown = small.filter(ImageFilter.MaxFilter(5)).resize((w, h), Image.BILINEAR)
    ring = np.clip(np.asarray(grown, np.float32) / 255 - mask, 0, 1)[..., None] * k
    out = out * (1 - ring) + 255 * ring
    # sombra de cor de destaque atrás do contorno
    glow_small = small.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4)).resize((w, h), Image.BILINEAR)
    glow = np.clip(np.asarray(glow_small, np.float32) / 255 - np.asarray(grown, np.float32) / 255, 0, 1)[..., None] * k * 0.8
    out = out * (1 - glow) + np.array(accent, np.float32) * glow
    out = np.clip(out, 0, 255).astype(np.uint8)
    z = 1.0 + 0.045 * k
    if z > 1.002:
        H, W = out.shape[:2]
        cw, ch = int(W / z), int(H / z)
        x0, y0 = (W - cw) // 2, (H - ch) // 2
        out = np.asarray(Image.fromarray(out).crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.BILINEAR))
    return out


def impact(fr, local):
    """Começo da cena: soco de zoom + separação RGB que some em ~0,18 s."""
    if local >= 0.18:
        return fr
    k = (1 - local / 0.18) ** 2
    H, W = fr.shape[:2]
    z = 1.0 + 0.07 * k
    im = Image.fromarray(np.ascontiguousarray(fr))
    if z > 1.002:
        cw, ch = int(W / z), int(H / z)
        x0, y0 = (W - cw) // 2, (H - ch) // 2
        im = im.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.BILINEAR)
    a = np.asarray(im).copy()
    d = int(18 * k)
    if d > 0:
        a[:, d:, 0] = a[:, :-d, 0]
        a[:, :-d, 2] = a[:, d:, 2]
    return a


def slam_times(words, keys, norm, scenes, blocked, cta_start):
    """Instantes (início, palavra) das batidas de palavra-chave: uma a cada SLAM_GAP s no máximo,
    nunca em cena com grafismo de tela cheia/infográfico ou só texto (blocked = índices de cena).
    scene["slam"] (palavra da fala da cena, escolhida pelo roteiro) vale mais que as palavras-chave."""
    out, last = [], -99.0
    picked = []
    for sc in scenes:
        target = norm(str(sc.data.get("slam") or ""))
        if not target or sc.index in blocked:
            continue
        w = next((w for w in words if sc.start <= w[1] < sc.end and norm(w[0]) == target), None)
        if w is not None and w[1] < cta_start - 0.4:
            picked.append((w[1], w[0]))
    if picked:
        return sorted(picked)
    for w in words:
        if w[1] >= cta_start - 0.4 or norm(w[0]) not in keys:
            continue
        sc = next((s for s in scenes if s.start <= w[1] < s.end), None)
        if sc is None or sc.index in blocked or w[1] - last < SLAM_GAP:
            continue
        out.append((w[1], w[0]))
        last = w[1]
    return out


class Slam:
    def __init__(self, spec, fonts, hits):
        self.hits = hits
        self.font = fonts["title"]
        pal = spec["palette"]
        self.accent = mg._hex(pal["accent"])
        self.bg = mg._hex(pal["background"])
        self.text = mg._hex(pal["text"])
        self._fonts = {}

    def active(self, t):
        for t0, w in self.hits:
            if t0 <= t < t0 + SLAM_LEN:
                return t - t0, w
        return None

    def draw(self, fr, t):
        hit = self.active(t)
        if hit is None:
            return fr
        u, word = hit
        word = word.strip(".,!?:;\"'()").upper()
        if not word:
            return fr
        W, H = C.W, C.H
        fade = min(1.0, u / 0.06, (SLAM_LEN - u) / 0.12)
        a = fr.astype(np.float32)
        a = a * (1 - 0.72 * fade) + np.array(self.bg, np.float32) * 0.72 * fade
        fr = a.astype(np.uint8)
        key = word
        if key not in self._fonts:
            self._fonts[key] = mg.fit_font(self.font, word, H * (0.24 if not C.landscape() else 0.3), W * 0.86, 40)
        f = self._fonts[key]
        s = 1.0 + 0.35 * (1 - expo_out(u / 0.22))
        shake = (math.sin(u * 90) * 10 * (1 - clamp(u / 0.2)), math.cos(u * 70) * 8 * (1 - clamp(u / 0.2)))
        with mg.Canvas(fr) as c:
            if c is None:
                return fr
            c.save()
            c.translate(W / 2 + shake[0], H * 0.47 + shake[1])
            c.rotate(-5.0)
            c.scale(s, s * 1.5)  # esticada na vertical: cara de pôster
            base = f.getSize() * 0.36
            # sombra deslocada (cor do texto) + palavra na cor de destaque: cara de título de abertura
            mg.draw_text(c, word, 12, base + 8, f, self.text, alpha=0.9 * fade)
            mg.draw_text(c, word, 0, base, f, self.accent, alpha=fade)
            # traço de "marca-texto" passando embaixo
            wpx = mg.text_w(f, word)
            k = clamp((u - 0.08) / 0.2)
            if k > 0:
                y = base + f.getSize() * 0.18
                c.drawRect(skia.Rect(-wpx / 2, y, -wpx / 2 + wpx * k, y + 16),
                           skia.Paint(Color=mg.col(self.text, fade), AntiAlias=True))
            c.restore()
        return fr

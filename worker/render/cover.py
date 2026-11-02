"""Capa automática do vídeo: 9:16 (capa do Reels/Shorts) e 16:9 (thumbnail do YouTube).

Monta com PIL a partir de uma imagem de cena + o texto do gancho, na fonte e na cor de destaque
do estilo (ficha do motor genérico quando existe). Texto desenhado pelo código, nunca pela IA,
então a ortografia sai sempre certa.
"""
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .common import FONT_SANS, cover_resize, font

# fonte/cor de destaque dos estilos embutidos (os templates e o estilo livre trazem na ficha)
BUILTIN = {
    "editorial-pb-vermelho": {"accent": "#E10600", "accentText": "#FFFFFF", "bw": True},
    "estudio-serif-cinematico": {"accent": "#C9A227", "accentText": "#111111"},
    "papel-hera": {"accent": "#2F6B3A", "accentText": "#FFFFFF"},
}


def _rgb(hex_color, fallback=(225, 6, 0)):
    try:
        h = hex_color.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return fallback


def _style(job):
    """(caminho da fonte, cor de destaque, cor do texto no destaque, preto e branco?)"""
    spec = job.get("templateSpec") or None
    if spec:
        from .template_engine import FONTS, normalize_spec
        s = normalize_spec(spec)
        title = s.get("title") or {}
        path = FONTS.get(title.get("font")) or FONT_SANS
        # fonte manuscrita fica ilegível em miniatura: usa a sans pesada
        if title.get("font") in ("great-vibes", "allura"):
            path = FONT_SANS
        pal = s.get("palette") or {}
        return path, _rgb(pal.get("accent")), _rgb(pal.get("accentText"), (255, 255, 255)), False
    b = BUILTIN.get(job.get("patternId"), {})
    return FONT_SANS, _rgb(b.get("accent", "#E10600")), _rgb(b.get("accentText", "#FFFFFF"), (255, 255, 255)), b.get("bw", False)


def cover_text(script):
    """Texto curto da capa: o texto na tela da cena 1 (o gancho); senão o título."""
    scenes = script.get("scenes") or []
    t = (scenes[0].get("onScreen") if scenes else "") or script.get("title") or ""
    t = re.sub(r"\s+", " ", t).strip()
    words = t.split(" ")
    return " ".join(words[:7]) if len(words) > 7 else t


def _keyword(words, keywords):
    """Índice da palavra que ganha o destaque: uma das keywords do roteiro, senão a mais longa."""
    kws = {re.sub(r"\W", "", k).lower() for k in keywords or [] for k in k.split()}
    for i, w in enumerate(words):
        if re.sub(r"\W", "", w).lower() in kws:
            return i
    return max(range(len(words)), key=lambda i: len(re.sub(r"\W", "", words[i]))) if words else -1


def _wrap(words, fnt, max_w, draw):
    lines, cur = [], []
    for i, w in enumerate(words):
        test = " ".join(words[j] for j in cur + [i])
        if cur and draw.textlength(test, font=fnt) > max_w:
            lines.append(cur)
            cur = [i]
        else:
            cur.append(i)
    if cur:
        lines.append(cur)
    return lines


def _fit(words, font_path, max_w, max_lines, start, draw):
    size = start
    while size > 40:
        fnt = font(font_path, size)
        lines = _wrap(words, fnt, max_w, draw)
        if len(lines) <= max_lines and all(draw.textlength(w, font=fnt) <= max_w for w in words):
            return fnt, size, lines
        size -= 6
    fnt = font(font_path, size)
    return fnt, size, _wrap(words, fnt, max_w, draw)


def _draw_text(canvas, words, hl, fnt, size, lines, x, y_bottom, accent, accent_text, align_left=True, max_w=None):
    d = ImageDraw.Draw(canvas)
    lh = int(size * 1.08)
    pad = int(size * 0.14)
    y = y_bottom - lh * len(lines)
    for line in lines:
        cx = x
        if not align_left and max_w:
            lw = d.textlength(" ".join(words[i] for i in line), font=fnt)
            cx = x + (max_w - lw) / 2
        for i in line:
            w = words[i]
            tw = d.textlength(w, font=fnt)
            if i == hl:
                d.rectangle([cx - pad, y + int(size * 0.08), cx + tw + pad, y + lh - int(size * 0.02)], fill=accent)
                d.text((cx, y), w, font=fnt, fill=accent_text)
            else:
                # contorno leve para ler sobre qualquer foto
                d.text((cx, y), w, font=fnt, fill=(255, 255, 255), stroke_width=max(2, size // 28), stroke_fill=(0, 0, 0))
            cx += tw + d.textlength(" ", font=fnt)
        y += lh


def _gradient(size, direction, strength=0.88):
    w, h = size
    if direction == "bottom":
        ramp = np.clip((np.linspace(0, 1, h) - 0.42) / 0.58, 0, 1) ** 1.3 * strength
        a = np.repeat(ramp[:, None], w, 1)
    else:  # left
        ramp = np.clip(1 - np.linspace(0, 1, w) / 0.72, 0, 1) ** 1.2 * strength
        a = np.repeat(ramp[None, :], h, 0)
    return Image.fromarray((a * 255).astype(np.uint8), "L")


def make_covers(image_path, job, out_dir):
    """Gera capa_9x16.jpg (1080×1920) e capa_16x9.jpg (1280×720). Devolve os dois caminhos."""
    out_dir = Path(out_dir)
    script = job.get("script") or {}
    text = cover_text(script).upper()
    words = text.split()
    font_path, accent, accent_text, bw = _style(job)
    hl = _keyword(words, script.get("keywords"))
    src = Image.open(image_path).convert("RGB")
    if bw:
        src = src.convert("L").convert("RGB")
    outs = []

    # 9:16
    W, H = 1080, 1920
    base = cover_resize(src, W, H)
    base = base.crop(((base.width - W) // 2, (base.height - H) // 2, (base.width - W) // 2 + W, (base.height - H) // 2 + H))
    base = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), base, _gradient((W, H), "bottom"))
    if words:
        d = ImageDraw.Draw(base)
        fnt, size, lines = _fit(words, font_path, 940, 4, 160, d)
        d.rectangle([70, H - 250 - int(size * 1.08) * len(lines) - 40, 190, H - 250 - int(size * 1.08) * len(lines) - 26], fill=accent)
        _draw_text(base, words, hl, fnt, size, lines, 70, H - 230, accent, accent_text)
    p = out_dir / "capa_9x16.jpg"
    base.save(p, "JPEG", quality=90)
    outs.append(p)

    # 16:9: foto inteira à direita (com fundo desfocado), texto à esquerda
    W, H = 1280, 720
    bg = cover_resize(src, W, H)
    bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H))
    if src.height > src.width:  # foto vertical: desfoca o fundo e põe a foto à direita
        bg = bg.filter(ImageFilter.GaussianBlur(28))
        fg = src.copy()
        fg.thumbnail((W, H))
        bg.paste(fg, (W - fg.width - 40, (H - fg.height) // 2))
    bg = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), bg, _gradient((W, H), "left", 0.92))
    if words:
        d = ImageDraw.Draw(bg)
        fnt, size, lines = _fit(words, font_path, 700, 3, 132, d)
        block = int(size * 1.08) * len(lines)
        top = (H - block) // 2
        d.rectangle([60, top - 34, 170, top - 20], fill=accent)
        _draw_text(bg, words, hl, fnt, size, lines, 60, top + block, accent, accent_text)
    p = out_dir / "capa_16x9.jpg"
    bg.save(p, "JPEG", quality=90)
    outs.append(p)
    return outs

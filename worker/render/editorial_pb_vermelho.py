"""Padrão 1: Editorial P&B + Vermelho (videogen/padroes/01-editorial-pb-vermelho.md).

Genérico a partir do roteiro: uma imagem por cena (recorte P&B em papel quadriculado),
push-in contínuo, punch zoom + blur + flash no corte, aberração cromática, vinheta e grão;
legenda palavra por palavra (sans black em caixa alta, palavras-chave em caixa vermelha);
texto da tela da cena como etiqueta no topo; card final de CTA ("comenta PALAVRA" ou site).
"""
import math
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from . import motion as mo
from .common import FONT_SANS, FONT_SERIF, FPS, H, W, FrameWriter, asset, cover_resize, ease, font, grain_frames, norm, vignette
from .cutout import cut_object
from .timeline import build_timeline

USES_SCENE_IMAGES = True

RED = (225, 6, 0)
INK = (14, 14, 14)
PAPER = (245, 242, 234)
CAPTION_Y = 1390
MAX_LINE_W = 980


def _keyword_set(script):
    keys = set()
    for k in script.get("keywords") or []:
        for part in str(k).split():
            n = norm(part)
            if len(n) >= 2:
                keys.add(n)
    return keys


def _chunks(words, cta_start):
    chunks, cur = [], []
    for w in words:
        if w[1] >= cta_start - 0.1:
            break
        if cur and (len(" ".join(x[0] for x in cur + [w])) > 15 or len(cur) >= 3 or cur[-1][0][-1] in ".,?!;:"):
            chunks.append(cur)
            cur = []
        cur.append(w)
    if cur:
        chunks.append(cur)
    return chunks


def _word_img(word, keys, size=104):
    n = norm(word)
    txt = word.strip(".,;:!?…\"'()“”").upper()
    f = font(FONT_SANS, size)
    bb = f.getbbox(txt)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    key = n in keys
    pad = 22 if key else 6
    im = Image.new("RGBA", (tw + 2 * pad, int(size * 1.25) + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    oy = pad + (int(size * 1.25) - th) // 2 - bb[1]
    if key:
        d.rectangle([0, 6, im.width - 1, im.height - 7], fill=RED)
        d.text((pad - bb[0], oy), txt, font=f, fill=(255, 255, 255))
    else:
        d.text((pad - bb[0], oy), txt, font=f, fill=INK, stroke_width=5, stroke_fill=(255, 255, 255))
    return im


def _fit_font(path, text, max_w, start, minimum=40):
    size = start
    while size > minimum:
        f = font(path, size)
        bb = f.getbbox(text)
        if bb[2] - bb[0] <= max_w:
            return f
        size -= 6
    return font(path, minimum)


def _mostly_in(text, narration):
    a = re.sub(r"[^\w]+", " ", text.lower()).split()
    b = set(re.sub(r"[^\w]+", " ", narration.lower()).split())
    return bool(a) and sum(1 for x in a if x in b) / len(a) >= 0.6


def _cta_lines(cta):
    """Decide o layout do card final a partir do texto de CTA da tela."""
    text = (cta.get("onScreen") or cta.get("narration") or "").strip()
    m = re.match(r"^\s*comenta(?:r)?\s+[\"'“]?([^\"'”]+?)[\"'”]?\s*$", text, re.I)
    if m:
        return [("serif", "comenta"), ("box", m.group(1).strip().upper())]
    url = re.search(r"[\w.-]+\.(?:com|br|net|io|ai)(?:\.br)?\b", text, re.I)
    if url:
        rest = (text[: url.start()] + text[url.end():]).strip(" -–—:|·")
        lines = [("box", url.group(0).upper())]
        if rest:
            lines.append(("small", rest.upper()))
        return lines
    return [("box", text.upper())] if text else []


def render(job, assets, out_path, on_progress=None):
    """Renderiza o vídeo sem áudio em out_path. Devolve a duração em segundos."""
    script = job["script"]
    if mo.has_direction(script):
        return render_directed(job, assets, out_path, on_progress)
    tl = build_timeline(script, job.get("narrationWords"))
    keys = _keyword_set(script)
    narration_all = " ".join((s.get("narration") or "") for s in script.get("scenes") or [])

    # fundos por cena (imagem gerada ou papel liso se a geração falhou)
    bgs = {}
    for sc in tl.scenes:
        path = assets.get("images", {}).get(sc.index)
        if path:
            bgs[sc.index] = cover_resize(Image.open(path).convert("RGB"))
        else:
            bgs[sc.index] = Image.new("RGB", (W, H), PAPER)
    last_bg = bgs[tl.scenes[-1].index] if tl.scenes else Image.new("RGB", (W, H), PAPER)

    chunks = _chunks(tl.words, tl.cta_start)
    chunk_imgs = [[_word_img(w[0], keys) for w in c] for c in chunks]

    tags = {}
    for sc in tl.scenes:
        txt = (sc.data.get("onScreen") or "").strip()
        if txt and not _mostly_in(txt, sc.data.get("narration") or ""):
            tags[sc.index] = txt.upper()

    cta_lines = _cta_lines(script.get("cta") or {})
    VIG = vignette(0.55)
    GR = grain_frames()

    def bg_frame(t):
        if t >= tl.cta_start or not tl.scenes:
            im, s, e, first = last_bg, tl.cta_start, tl.duration, False
        else:
            sc = max((s for s in tl.scenes if s.start <= t), key=lambda s: s.start, default=tl.scenes[0])
            im, s, e, first = bgs[sc.index], sc.start, sc.end, sc is tl.scenes[0]
        p = (t - s) / max(e - s, 0.01)
        intro = 0.0 if first or t >= tl.cta_start else 1 - ease((t - s) / 0.32)
        zoom = 1.0 + 0.07 * p + 0.18 * intro
        cw, ch = im.width / zoom, im.height / zoom
        cx = min(max(im.width / 2 + 12 * math.sin(t * 0.7), cw / 2), im.width - cw / 2)
        cy = im.height / 2
        fr = im.resize((W, H), Image.BILINEAR, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))
        if intro * 10 > 0.4:
            fr = fr.filter(ImageFilter.GaussianBlur(10 * intro))
        return fr.convert("RGBA"), intro

    def caption(fr, t):
        for ci, c in enumerate(chunks):
            cs = c[0][1] - 0.05
            ce = (chunks[ci + 1][0][1] - 0.05) if ci + 1 < len(chunks) else tl.cta_start
            if not (cs <= t < ce):
                continue
            ims = chunk_imgs[ci]
            gap = 18
            tot = sum(i.width for i in ims) + gap * (len(ims) - 1)
            sc = min(1, MAX_LINE_W / tot)
            x = (W - tot * sc) / 2
            for w, im in zip(c, ims):
                dt = t - (w[1] - 0.04)
                if dt < 0:
                    x += (im.width + gap) * sc
                    continue
                s = sc * (1 + 0.35 * (1 - ease(dt / 0.14)))
                wi = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BILINEAR)
                if dt < 0.06:
                    wi.putalpha(wi.getchannel("A").point(lambda a, k=dt / 0.06: int(a * k)))
                fr.alpha_composite(wi, (int(x + im.width * sc / 2 - wi.width / 2), int(CAPTION_Y - wi.height / 2)))
                x += (im.width + gap) * sc

    def tag(fr, t):
        for sc in tl.scenes:
            if sc.index not in tags or not (sc.start <= t < sc.end):
                continue
            label = tags[sc.index]
            p = ease((t - sc.start) / 0.25)
            q = 1 - ease((t - (sc.end - 0.15)) / 0.15) if t > sc.end - 0.15 else 1
            al = int(255 * p * q)
            f = _fit_font(FONT_SANS, label, 900, 96)
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(lay)
            bb = f.getbbox(label)
            tw = bb[2] - bb[0]
            y = 170 - 60 * (1 - p)
            d.rectangle([(W - tw) / 2 - 36, y + bb[1] - 22, (W + tw) / 2 + 36, y + bb[3] + 22], fill=INK + (al,))
            d.text(((W - tw) / 2 - bb[0], y), label, font=f, fill=(255, 255, 255, al))
            fr.alpha_composite(lay)

    def cta(fr, t):
        st = tl.cta_start
        if t < st or not cta_lines:
            return
        a = ease((t - st) / 0.3)
        fr.alpha_composite(Image.new("RGBA", (W, H), (10, 10, 10, int(160 * a))))
        d = ImageDraw.Draw(fr)
        y = 760 if len(cta_lines) > 1 else 860
        for i, (kind, txt) in enumerate(cta_lines):
            at = st + 0.2 * i
            p = ease((t - at) / 0.25)
            if kind == "serif":
                f = font(FONT_SERIF, 140)
            elif kind == "small":
                f = _fit_font(FONT_SANS, txt, 900, 64)
            else:
                f = _fit_font(FONT_SANS, txt, 880, 200 if len(txt) <= 8 else 120)
            bb = f.getbbox(txt)
            tw = bb[2] - bb[0]
            if p > 0:
                yy = y + 40 * (1 - p)
                if kind == "box":
                    d.rectangle([(W - tw) / 2 - 34, yy + bb[1] - 26, (W + tw) / 2 + 34, yy + bb[3] + 26],
                                fill=RED + (int(255 * p),))
                d.text(((W - tw) / 2 - bb[0], yy), txt, font=f, fill=(255, 255, 255, int(255 * p)))
            y += (bb[3] - bb[1]) + (110 if kind == "box" else 70)

    def finish(fr, t, ab):
        a = np.asarray(fr.convert("RGB")).astype(np.float32)
        sh = int(2 + 14 * ab)
        a[..., 0] = np.roll(a[..., 0], sh, axis=1)
        a[..., 2] = np.roll(a[..., 2], -sh, axis=1)
        g = np.repeat(np.repeat(GR[int(t * FPS) % len(GR)], 2, 0), 2, 1)[..., None]
        a = a * VIG + g + 40 * ab ** 2
        return np.clip(a, 0, 255).astype(np.uint8)

    total = int(round(tl.duration * FPS))
    writer = FrameWriter(out_path)
    for n in range(total):
        t = n / FPS
        fr, ab = bg_frame(t)
        tag(fr, t)
        caption(fr, t)
        cta(fr, t)
        writer.write(finish(fr, t, ab))
        if on_progress and n % 30 == 0:
            on_progress(n / total)
    writer.close()
    return tl.duration


# ---------- versão com direção por cena (roteiros novos) ----------

def _scene_object(sc, path):
    """Objeto da cena: recorte da imagem gerada; foto do usuário (ou recorte que falhou) vira cartão."""
    im = Image.open(path).convert("RGB")
    if not sc.data.get("imageUrl"):
        cut = cut_object(im)
        if cut is not None:
            s = W / im.width
            bbox = cut.getchannel("A").getbbox()
            cy = min((bbox[1] + bbox[3]) / 2 * s, 1050)
            return mo.ObjectLayer(cut, ((bbox[0] + bbox[2]) / 2 * s, cy), scale=s * 0.92)
    return mo.ObjectLayer(mo.photo_card(im, 760, 900), (W / 2, 900), shadow=0.5)


def render_directed(job, assets, out_path, on_progress=None):
    """Objeto recortado sobre o papel (2,5D), corte/câmera/objeto/traço/ênfase por cena, molas."""
    script = job["script"]
    tl = build_timeline(script, job.get("narrationWords"))
    keys = _keyword_set(script)
    dirs = {sc.index: mo.direction_of(sc.data, sc.index) for sc in tl.scenes}

    plate = cover_resize(Image.open(asset("papel_grade.jpg")).convert("RGB"), int(W * 1.18), int(H * 1.18))
    PW, PH = plate.size
    objs = {}
    for sc in tl.scenes:
        path = assets.get("images", {}).get(sc.index)
        objs[sc.index] = _scene_object(sc, path) if path else None
    marks = mo.Marks(tl, keys, norm, dirs)

    chunks = _chunks(tl.words, tl.cta_start)
    chunk_imgs = [[_word_img(w[0], keys) for w in c] for c in chunks]
    cta_lines = _cta_lines(script.get("cta") or {})
    VIG = vignette(0.55)
    GR = grain_frames()
    last = tl.scenes[-1] if tl.scenes else None

    def scene_at(t):
        return max((s for s in tl.scenes if s.start <= t), key=lambda s: s.start, default=tl.scenes[0])

    def compose(sc, t, cta_mode=False):
        length = (tl.duration if cta_mode else sc.end) - sc.start
        u = t - sc.start
        d = dirs[sc.index]
        cam = mo.camera(d["camera"], u, length)
        z, cdx, cdy = cam
        bw, bh = W / z, H / z
        bx, by = (PW - bw) / 2 - cdx * 0.5, (PH - bh) / 2 - cdy * 0.5
        fr = plate.resize((W, H), Image.BILINEAR, box=(bx, by, bx + bw, by + bh)).convert("RGBA")
        o = objs[sc.index]
        if o is not None:
            box = o.draw(fr, d["object"], u, cam)
            if not cta_mode:
                marks.draw(fr, sc.index, t, box, o.base_box(), RED)
        return fr

    def caption(fr, t, shake):
        for ci, c in enumerate(chunks):
            cs = c[0][1] - 0.05
            ce = (chunks[ci + 1][0][1] - 0.05) if ci + 1 < len(chunks) else tl.cta_start
            if not (cs <= t < ce):
                continue
            ims = chunk_imgs[ci]
            gap = 18
            tot = sum(i.width for i in ims) + gap * (len(ims) - 1)
            scl = min(1, MAX_LINE_W / tot)
            x = (W - tot * scl) / 2
            for w, im in zip(c, ims):
                dt = t - (w[1] - 0.04)
                slot = im.width * scl
                if dt >= 0:
                    rot, frac = 0.0, 1.0
                    if norm(w[0]) in keys:
                        k, rot, frac, sh = mo.emphasis(dirs[scene_at(w[1]).index]["emphasis"], dt)
                        shake[0] = max(shake[0], sh)
                    else:
                        k = mo.word_pop(dt)
                    wi = mo.reveal_left(im, frac)
                    s = scl * k
                    wi = wi.resize((max(1, int(wi.width * s)), max(1, int(wi.height * s))), Image.BILINEAR)
                    if rot:
                        wi = wi.rotate(rot, Image.BILINEAR, expand=True)
                    if dt < 0.06 and frac >= 1:
                        wi.putalpha(wi.getchannel("A").point(lambda a, q=dt / 0.06: int(a * q)))
                    mo.paste(fr, wi, x + slot / 2 - wi.width / 2, CAPTION_Y - wi.height / 2)
                x += slot + gap * scl

    def cta(fr, t):
        st = tl.cta_start
        if t < st or not cta_lines:
            return
        a = mo.expo_out((t - st) / 0.3)
        fr.alpha_composite(Image.new("RGBA", (W, H), (10, 10, 10, int(165 * a))))
        y = 760 if len(cta_lines) > 1 else 860
        for i, (kind, txt) in enumerate(cta_lines):
            dt = t - (st + 0.15 + 0.2 * i)
            if kind == "serif":
                f = font(FONT_SERIF, 140)
            elif kind == "small":
                f = _fit_font(FONT_SANS, txt, 900, 64)
            else:
                f = _fit_font(FONT_SANS, txt, 880, 200 if len(txt) <= 8 else 120)
            bb = f.getbbox(txt)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
            if dt > 0:
                if kind == "box":
                    item = Image.new("RGBA", (tw + 70, th + 54), (0, 0, 0, 0))
                    d = ImageDraw.Draw(item)
                    d.rectangle([0, 0, int((tw + 68) * mo.expo_out(dt / 0.22)) + 1, th + 52], fill=RED + (255,))
                    d.text((34 - bb[0], 26 - bb[1]), txt, font=f, fill=(255, 255, 255, int(255 * mo.clamp(dt / 0.1))))
                    s, r = 1.35 - 0.35 * mo.spring(dt, 15, 6.5), -3 * (1 - mo.spring(dt, 13, 5))
                    yy = y - 26
                else:
                    item = Image.new("RGBA", (tw + 20, th + 20), (0, 0, 0, 0))
                    ImageDraw.Draw(item).text((10 - bb[0], 10 - bb[1]), txt, font=f, fill=(255, 255, 255, int(255 * mo.clamp(dt / 0.18))))
                    s, r = 1.0, 0.0
                    yy = y - 10 + 30 * (1 - mo.expo_out(dt / 0.3))
                im = item if s == 1.0 else item.resize((int(item.width * s), int(item.height * s)), Image.BILINEAR)
                if r:
                    im = im.rotate(r, Image.BILINEAR, expand=True)
                mo.paste(fr, im, (W - im.width) / 2, yy - (im.height - item.height) / 2)
            y += th + (130 if kind == "box" else 80)
        at = st + 0.9
        if t > at:  # seta desenhada apontando para os comentários
            y0 = y - 40
            shaft = [(W / 2 + 18 * math.sin(i / 5), y0 + 230 * i / 29) for i in range(30)]
            tip = shaft[-1]
            bob = 14 * math.sin((t - at) * 6) if t - at > 0.6 else 0
            paths = [shaft, [tip, (tip[0] - 50, tip[1] - 55)], [tip, (tip[0] + 50, tip[1] - 55)]]
            mo.draw_paths(fr, [[(px, py + bob) for px, py in p] for p in paths], mo.ease_io((t - at) / 0.5), RED, 14)

    def finish(fr, t, ab, shake, flash):
        a = np.asarray(fr.convert("RGB")).astype(np.float32)
        if shake > 0:
            a = np.roll(a, int(8 * shake * (1 if int(t * FPS) % 2 else -1)), axis=0)
        sh = int(2 + 14 * ab)
        a[..., 0] = np.roll(a[..., 0], sh, axis=1)
        a[..., 2] = np.roll(a[..., 2], -sh, axis=1)
        g = np.repeat(np.repeat(GR[int(t * FPS) % len(GR)], 2, 0), 2, 1)[..., None]
        a = a * VIG + g + 40 * ab ** 2 + 70 * flash
        return np.clip(a, 0, 255).astype(np.uint8)

    total = int(round(tl.duration * FPS))
    writer = FrameWriter(out_path)
    for n in range(total):
        t = n / FPS
        shake = [0.0]
        ab = flash = 0.0
        if t >= tl.cta_start and last is not None:
            fr = compose(last, t, cta_mode=True)
            fr = fr.filter(ImageFilter.GaussianBlur(3 * mo.clamp((t - tl.cta_start) / 0.4)))
        else:
            sc = scene_at(t)
            fr = compose(sc, t)
            if sc is not tl.scenes[0]:
                kind = dirs[sc.index]["cut"]
                fr, ab = mo.apply_cut(fr, kind, t - sc.start, PAPER)
                flash = mo.cut_flash(kind, t - sc.start)
        caption(fr, t, shake)
        cta(fr, t)
        writer.write(finish(fr, t, ab, shake[0], flash))
        if on_progress and n % 30 == 0:
            on_progress(n / total)
    writer.close()
    return tl.duration

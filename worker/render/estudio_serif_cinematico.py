"""Padrão 2: Estúdio Serif + Cinemático (videogen/padroes/02-estudio-serif-cinematico.md).

Cenas de estúdio (fundo cinza radial, estrelas 3D escuras nos cantos, objeto real flutuando no
centro) alternadas com cenas cinematográficas em tela cheia (Ken Burns com overlay escuro).
O tipo de cada cena é decidido pela própria imagem gerada: fundo claro e liso nos cantos =
estúdio; o resto = cinematográfica. Texto em Playfair Display Italic com pesos mistos (linha fina
+ linha black), revelado letra a letra com blur; palavras-chave em terracota. Dissolve curto ao
entrar/sair de cenas cinematográficas. CTA no estúdio com bolhas verde-limão.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .common import FPS, H, W, FrameWriter, asset, ease, font, grain_frames, group_lines, keyword_set, norm, spread_words
from .timeline import build_timeline

USES_SCENE_IMAGES = True

INK = (26, 26, 26)
WHITE = (255, 255, 255)
TERRA = (181, 84, 58)
LIME = (215, 234, 43)
FONT_THIN = asset("fonts", "playfair-display-latin-400-italic.woff")
FONT_BLACK = asset("fonts", "playfair-display-latin-900-italic.woff")
XF = 0.25  # dissolve


def _studio_bg():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rr = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H * 0.45) / (H * 0.6)) ** 2)
    return (244 - np.clip(rr, 0, 1.4) ** 1.5 * 40)[..., None].repeat(3, 2)


def _star():
    st = np.asarray(Image.open(asset("estrela.jpg")).convert("RGB")).astype(np.float32)
    al = np.clip((246 - st.mean(2)) / 30, 0, 1)
    st = st * 0.42 + 8  # "gunmetal"
    im = Image.fromarray(np.dstack([st, al * 255]).astype(np.uint8), "RGBA")
    return im.crop(im.getbbox())


STARS = [(1010, 120, 620, 10, 6, 0.0), (40, 1780, 820, -5, -4, 1.7), (1070, 1330, 240, 30, 9, 3.1)]


def _edge_patches(a, k=24):
    """Trechos no meio de cada borda (os cantos podem ter estrelas desenhadas pelo modelo)."""
    h, w = a.shape[:2]
    return [a[:k, w // 2 - k:w // 2 + k], a[h // 2 - k:h // 2 + k, :k], a[h // 2 - k:h // 2 + k, -k:],
            a[-k:, w // 2 - k:w // 2 + k]]


def _is_studio(im):
    a = np.asarray(im.convert("L").resize((256, 455))).astype(np.float32)
    patches = _edge_patches(a)
    means = [p.mean() for p in patches]
    return min(means) > 165 and np.std(means) < 22 and max(p.std() for p in patches) < 16


def _load_obj(im, w=820):
    """Recorta o centro (onde fica o objeto), normaliza o fundo para branco e suaviza as bordas
    do recorte, para aplicar em 'multiply' sobre o fundo de estúdio desenhado por código."""
    im = im.convert("RGB")
    im = im.crop((int(im.width * 0.1), int(im.height * 0.14), int(im.width * 0.9), int(im.height * 0.86)))
    a = np.asarray(im).astype(np.float32)
    ref = np.median(np.concatenate([p.reshape(-1, 3) for p in _edge_patches(a, 20)]), 0)
    a = np.clip(a / np.maximum(ref, 1) * 255, 0, 255)
    h, ww = a.shape[:2]
    fy = np.clip(np.minimum(np.arange(h), np.arange(h)[::-1]) / (h * 0.12), 0, 1)
    fx = np.clip(np.minimum(np.arange(ww), np.arange(ww)[::-1]) / (ww * 0.12), 0, 1)
    m = (fy[:, None] * fx[None, :])[..., None]
    a = a * m + 255 * (1 - m)
    o = Image.fromarray(a.astype(np.uint8))
    return o.resize((w, int(w * o.height / o.width)), Image.LANCZOS)


class Line:
    """Uma linha de texto revelada letra a letra (blur → nítido) seguindo o tempo de cada palavra."""

    def __init__(self, words, path, size, y, color, keys, shadow=False, max_w=960):
        f = font(path, size)
        sp = f.getlength(" ")
        tw = sum(f.getlength(w[0]) for w in words) + sp * (len(words) - 1)
        while tw > max_w and size > 40:
            size -= 6
            f = font(path, size)
            sp = f.getlength(" ")
            tw = sum(f.getlength(w[0]) for w in words) + sp * (len(words) - 1)
        asc, desc = f.getmetrics()
        im = Image.new("RGBA", (int(tw + 40), asc + desc + 30), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        x = 20
        self.spans = []
        for w in words:
            c = TERRA if norm(w[0]) in keys else color
            d.text((x, 12), w[0], font=f, fill=c)
            ww = f.getlength(w[0])
            self.spans.append((x, x + ww, w[1], w[2]))
            x += ww + sp
        if shadow:
            sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
            sh.putalpha(im.getchannel("A").point(lambda a: int(a * 0.85)))
            sh = sh.filter(ImageFilter.GaussianBlur(8))
            sh.alpha_composite(im)
            im = sh
        self.im = np.asarray(im).astype(np.float32)
        self.bl = np.asarray(im.filter(ImageFilter.GaussianBlur(9))).astype(np.float32)
        self.w, self.h = im.width, im.height
        self.x, self.y = int(W / 2 - im.width / 2), int(y)
        self.X = np.arange(self.w, dtype=np.float32)

    def head(self, t):
        h = -1e9
        for x0, x1, a, b in self.spans:
            if t >= a - 0.05:
                h = x0 + (x1 - x0) * min(1, (t - a + 0.05) / max(0.08, b - a))
        if t >= self.spans[-1][3] - 0.1:  # fala terminando: revela o resto da linha logo
            h = max(h, self.spans[-1][1] + (self.w + 120 - self.spans[-1][1]) * min(1, (t - self.spans[-1][3] + 0.1) / 0.15))
        return h

    def draw(self, fr, t, fade=1.0):
        hd = self.head(t)
        if hd < -100 or fade <= 0.01:
            return
        ms = np.clip((hd - 60 - self.X) / 50, 0, 1)[None, :, None]
        mb = np.clip((hd - self.X) / 40, 0, 1)[None, :, None]
        im = self.im * ms + self.bl * np.clip(mb - ms, 0, 1)
        if fade < 1:
            im = im * fade + self.bl * (1 - fade)
        a = im[..., 3:] * min(fade, 1) / 255
        rgb = np.where(a > 0, im[..., :3] / np.maximum(im[..., 3:] / 255, 1e-3), 0)
        out = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
        fr.alpha_composite(Image.fromarray(out, "RGBA"), (self.x, self.y))


def _blocks(words, start, end, y0, color, keys, shadow):
    """Linhas em blocos de até 2 (fina + black); cada bloco fica até o próximo começar."""
    lines = group_lines(words, max_chars=18, max_words=3)
    blocks = []
    for k in range(0, len(lines), 2):
        pair = lines[k:k + 2]
        objs, y = [], y0
        for j, ln in enumerate(pair):
            thin = j == 0 and len(pair) == 2
            obj = Line(ln, FONT_THIN if thin else FONT_BLACK, 90 if thin else 136, y, color, keys, shadow)
            objs.append(obj)
            y += obj.h - 10
        blocks.append([pair[0][0][1] - 0.05, None, objs])
    for i, b in enumerate(blocks):
        b[1] = blocks[i + 1][0] if i + 1 < len(blocks) else end
    if blocks:
        blocks[0][0] = max(start, blocks[0][0])
    return blocks


def render(job, assets, out_path, on_progress=None):
    script = job["script"]
    tl = build_timeline(script, job.get("narrationWords"))
    keys = keyword_set(script)
    STUDIO = _studio_bg()
    star = _star()
    star_cache = {sz: star.resize((sz, sz), Image.BILINEAR) for _, _, sz, *_ in STARS}

    segs = []  # dict(start, end, kind, img, blocks)
    for sc in tl.scenes:
        path = assets.get("images", {}).get(sc.index)
        img = Image.open(path).convert("RGB") if path else None
        kind = "studio" if img is None or _is_studio(img) else "cine"
        seg = {"start": sc.start, "end": sc.end, "kind": kind}
        if kind == "studio":
            seg["obj"] = _load_obj(img) if img is not None else None
            seg["blocks"] = _blocks(sc.words, sc.start, sc.end, 290, INK, keys, False)
        else:
            s = max(W / img.width, H / img.height) * 1.12
            seg["img"] = img.resize((int(img.width * s), int(img.height * s)), Image.LANCZOS)
            seg["blocks"] = _blocks(sc.words, sc.start, sc.end, 760, WHITE, keys, True)
        segs.append(seg)
    cta = script.get("cta") or {}
    cta_words = tl.cta_words or spread_words(cta.get("onScreen") or "", tl.cta_start + 0.2)
    if cta.get("onScreen") and tl.cta_words:
        # a tela mostra o texto do CTA (ex.: "Siga @perfil"), no ritmo da fala do CTA
        cta_words = spread_words(cta["onScreen"], tl.cta_words[0][1], max(0.6, tl.cta_words[-1][2] - tl.cta_words[0][1]))
    segs.append({"start": tl.cta_start, "end": tl.duration, "kind": "cta", "obj": None,
                 "blocks": _blocks(cta_words, tl.cta_start, tl.duration, 640, INK, keys, False)})

    def star_layer(t, lay):
        for cx, cy, sz, rot0, sp, ph in STARS:
            s = star_cache[sz].rotate(rot0 + sp * t, Image.BICUBIC)
            b = 4 + 4 * math.sin(t * 0.9 + ph)
            sh = Image.new("RGBA", s.size, (0, 0, 0, 0))
            sh.putalpha(s.getchannel("A").point(lambda a: int(a * 0.35)))
            sh = sh.filter(ImageFilter.GaussianBlur(18))
            s = s.filter(ImageFilter.GaussianBlur(max(0, b)))
            dx, dy = 12 * math.sin(t * 0.5 + ph), 10 * math.cos(t * 0.4 + ph)
            lay.alpha_composite(sh, (int(cx - sz / 2 + 25 + dx), int(cy - sz / 2 + 35 + dy)))
            lay.alpha_composite(s, (int(cx - sz / 2 + dx), int(cy - sz / 2 + dy)))

    def studio_frame(t, seg):
        base = STUDIO.copy()
        o = seg.get("obj")
        if o is not None:
            s0, s1 = seg["start"], seg["end"]
            p, q = ease((t - s0) / 0.45), ease((s1 - t) / 0.3)
            z = 1.12 - 0.12 * p + 0.03 * (t - s0)
            im = o.resize((int(o.width * z), int(o.height * z)), Image.BILINEAR).rotate(
                3 * math.sin(t * 1.1), Image.BICUBIC, fillcolor=(255, 255, 255))
            bl = 10 * (1 - p) + 8 * (1 - q)
            if bl > 0.3:
                im = im.filter(ImageFilter.GaussianBlur(bl))
            a = 1 - (1 - np.asarray(im).astype(np.float32) / 255) * min(p, q)
            x0 = W // 2 - im.width // 2
            y0 = int(1240 - im.height / 2 + 18 * math.sin(t * 1.3))
            ys, ye, xs, xe = max(0, y0), min(H, y0 + im.height), max(0, x0), min(W, x0 + im.width)
            if ye > ys and xe > xs:
                base[ys:ye, xs:xe] *= a[ys - y0:ye - y0, xs - x0:xe - x0]
        fr = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
        star_layer(t, fr)
        return fr

    def cine_frame(t, seg):
        im = seg["img"]
        p = (t - seg["start"]) / max(seg["end"] - seg["start"], 0.01)
        z = 1.0 + 0.08 * p
        cw, ch = im.width / 1.12 / z, im.height / 1.12 / z
        cx = im.width / 2 + im.width * 0.02 * (p - 0.5)
        cy = im.height / 2
        fr = im.resize((W, H), Image.BILINEAR, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))
        a = (np.asarray(fr).astype(np.float32) * 0.72).astype(np.uint8)
        return Image.fromarray(a).convert("RGBA")

    def blobs(fr, t, s0):
        d = ImageDraw.Draw(fr)
        for cx, cy, r, dl in [(770, 1690, 150, 0), (1080, 1560, 190, 0.15), (1000, 1900, 170, 0.25)]:
            q = ease((t - s0 - 0.2 - dl) / 0.6)
            rr = r * q
            if rr > 1:
                d.ellipse([cx - rr, cy - rr + 60 * (1 - q), cx + rr, cy + rr + 60 * (1 - q)], fill=LIME)

    def seg_frame(i, t):
        seg = segs[i]
        fr = cine_frame(t, seg) if seg["kind"] == "cine" else studio_frame(t, seg)
        if seg["kind"] == "cta":
            blobs(fr, t, seg["start"])
        last = i == len(segs) - 1
        for k, (b0, b1, lines) in enumerate(seg["blocks"]):
            if not (b0 - 0.1 <= t <= b1):
                continue
            final = last and k == len(seg["blocks"]) - 1
            fade = 1.0 if final else ease((b1 - t) / 0.28)
            for ln in lines:
                ln.draw(fr, t, fade)
        return fr

    GR = grain_frames(sigma=6, seed=2)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    VIG = np.clip(1 - 0.35 * np.clip(np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) - 0.6, 0, None) ** 1.5, 0, 1)[..., None]
    del yy, xx

    total = int(round(tl.duration * FPS))
    writer = FrameWriter(out_path)
    starts = [s["start"] for s in segs]
    for n in range(total):
        t = n / FPS
        i = max(j for j, s0 in enumerate(starts) if s0 <= t) if t >= starts[0] else 0
        a = np.asarray(seg_frame(i, t).convert("RGB")).astype(np.float32)
        if i > 0 and t - segs[i]["start"] < XF and "cine" in (segs[i]["kind"], segs[i - 1]["kind"]):
            k = (t - segs[i]["start"]) / XF
            b = np.asarray(seg_frame(i - 1, t).convert("RGB")).astype(np.float32)
            a = a * k + b * (1 - k)
        g = np.repeat(np.repeat(GR[n % len(GR)], 2, 0), 2, 1)[..., None]
        writer.write(np.clip(a * VIG + g, 0, 255).astype(np.uint8))
        if on_progress and n % 30 == 0:
            on_progress(n / total)
    writer.close()
    return tl.duration

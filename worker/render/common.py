"""Utilitários compartilhados pelos renderizadores (vindos de padroes/exemplos/5s/common.py)."""
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30

FONT_SANS = os.environ.get("VIDEOGEN_FONT_SANS", "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf")
FONT_SERIF = os.environ.get(
    "VIDEOGEN_FONT_SERIF", "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf"
)

_fc = {}


def font(path, size):
    key = (path, size)
    if key not in _fc:
        _fc[key] = ImageFont.truetype(path, size)
    return _fc[key]


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def norm(word):
    return word.lower().strip(".,;:!?…\"'()“”")


def cover_resize(im, w=W, h=H):
    """Redimensiona tipo 'cover' (preenche w×h mantendo proporção)."""
    s = max(w / im.width, h / im.height)
    return im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)


class FrameWriter:
    """Recebe quadros RGB (numpy uint8 H×W×3) e codifica com ffmpeg em H.264."""

    def __init__(self, out, crf=27):
        self.proc = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
             "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
             "-pix_fmt", "yuv420p", out],
            stdin=subprocess.PIPE,
        )

    def write(self, arr):
        self.proc.stdin.write(arr.tobytes())

    def close(self):
        self.proc.stdin.close()
        if self.proc.wait() != 0:
            raise RuntimeError("ffmpeg falhou ao codificar o vídeo")


def mix(video, narration, music, duration, out, music_vol=0.55):
    """Narração + trilha com ducking (sidechain) + loudnorm -14 LUFS, igual ao pipeline Python."""
    ins = ["-i", video]
    if narration:
        ins += ["-i", narration]
    ins += ["-stream_loop", "-1", "-i", music]
    mi = 2 if narration else 1
    fo = max(0.1, duration - 0.8)
    if narration:
        fc = (f"[1:a]aresample=44100,apad,atrim=0:{duration},asplit=2[v][sc];"
              f"[{mi}:a]aresample=44100,atrim=0:{duration},volume={music_vol},afade=t=in:d=0.2,"
              f"afade=t=out:st={fo}:d=0.8[m];"
              f"[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md];"
              f"[v][md]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5[a]")
    else:
        fc = (f"[{mi}:a]aresample=44100,atrim=0:{duration},afade=t=in:d=0.1,afade=t=out:st={fo}:d=0.8,"
              f"loudnorm=I=-14:TP=-1.5[a]")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "0:v", "-map", "[a]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
         "-movflags", "+faststart", "-t", str(duration), out],
        check=True,
    )


def vignette(strength=0.55):
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    return np.clip(1 - strength * np.clip(r - 0.55, 0, None) ** 1.6, 0, 1)[..., None].astype(np.float32)


def grain_frames(sigma=7, count=6, seed=1):
    rng = np.random.default_rng(seed)
    return [rng.normal(0, sigma, (H // 2, W // 2)).astype(np.float32) for _ in range(count)]


ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")


def asset(*parts):
    """Caminho de um arquivo em worker/assets (fontes OFL e imagens fixas dos padrões)."""
    return os.path.join(ASSETS, *parts)


def keyword_set(script):
    keys = set()
    for k in script.get("keywords") or []:
        for part in str(k).split():
            n = norm(part)
            if len(n) >= 2:
                keys.add(n)
    return keys


def group_lines(words, max_chars=16, max_words=3):
    """Agrupa palavras ([texto, início, fim]) em linhas curtas, quebrando também na pontuação."""
    lines, cur = [], []
    for w in words:
        if cur and (len(" ".join(x[0] for x in cur + [w])) > max_chars or len(cur) >= max_words
                    or cur[-1][0][-1] in ".,?!;:"):
            lines.append(cur)
            cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def spread_words(text, t0, span=0.8):
    """Palavras sem narração (ex.: CTA só na tela) com tempos espalhados a partir de t0."""
    parts = text.split()
    if not parts:
        return []
    step = span / len(parts)
    return [[p, t0 + i * step, t0 + (i + 1) * step] for i, p in enumerate(parts)]


def inter(weight="Regular"):
    """Outro peso da família Inter, na mesma pasta da fonte sans configurada (fonts-inter)."""
    d = os.path.dirname(FONT_SANS)
    p = os.path.join(d, f"Inter-{weight}.otf")
    return p if os.path.exists(p) else FONT_SANS


def ease_io(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def back(x, s=1.7):
    """Easing com leve 'passada' do ponto final (efeito pop)."""
    x = min(max(x, 0.0), 1.0) - 1
    return x * x * ((s + 1) * x + s) + 1


def text_img(txt, f, fill, stroke=0, stroke_fill=None, pad=8):
    bb = f.getbbox(txt)
    im = Image.new("RGBA", (bb[2] - bb[0] + 2 * pad + 2 * stroke, bb[3] - bb[1] + 2 * pad + 2 * stroke), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad + stroke - bb[0], pad + stroke - bb[1]), txt, font=f, fill=fill,
                            stroke_width=stroke, stroke_fill=stroke_fill)
    return im


def put(fr, im, cx, cy, alpha=1.0, scale=1.0, blur=0.0):
    """Cola um RGBA no quadro com centro (cx, cy), opacidade, escala e blur."""
    if alpha <= 0.003 or scale <= 0.01:
        return
    if scale != 1:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BILINEAR)
    if blur > 0.4:
        pad = int(blur * 3)
        big = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        big.paste(im, (pad, pad))
        im = big.filter(ImageFilter.GaussianBlur(blur))
    if alpha < 1:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda a: int(a * alpha)))
    x, y = int(cx - im.width / 2), int(cy - im.height / 2)
    if x >= 0 and y >= 0 and x + im.width <= fr.width and y + im.height <= fr.height:
        fr.alpha_composite(im, (x, y))
    else:
        lay = Image.new("RGBA", fr.size, (0, 0, 0, 0))
        lay.paste(im, (x, y), im)
        fr.alpha_composite(lay)


def fit_font(path, size, txt, max_w, min_size=40):
    f = font(path, size)
    while f.getlength(txt) > max_w and size > min_size:
        size -= 6
        f = font(path, size)
    return f


def split_cta(text):
    """Separa o texto do CTA em (marca/frase, site). O site é a palavra com ponto, se houver."""
    parts = (text or "").replace("\n", " ").split()
    url = next((p for p in parts if "." in p.strip(".") and len(p) > 4), None)
    rest = " ".join(p for p in parts if p != url)
    return rest, url

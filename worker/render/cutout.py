"""Recorte do objeto principal de uma imagem (máscara U²-Net via onnxruntime, sem rembg).

O modelo (~176 MB) é baixado na primeira vez para VIDEOGEN_MODELS_DIR (padrão worker/models).
Se onnxruntime não estiver instalado ou o download falhar, `cut_object()` devolve None e quem
chama segue sem recorte.
"""
import hashlib
import os
import threading
from pathlib import Path

import numpy as np
import requests
from PIL import Image

MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"
MODEL_MD5 = "60024c5c889badc19c04ad937298a77b"
MODELS_DIR = Path(os.environ.get("VIDEOGEN_MODELS_DIR", Path(__file__).resolve().parent.parent / "models"))

_lock = threading.Lock()
_session = None
_failed = False


def model_path():
    path = MODELS_DIR / "u2net.onnx"
    if path.exists():
        return path
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    md5 = hashlib.md5()
    with requests.get(MODEL_URL, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                md5.update(chunk)
    if md5.hexdigest() != MODEL_MD5:
        tmp.unlink(missing_ok=True)
        raise RuntimeError("modelo de recorte baixado com checksum errado")
    tmp.rename(path)
    return path


def _get_session():
    global _session, _failed
    with _lock:
        if _session is None and not _failed:
            try:
                import onnxruntime as ort

                opts = ort.SessionOptions()
                opts.intra_op_num_threads = max(1, (os.cpu_count() or 2) // 2)
                _session = ort.InferenceSession(str(model_path()), opts, providers=["CPUExecutionProvider"])
            except Exception as e:  # sem onnxruntime / sem rede: segue sem recorte
                print("recorte indisponível:", e, flush=True)
                _failed = True
        return _session


def object_mask(im):
    """Máscara L (0–255) do objeto principal, do tamanho da imagem; None se indisponível."""
    sess = _get_session()
    if sess is None:
        return None
    small = im.convert("RGB").resize((320, 320), Image.LANCZOS)
    a = np.asarray(small).astype(np.float32)
    a = a / max(a.max(), 1e-6)
    mean, std = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
    a = (a - mean) / std
    x = a.transpose(2, 0, 1)[None].astype(np.float32)
    with _lock:  # a sessão é usada por várias threads
        pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    pred = (pred - pred.min()) / max(pred.max() - pred.min(), 1e-6)
    return Image.fromarray((pred.clip(0, 1) * 255).astype("uint8"), "L").resize(im.size, Image.LANCZOS)


def cut_object(im, min_area=0.02, max_area=0.85):
    """RGBA só com o objeto, ou None quando o recorte não serve (sem modelo, objeto minúsculo ou a imagem toda)."""
    mask = object_mask(im)
    if mask is None:
        return None
    m = np.asarray(mask)
    area = (m > 128).mean()
    if not (min_area <= area <= max_area):
        return None
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out

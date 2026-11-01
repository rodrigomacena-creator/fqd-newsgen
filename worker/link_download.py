"""Baixa o vídeo de referência de um link do YouTube ou do Pinterest (yt-dlp), para montar
um template sem o usuário precisar subir o arquivo.

O YouTube costuma bloquear IP de datacenter (a VPS). Se o download falhar com bloqueio,
configure no .env do worker o mesmo proxy residencial do app (RESIDENTIAL_PROXY_HOST/PORT/
USER/PASSWORD) ou um VIDEOGEN_DOWNLOAD_PROXY (URL completa http://usuario:senha@host:porta).
"""
import os
import random
import re
from pathlib import Path
from urllib.parse import urlparse

import requests

MAX_FULL_S = 180  # vídeo maior que isso: baixa só o começo
CLIP_S = 120


def is_allowed(url):
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    # youtube.com, m.youtube.com, youtu.be, pinterest.com, br.pinterest.com, pinterest.com.br, pin.it
    return bool(re.search(r"(^|\.)(youtube\.com|youtu\.be|pin\.it)$", host) or re.search(r"(^|\.)pinterest\.(com(\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2})$", host))


def _proxy():
    explicit = os.environ.get("VIDEOGEN_DOWNLOAD_PROXY")
    if explicit:
        return explicit
    host, port = os.environ.get("RESIDENTIAL_PROXY_HOST"), os.environ.get("RESIDENTIAL_PROXY_PORT")
    user, pwd = os.environ.get("RESIDENTIAL_PROXY_USER"), os.environ.get("RESIDENTIAL_PROXY_PASSWORD")
    if host and port and user and pwd:
        return f"http://{user}-{random.randint(0, 999999)}:{pwd}@{host}:{port}"  # sessão aleatória = IP novo
    return None


def _expand(url):
    """pin.it é um encurtador: segue o redirecionamento até o pin de verdade."""
    if (urlparse(url).hostname or "").lower().endswith("pin.it"):
        try:
            r = requests.head(url, allow_redirects=True, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
            return r.url or url
        except requests.RequestException:
            return url
    return url


def _friendly(err):
    msg = re.sub(r"^ERROR:\s*", "", str(err)).split("; please report")[0]
    low = msg.lower()
    if "sign in to confirm" in low or "not a bot" in low or "429" in low:
        return ("O YouTube bloqueou o download a partir do servidor. Suba o arquivo do vídeo ou "
                "configure o proxy residencial no worker.")
    if "private" in low or "unavailable" in low:
        return "Esse vídeo é privado ou não está disponível."
    if "no video" in low or "unsupported url" in low or "no media" in low:
        return "Não encontrei vídeo nesse link (o pin pode ser só uma imagem)."
    return f"Não consegui baixar o vídeo do link: {msg[:300]}"


def download_link(url, out_path):
    """Baixa o vídeo (até 1080p, mp4) para out_path. Devolve (caminho, título)."""
    import yt_dlp
    from yt_dlp.utils import download_range_func

    if not is_allowed(url):
        raise RuntimeError("Só aceito links do YouTube ou do Pinterest.")
    url = _expand(url)
    out_path = Path(out_path)
    base = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
    }
    proxy = _proxy()
    if proxy:
        base["proxy"] = proxy

    try:
        with yt_dlp.YoutubeDL(base) as ydl:
            info = ydl.extract_info(url, download=False)
        if info.get("_type") == "playlist":
            entries = [e for e in (info.get("entries") or []) if e]
            if not entries:
                raise RuntimeError("no video")
            info = entries[0]
        if not info.get("duration") and not info.get("formats"):
            raise RuntimeError("no video")

        opts = dict(base)
        opts.update({
            "format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b",
            "merge_output_format": "mp4",
            "outtmpl": str(out_path.with_suffix("")) + ".%(ext)s",
        })
        duration = info.get("duration") or 0
        if duration > MAX_FULL_S:
            opts["download_ranges"] = download_range_func(None, [(0, CLIP_S)])
            opts["force_keyframes_at_cuts"] = True
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([info.get("webpage_url") or url])
    except RuntimeError as e:
        raise RuntimeError(_friendly(e)) from e
    except Exception as e:  # yt_dlp.utils.DownloadError e afins
        raise RuntimeError(_friendly(e)) from e

    got = sorted(out_path.parent.glob(out_path.stem + ".*"), key=lambda p: p.stat().st_size, reverse=True)
    got = [p for p in got if p.suffix.lower() in (".mp4", ".webm", ".mkv", ".mov")]
    if not got:
        raise RuntimeError("O download terminou sem arquivo de vídeo.")
    if got[0] != out_path:
        got[0].replace(out_path)
    return out_path, (info.get("title") or "").strip()

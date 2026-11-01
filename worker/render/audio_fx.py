"""Efeitos sonoros e batidas da trilha.

- detect_beats(): acha as batidas da trilha (envelope de ataques + autocorrelação), sem libs extras.
- sfx_cues(): onde cada efeito entra (whoosh nos cortes, impacto em palavras-chave, riser antes do CTA).
- build_sfx_track(): monta uma faixa só com todos os efeitos, que o mix() soma à narração e à trilha.
Os efeitos ficam em assets/sfx (gerados uma vez no ElevenLabs Sound Effects, sem custo por vídeo).
"""
import subprocess

import numpy as np

from .common import asset, keyword_set, norm

SR = 22050
HOP = 512


def _decode(path, seconds):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-t", str(seconds), "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(out.stdout, dtype=np.float32)


def detect_beats(path, duration):
    """Tempos (s) das batidas da trilha até `duration`. Lista vazia se não achar um pulso claro."""
    try:
        x = _decode(path, duration + 1)
    except Exception:
        return []
    if len(x) < SR * 3:
        return []
    n = len(x) // HOP
    frames = x[: n * HOP].reshape(n, HOP)
    energy = np.log1p(30 * np.sqrt((frames ** 2).mean(axis=1)))
    onset = np.maximum(np.diff(energy, prepend=energy[0]), 0)
    onset -= onset.mean()
    fps = SR / HOP
    lo, hi = int(fps * 60 / 180), int(fps * 60 / 70)  # 70-180 BPM
    ac = np.correlate(onset, onset, mode="full")[len(onset) - 1:]
    if hi >= len(ac) or ac[0] <= 0:
        return []
    lag = lo + int(np.argmax(ac[lo:hi]))
    if ac[lag] / ac[0] < 0.08:  # sem pulso claro (trilha ambiente): não força
        return []
    period = lag / fps
    # fase: deslocamento que mais coincide com ataques fortes
    best, best_phase = -1.0, 0
    for ph in range(lag):
        score = onset[ph::lag].sum()
        if score > best:
            best, best_phase = score, ph
    beats = np.arange(best_phase / fps, duration, period)
    return [round(float(b), 3) for b in beats]


SFX_VOL = {"whoosh": 0.32, "impact": 0.38, "riser": 0.28}  # bem abaixo da voz (picos ~8 dB menores)


def sfx_cues(tl, script):
    """[(segundos, arquivo, volume)] dos efeitos do vídeo."""
    cues = []
    whooshes = ["whoosh1", "whoosh2", "whoosh3"]
    for n, sc in enumerate(tl.scenes[1:]):
        cues.append((max(0.0, sc.start - 0.12), whooshes[n % 3], SFX_VOL["whoosh"]))
    # impacto no início (gancho) e em algumas palavras-chave, com folga entre eles
    cues.append((0.02, "impact1", SFX_VOL["impact"]))
    keys = keyword_set(script)
    last = 0.0
    cut_times = [sc.start for sc in tl.scenes]
    for w in tl.words:
        t = w[1]
        if t >= tl.cta_start - 0.3 or norm(w[0]) not in keys:
            continue
        if t - last < 2.2 or any(abs(t - c) < 0.35 for c in cut_times):
            continue
        cues.append((t, "impact2", SFX_VOL["impact"] * 0.8))
        last = t
    if tl.scenes and tl.cta_start > 2.5:
        cues.append((tl.cta_start - 2.0, "riser", SFX_VOL["riser"]))
        cues.append((tl.cta_start, "impact1", SFX_VOL["impact"]))
    return sorted(cues)


def build_sfx_track(cues, duration, out):
    """Faixa wav com todos os efeitos nos tempos certos (None se não houver efeito)."""
    cues = [c for c in cues if 0 <= c[0] < duration]
    if not cues:
        return None
    ins, parts = [], []
    for i, (t, name, vol) in enumerate(cues):
        ins += ["-i", asset("sfx", f"{name}.mp3")]
        ms = int(t * 1000)
        parts.append(f"[{i}:a]aresample=44100,volume={vol},adelay={ms}|{ms}[s{i}]")
    mixin = "".join(f"[s{i}]" for i in range(len(cues)))
    fc = ";".join(parts) + f";{mixin}amix=inputs={len(cues)}:normalize=0,atrim=0:{duration},apad=whole_dur={duration}[a]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "[a]", "-ac", "2", str(out)],
                   check=True)
    return out

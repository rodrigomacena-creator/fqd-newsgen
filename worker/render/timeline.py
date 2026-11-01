"""Converte o roteiro + tempos da narração em uma linha do tempo de cenas.

As palavras da narração (narrationWords, [palavra, início, fim]) seguem exatamente a ordem
do texto montado em fullNarration() no app: narração de cada cena e depois a do CTA, separadas
por espaço. Por isso cada cena "consome" len(narração.split()) palavras, e o corte da cena é
o início da primeira palavra dela (um pouco antes, para o corte cair junto da fala).
"""
from dataclasses import dataclass, field

LEAD = 0.08  # o corte acontece um pouco antes da palavra
# cortes na batida: o corte pode adiantar até SNAP_EARLY ou atrasar até SNAP_LATE para cair na batida da trilha
SNAP_EARLY = 0.22
SNAP_LATE = 0.10


def _snap(t, beats, floor):
    """Batida mais próxima de t dentro da janela (ou o próprio t). Nunca antes de floor."""
    best = None
    for b in beats:
        if t - SNAP_EARLY <= b <= t + SNAP_LATE and b >= floor and (best is None or abs(b - t) < abs(best - t)):
            best = b
    return best if best is not None else t
CTA_HOLD = 1.8  # tempo mínimo do card de CTA na tela
TAIL = 0.8  # respiro depois da última palavra


@dataclass
class Scene:
    index: int
    start: float
    end: float
    data: dict
    words: list = field(default_factory=list)  # [palavra, início, fim]


@dataclass
class Timeline:
    scenes: list
    cta_start: float
    cta_words: list
    duration: float
    words: list  # todas as palavras, na ordem


def build_timeline(script, words):
    words = [list(w) for w in (words or [])]
    # "_beats": batidas da trilha (s), postas pelo worker depois de gerar a música
    beats = [float(b) for b in (script.get("_beats") or [])]
    scenes_data = script.get("scenes") or []
    cta = script.get("cta") or {}
    pos = 0
    t = 0.0
    scenes = []
    for i, sc in enumerate(scenes_data):
        n = len((sc.get("narration") or "").split())
        own = words[pos:pos + n]
        pos += n
        if own:
            start = 0.0 if i == 0 else max(0.0, own[0][1] - LEAD)
        else:
            start = t
        start = max(start, t)  # nunca volta no tempo
        if i > 0 and beats:
            start = _snap(start, beats, t + 0.35)
        scenes.append(Scene(index=i, start=start, end=start, data=sc, words=own))
        t = start if own else start + float(sc.get("durationS") or 2)

    cta_words = words[pos:]
    last_end = words[-1][2] if words else t
    if cta_words:
        cta_start = max(t, cta_words[0][1] - LEAD)
    else:
        cta_start = max(t, last_end + 0.2)
    if beats:
        cta_start = _snap(cta_start, beats, t + 0.35)
    duration = round(max(last_end + TAIL, cta_start + CTA_HOLD), 2)

    for i, sc in enumerate(scenes):
        sc.end = scenes[i + 1].start if i + 1 < len(scenes) else cta_start
    # cenas sem duração (duas cenas começando no mesmo instante) somem da linha do tempo
    scenes = [s for s in scenes if s.end - s.start > 0.05]
    return Timeline(scenes=scenes, cta_start=cta_start, cta_words=cta_words, duration=duration, words=words)

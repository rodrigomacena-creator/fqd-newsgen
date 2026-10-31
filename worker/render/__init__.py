"""Renderizadores por padrão. Cada módulo expõe:
- render(job, assets, out_path, on_progress) -> duração em segundos
- USES_SCENE_IMAGES: se precisa de uma imagem gerada por cena (alguns padrões têm fundo fixo).
"""
from . import editorial_pb_vermelho, estudio_serif_cinematico, icones_em_azul, metafora_escultura_3d, papel_hera

RENDERERS = {
    "editorial-pb-vermelho": editorial_pb_vermelho,
    "estudio-serif-cinematico": estudio_serif_cinematico,
    "papel-hera": papel_hera,
    "metafora-escultura-3d": metafora_escultura_3d,
    "icones-em-azul": icones_em_azul,
}

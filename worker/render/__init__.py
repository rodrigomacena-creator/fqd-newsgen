"""Renderizadores por padrão. Cada módulo expõe render(job, assets, out_path, on_progress)."""
from . import editorial_pb_vermelho

RENDERERS = {
    "editorial-pb-vermelho": editorial_pb_vermelho.render,
}

export const EMBED_MAX_WIDTH = 770;

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * HTML do player pro WordPress: caixa de até 770px que encolhe junto com a tela, mantendo
 * 16:9 (o truque do padding-bottom funciona em qualquer tema, sem depender de aspect-ratio).
 */
export function videoEmbedHtml(videoId: string): string {
  return (
    `<div style="max-width:${EMBED_MAX_WIDTH}px;width:100%;margin:24px auto 0;">` +
    `<div style="position:relative;width:100%;height:0;padding-bottom:56.25%;overflow:hidden;border-radius:12px;">` +
    `<iframe src="${youtubeEmbedUrl(videoId)}" title="Vídeo de referência" ` +
    `style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" ` +
    `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
    `allowfullscreen loading="lazy"></iframe></div></div>`
  );
}

import { del, list } from "@vercel/blob";

function isOwnedBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/**
 * Remove um único blob (ex.: imagem de capa, styleguide). Não faz nada se a
 * URL não for um blob nosso (ex.: fallback de thumbnail do YouTube).
 */
export async function deleteBlobIfOwned(url: string | null | undefined) {
  if (!url || !isOwnedBlobUrl(url)) return;
  try {
    await del(url);
  } catch {
    // já não existe — ignora
  }
}

/**
 * Remove todos os blobs sob um prefixo (ex.: todas as imagens de um artigo),
 * equivalente ao antigo "apagar a pasta inteira".
 */
export async function deleteBlobsByPrefix(prefix: string) {
  try {
    const { blobs } = await list({ prefix });
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url));
    }
  } catch {
    // nada pra apagar ou já removido — ignora
  }
}

// Vídeo de banco gratuito para cenas do estilo livre que pedem filmagem real.
// A cena traz stockQuery (em inglês, escrito pela IA); aqui escolhemos um clipe e guardamos em
// scene.stock. O worker baixa o mp4 e usa no lugar da imagem parada (recorta o centro se for horizontal).
// Fontes: Pixabay (PIXABAY_API_KEY, a principal) e Pexels (PEXELS_API_KEY, se um dia houver chave).
import type { VideoScene } from "./types";

type Stock = NonNullable<VideoScene["stock"]>;

/** Hosts de onde o worker pode baixar um clipe (normalizeScript só aceita estes). */
export const STOCK_URL_RE = /^https:\/\/([a-z0-9-]+\.)*(pixabay\.com|pexels\.com)\//i;

export function stockEnabled(): boolean {
  return Boolean(process.env.PIXABAY_API_KEY || process.env.PEXELS_API_KEY);
}

interface Candidate {
  url: string;
  thumb: string;
  id: number;
  width: number;
  height: number;
  duration: number;
}

/** Vertical primeiro (perto de 1920 de altura); horizontal só se tiver ao menos 1080 de altura. */
function rank(c: Candidate): number {
  const portrait = c.height > c.width;
  if (portrait && c.height >= 1280) return Math.abs(c.height - 1920);
  if (!portrait && c.height >= 1080) return 10_000 + Math.abs(c.height - 1080);
  return Infinity;
}

async function searchPixabay(query: string): Promise<Candidate[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const url = `https://pixabay.com/api/videos/?${new URLSearchParams({
    key,
    q: query.slice(0, 100),
    video_type: "film",
    safesearch: "true",
    per_page: "30",
  })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Pixabay respondeu HTTP ${res.status}`);
  type Size = { url: string; width: number; height: number; thumbnail?: string };
  const data = (await res.json()) as { hits?: { id: number; duration: number; videos: Record<string, Size> }[] };
  return (data.hits ?? []).flatMap((h) => {
    const sizes = ["large", "medium"].map((k) => h.videos?.[k]).filter((s): s is Size => Boolean(s?.url));
    const best = sizes.map((s) => ({ s, r: rank({ ...s, thumb: "", id: 0, duration: 0 }) })).sort((a, b) => a.r - b.r)[0];
    if (!best || best.r === Infinity) return [];
    const thumb = h.videos?.medium?.thumbnail || h.videos?.small?.thumbnail || "";
    return [{ url: best.s.url, thumb, id: h.id, width: best.s.width, height: best.s.height, duration: h.duration }];
  });
}

async function searchPexels(query: string): Promise<Candidate[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const url = `https://api.pexels.com/videos/search?${new URLSearchParams({
    query,
    orientation: "portrait",
    size: "medium",
    per_page: "15",
  })}`;
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Pexels respondeu HTTP ${res.status}`);
  type File = { link: string; width: number; height: number; file_type: string };
  const data = (await res.json()) as { videos?: { id: number; duration: number; image: string; video_files: File[] }[] };
  return (data.videos ?? []).flatMap((v) => {
    const files = v.video_files
      .filter((f) => f.file_type === "video/mp4")
      .map((f) => ({ url: f.link, thumb: v.image, id: v.id, width: f.width, height: f.height, duration: v.duration }));
    const best = files.sort((a, b) => rank(a) - rank(b))[0];
    return best && rank(best) !== Infinity ? [best] : [];
  });
}

/** Procura um clipe; `skip` pula resultados (para "trocar vídeo"). Verticais vêm antes dos horizontais. */
export async function findStockVideo(query: string, minSeconds: number, skip = 0): Promise<Stock | null> {
  const q = query.trim();
  if (!q || !stockEnabled()) return null;
  const sources: [Stock["source"], (q: string) => Promise<Candidate[]>][] = [
    ["pixabay", searchPixabay],
    ["pexels", searchPexels],
  ];
  let lastError: unknown = null;
  for (const [source, search] of sources) {
    let found: Candidate[] = [];
    try {
      found = await search(q);
    } catch (err) {
      lastError = err;
      continue;
    }
    const list = found.filter((c) => c.duration >= Math.min(minSeconds, 6)).sort((a, b) => rank(a) - rank(b));
    if (!list.length) continue;
    const pick = skip % list.length;
    const c = list[pick];
    return { url: c.url, thumb: c.thumb, id: c.id, query: q, pick, source };
  }
  if (lastError) throw lastError;
  return null;
}

/** Preenche scene.stock nas cenas com stockQuery que ainda não têm clipe (falha = segue com imagem). */
export async function attachStockVideos(scenes: VideoScene[]): Promise<{ scenes: VideoScene[]; changed: boolean }> {
  if (!stockEnabled()) return { scenes, changed: false };
  let changed = false;
  const out = await Promise.all(
    scenes.map(async (sc) => {
      if (!sc.stockQuery || sc.imageUrl || sc.layout === "text_only" || (sc.stock && sc.stock.query === sc.stockQuery)) return sc;
      try {
        const stock = await findStockVideo(sc.stockQuery, sc.durationS || 3);
        if (!stock) return sc;
        changed = true;
        return { ...sc, stock };
      } catch (err) {
        console.error("Vídeo de banco:", err);
        return sc;
      }
    })
  );
  return { scenes: out, changed };
}

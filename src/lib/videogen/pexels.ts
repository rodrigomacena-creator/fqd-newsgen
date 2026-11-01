// Vídeo de banco (Pexels, gratuito) para cenas do estilo livre que pedem filmagem real.
// A cena traz stockQuery (em inglês, escrito pela IA); aqui escolhemos um clipe vertical e
// guardamos em scene.stock. O worker baixa o mp4 e usa no lugar da imagem parada.
import type { VideoScene } from "./types";

export function pexelsEnabled(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

interface PexelsFile {
  link: string;
  width: number;
  height: number;
  file_type: string;
}
interface PexelsVideo {
  id: number;
  duration: number;
  image: string;
  video_files: PexelsFile[];
}

/** Melhor arquivo vertical perto de 1080x1920 (sem baixar 4K à toa). */
function pickFile(v: PexelsVideo): PexelsFile | null {
  const files = v.video_files.filter((f) => f.file_type === "video/mp4" && f.height > f.width && f.height >= 1280);
  files.sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
  return files[0] ?? null;
}

/** Procura um clipe vertical; `skip` pula resultados (para "trocar vídeo"). */
export async function findStockVideo(query: string, minSeconds: number, skip = 0): Promise<VideoScene["stock"] | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return null;
  const url = `https://api.pexels.com/videos/search?${new URLSearchParams({
    query: query.trim(),
    orientation: "portrait",
    size: "medium",
    per_page: "15",
  })}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels respondeu HTTP ${res.status}`);
  const data = (await res.json()) as { videos?: PexelsVideo[] };
  const candidates = (data.videos ?? [])
    .filter((v) => v.duration >= Math.min(minSeconds, 6))
    .map((v) => ({ v, f: pickFile(v) }))
    .filter((c): c is { v: PexelsVideo; f: PexelsFile } => Boolean(c.f));
  if (!candidates.length) return null;
  const { v, f } = candidates[skip % candidates.length];
  return { url: f.link, thumb: v.image, id: v.id, query: query.trim(), pick: skip % candidates.length };
}

/** Preenche scene.stock nas cenas com stockQuery que ainda não têm clipe (falha = segue com imagem). */
export async function attachStockVideos(scenes: VideoScene[]): Promise<{ scenes: VideoScene[]; changed: boolean }> {
  if (!pexelsEnabled()) return { scenes, changed: false };
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
        console.error("Pexels:", err);
        return sc;
      }
    })
  );
  return { scenes: out, changed };
}

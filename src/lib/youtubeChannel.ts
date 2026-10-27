export class YoutubeChannelError extends Error {
  constructor(message: string, readonly reason?: string) {
    super(message);
  }
}

const API_BASE = "https://www.googleapis.com/youtube/v3";

type ChannelRef =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string }
  | { kind: "custom"; value: string }
  | { kind: "playlist"; value: string };

function parseChannelUrl(input: string): ChannelRef {
  const raw = input.trim();
  if (/^(PL|UU|FL|OL|LL)[\w-]{10,}$/.test(raw)) return { kind: "playlist", value: raw };
  if (/^UC[\w-]{22}$/.test(raw)) return { kind: "id", value: raw };
  if (/^@[\w.-]+$/.test(raw)) return { kind: "handle", value: raw };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new YoutubeChannelError("URL de canal inválida.");
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) {
    throw new YoutubeChannelError("Informe a URL de um canal do YouTube.");
  }

  // Qualquer URL com ?list= (playlist, ou vídeo dentro de uma playlist) vale como playlist.
  const listId = url.searchParams.get("list");
  if (listId) return { kind: "playlist", value: listId };

  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (first?.startsWith("@")) return { kind: "handle", value: decodeURIComponent(first) };
  if (first === "channel" && second) return { kind: "id", value: second };
  if (first === "user" && second) return { kind: "username", value: second };
  if (first === "c" && second) return { kind: "custom", value: decodeURIComponent(second) };

  throw new YoutubeChannelError(
    "Não reconheci essa URL. Use youtube.com/@canal, youtube.com/channel/UC… ou youtube.com/playlist?list=…",
  );
}

async function youtubeApi<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YoutubeChannelError(
      "YOUTUBE_API_KEY não configurada no .env (necessária para listar vídeos de um canal).",
    );
  }

  const query = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API_BASE}/${path}?${query}`);
  const data = await res.json();
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") {
      throw new YoutubeChannelError("Cota diária da YouTube Data API esgotada. Tente amanhã.");
    }
    throw new YoutubeChannelError(data?.error?.message ?? "Erro ao consultar a API do YouTube.", reason);
  }
  return data as T;
}

type ChannelsResponse = {
  items?: {
    id: string;
    snippet?: { title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }[];
};

async function resolveChannel(ref: ChannelRef) {
  const base = { part: "snippet,contentDetails" };
  let data: ChannelsResponse;

  if (ref.kind === "id") data = await youtubeApi("channels", { ...base, id: ref.value });
  else if (ref.kind === "handle") data = await youtubeApi("channels", { ...base, forHandle: ref.value });
  else if (ref.kind === "username") data = await youtubeApi("channels", { ...base, forUsername: ref.value });
  else {
    // URLs antigas /c/Nome não têm lookup direto: tenta como handle e cai pra busca.
    data = await youtubeApi("channels", { ...base, forHandle: `@${ref.value}` });
    if (!data.items?.length) {
      const search = await youtubeApi<{ items?: { id?: { channelId?: string } }[] }>("search", {
        part: "snippet",
        type: "channel",
        maxResults: "1",
        q: ref.value,
      });
      const channelId = search.items?.[0]?.id?.channelId;
      if (channelId) data = await youtubeApi("channels", { ...base, id: channelId });
    }
  }

  const channel = data.items?.[0];
  const uploads = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!channel || !uploads) throw new YoutubeChannelError("Canal não encontrado.");
  return { title: channel.snippet?.title ?? "", uploadsPlaylistId: uploads };
}

type PlaylistResponse = {
  nextPageToken?: string;
  items?: { snippet?: { title?: string }; contentDetails?: { videoId?: string } }[];
};

export type ChannelVideo = { id: string; url: string; title: string };

/**
 * Lista a URL dos vídeos públicos do canal, sem os Shorts. O YouTube mantém playlists
 * automáticas por tipo a partir da de uploads ("UU…"): "UULF…" = vídeos longos, "UULV…" =
 * transmissões ao vivo, "UUSH…" = Shorts (ignorada de propósito). Canal sem nenhum vídeo de
 * um tipo não tem a playlist (404), o que é tratado como lista vazia.
 */
export async function listChannelVideoUrls(channelUrl: string) {
  const ref = parseChannelUrl(channelUrl);
  if (ref.kind === "playlist") return listPlaylist(ref.value);

  const { title, uploadsPlaylistId } = await resolveChannel(ref);
  const suffix = uploadsPlaylistId.slice(2);

  const byId = new Map<string, ChannelVideo>();
  for (const playlistId of [`UULF${suffix}`, `UULV${suffix}`]) {
    for (const video of await listPlaylistVideos(playlistId)) byId.set(video.id, video);
  }

  const videos = [...byId.values()];
  return { channelTitle: title, videos, urls: videos.map((v) => v.url) };
}

/** Lista todos os vídeos de uma playlist (inclui Shorts, se a playlist tiver). */
async function listPlaylist(playlistId: string) {
  let title = "";
  try {
    const info = await youtubeApi<{ items?: { snippet?: { title?: string } }[] }>("playlists", {
      part: "snippet",
      id: playlistId,
    });
    if (!info.items?.length) throw new YoutubeChannelError("Playlist não encontrada.");
    title = info.items[0].snippet?.title ?? "";
  } catch (error) {
    if (error instanceof YoutubeChannelError && error.reason === "playlistNotFound") {
      throw new YoutubeChannelError("Playlist não encontrada ou privada.");
    }
    throw error;
  }

  const videos = await listPlaylistVideos(playlistId);
  return { channelTitle: title, videos, urls: videos.map((v) => v.url) };
}

async function listPlaylistVideos(playlistId: string): Promise<ChannelVideo[]> {
  const videos: ChannelVideo[] = [];
  let pageToken: string | undefined;
  do {
    let page: PlaylistResponse;
    try {
      page = await youtubeApi("playlistItems", {
        part: "snippet,contentDetails",
        playlistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      });
    } catch (error) {
      if (error instanceof YoutubeChannelError && error.reason === "playlistNotFound") return videos;
      throw error;
    }
    for (const item of page.items ?? []) {
      const id = item.contentDetails?.videoId;
      const itemTitle = item.snippet?.title;
      if (id && itemTitle !== "Private video" && itemTitle !== "Deleted video") {
        videos.push({
          id,
          url: `https://www.youtube.com/watch?v=${id}`,
          title: item.snippet?.title ?? id,
        });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return videos;
}

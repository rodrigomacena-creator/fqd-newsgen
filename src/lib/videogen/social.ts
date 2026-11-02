/**
 * Publicação dos vídeos do VideoGen no YouTube (Shorts) e no Instagram (Reels).
 *
 * YouTube: OAuth do Google (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET), escopo youtube.upload. Upload
 * "resumable" feito pela própria função da Vercel (baixa o mp4 do Blob e envia). Agendamento é
 * nativo do YouTube (privacyStatus "private" + publishAt).
 *
 * Instagram: "Instagram API com login do Instagram" (INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET), conta
 * profissional (Criador ou Empresa), escopos instagram_business_basic + instagram_business_content_publish.
 * Publicar um Reel tem 3 passos: criar o contêiner (o Instagram baixa o mp4 da URL pública do Blob),
 * esperar o processamento (status FINISHED) e publicar. Como o processamento demora, cada passo é feito
 * por advancePublication(), chamado pela tela (enquanto aberta) e pelo worker (publish-tick), que também
 * publica os agendados quando a hora chega.
 */
import { prisma } from "@/lib/prisma";
import type { SocialAccount, VideoPublication } from "@/generated/prisma/client";

export type Platform = "youtube" | "instagram";
export const PLATFORMS: Platform[] = ["youtube", "instagram"];

const IG_API = "https://graph.instagram.com/v23.0";

export function platformConfigured(p: Platform): boolean {
  return p === "youtube"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export function callbackUrl(origin: string, p: Platform) {
  return `${origin}/api/videogen/social/${p}/callback`;
}

export function authUrl(p: Platform, origin: string, state: string): string {
  if (p === "youtube") {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl(origin, p),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent", // garante o refresh_token
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: callbackUrl(origin, p),
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish",
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

async function json<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const err = (data as { error?: { message?: string } | string; error_description?: string } | null) ?? null;
    const msg =
      (typeof err?.error === "object" ? err?.error?.message : undefined) ||
      err?.error_description ||
      (typeof err?.error === "string" ? err.error : undefined) ||
      text.slice(0, 300);
    throw new Error(`${what}: HTTP ${res.status} ${msg}`);
  }
  return data as T;
}

/** Troca o código do OAuth pelos tokens e grava a conta. */
export async function connectAccount(p: Platform, origin: string, code: string): Promise<SocialAccount> {
  if (p === "youtube") {
    const tok = await json<{ access_token: string; refresh_token?: string; expires_in: number }>(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callbackUrl(origin, p),
          grant_type: "authorization_code",
        }),
      }),
      "Google (token)",
    );
    if (!tok.refresh_token) throw new Error("O Google não devolveu o refresh token. Remova o acesso do app na sua conta Google e conecte de novo.");
    const ch = await json<{ items?: { id: string; snippet: { title: string } }[] }>(
      await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      }),
      "YouTube (canal)",
    );
    const channel = ch.items?.[0];
    if (!channel) throw new Error("Essa conta Google não tem canal no YouTube.");
    const data = {
      accountId: channel.id,
      accountName: channel.snippet.title,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + (tok.expires_in - 60) * 1000),
    };
    return prisma.socialAccount.upsert({ where: { platform: p }, create: { platform: p, ...data }, update: data });
  }

  const short = await json<{ access_token: string; user_id: number | string }>(
    await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID!,
        client_secret: process.env.INSTAGRAM_APP_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(origin, p),
        code,
      }),
    }),
    "Instagram (token)",
  );
  const long = await json<{ access_token: string; expires_in: number }>(
    await fetch(
      `https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: process.env.INSTAGRAM_APP_SECRET!,
        access_token: short.access_token,
      })}`,
    ),
    "Instagram (token de longa duração)",
  );
  const me = await json<{ user_id?: string; id?: string; username: string }>(
    await fetch(`${IG_API}/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`),
    "Instagram (perfil)",
  );
  const data = {
    accountId: String(me.user_id ?? me.id ?? short.user_id),
    accountName: `@${me.username}`,
    accessToken: long.access_token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + long.expires_in * 1000),
  };
  return prisma.socialAccount.upsert({ where: { platform: p }, create: { platform: p, ...data }, update: data });
}

/** Token de acesso válido (renova o do Google pelo refresh token e o do Instagram quando faltam < 10 dias). */
async function accessToken(acc: SocialAccount): Promise<string> {
  const left = acc.expiresAt ? acc.expiresAt.getTime() - Date.now() : Infinity;
  if (acc.platform === "youtube") {
    if (left > 60_000) return acc.accessToken;
    const tok = await json<{ access_token: string; expires_in: number }>(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: acc.refreshToken ?? "",
          grant_type: "refresh_token",
        }),
      }),
      "Google (renovar acesso)",
    );
    await prisma.socialAccount.update({
      where: { platform: "youtube" },
      data: { accessToken: tok.access_token, expiresAt: new Date(Date.now() + (tok.expires_in - 60) * 1000) },
    });
    return tok.access_token;
  }
  if (left < 0) throw new Error("O acesso ao Instagram expirou. Conecte a conta de novo.");
  if (left > 10 * 86_400_000) return acc.accessToken;
  const tok = await json<{ access_token: string; expires_in: number }>(
    await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(acc.accessToken)}`),
    "Instagram (renovar acesso)",
  );
  await prisma.socialAccount.update({
    where: { platform: "instagram" },
    data: { accessToken: tok.access_token, expiresAt: new Date(Date.now() + tok.expires_in * 1000) },
  });
  return tok.access_token;
}

// ---------- YouTube ----------

async function youtubeUpload(pub: VideoPublication, videoUrl: string, thumbUrl: string | null, acc: SocialAccount) {
  const token = await accessToken(acc);
  const video = await fetch(videoUrl);
  if (!video.ok) throw new Error(`Não consegui baixar o mp4 (HTTP ${video.status}).`);
  const bytes = Buffer.from(await video.arrayBuffer());

  const scheduled = pub.scheduledAt && pub.scheduledAt.getTime() > Date.now() + 60_000;
  const meta = {
    snippet: {
      title: (pub.title || "Vídeo").slice(0, 100),
      description: (pub.caption || "").slice(0, 4900),
      categoryId: "22",
      defaultLanguage: "pt-BR",
      defaultAudioLanguage: "pt-BR",
    },
    status: {
      privacyStatus: scheduled ? "private" : pub.privacy || "public",
      ...(scheduled ? { publishAt: pub.scheduledAt!.toISOString() } : {}),
      selfDeclaredMadeForKids: false,
    },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(bytes.length),
    },
    body: JSON.stringify(meta),
  });
  if (!init.ok) await json(init, "YouTube (iniciar envio)");
  const location = init.headers.get("location");
  if (!location) throw new Error("YouTube não devolveu o endereço de envio.");
  const done = await json<{ id: string }>(
    await fetch(location, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: bytes }),
    "YouTube (envio do vídeo)",
  );

  let thumbNote = "";
  if (thumbUrl) {
    try {
      const img = await fetch(thumbUrl);
      const buf = Buffer.from(await img.arrayBuffer());
      await json(
        await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${done.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
          body: buf,
        }),
        "YouTube (thumbnail)",
      );
    } catch (e) {
      // canal sem verificação por telefone não aceita thumbnail personalizada: o vídeo vai mesmo assim
      thumbNote = ` Thumbnail não aplicada: ${e instanceof Error ? e.message : e}`.slice(0, 300);
    }
  }
  return {
    status: scheduled ? "scheduled" : "published",
    externalId: done.id,
    url: `https://youtube.com/shorts/${done.id}`,
    error: thumbNote || null,
  };
}

// ---------- Instagram ----------

async function igCreateContainer(pub: VideoPublication, videoUrl: string, coverUrl: string | null, acc: SocialAccount) {
  const token = await accessToken(acc);
  const body = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption: (pub.caption || "").slice(0, 2200),
    share_to_feed: "true",
    access_token: token,
  });
  if (coverUrl) body.set("cover_url", coverUrl);
  const res = await json<{ id: string }>(
    await fetch(`${IG_API}/${acc.accountId}/media`, { method: "POST", body }),
    "Instagram (criar Reel)",
  );
  return res.id;
}

async function igStep(pub: VideoPublication, acc: SocialAccount) {
  const token = await accessToken(acc);
  const st = await json<{ status_code: string; status?: string }>(
    await fetch(`${IG_API}/${pub.containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`),
    "Instagram (status do Reel)",
  );
  if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
    throw new Error(`O Instagram não conseguiu processar o vídeo (${st.status || st.status_code}).`);
  }
  if (st.status_code !== "FINISHED") return null; // ainda processando
  const pubRes = await json<{ id: string }>(
    await fetch(`${IG_API}/${acc.accountId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: pub.containerId!, access_token: token }),
    }),
    "Instagram (publicar)",
  );
  let url: string | null = null;
  try {
    const m = await json<{ permalink?: string }>(
      await fetch(`${IG_API}/${pubRes.id}?fields=permalink&access_token=${encodeURIComponent(token)}`),
      "Instagram (link)",
    );
    url = m.permalink ?? null;
  } catch {}
  return { externalId: pubRes.id, url };
}

// ---------- andamento ----------

const MAX_ATTEMPTS = 3;
const IG_TIMEOUT_MS = 30 * 60_000; // contêiner que não termina em 30 min vira falha

/** Avança uma publicação um passo. Nunca lança: erro vira status "failed" com a mensagem. */
export async function advancePublication(pub: VideoPublication): Promise<VideoPublication> {
  const now = Date.now();
  if (pub.status !== "pending" && pub.status !== "processing") return pub;
  if (pub.platform === "instagram" && pub.status === "pending" && pub.scheduledAt && pub.scheduledAt.getTime() > now) return pub;

  // trava simples: só um processo avança cada publicação por vez (updatedAt como versão)
  const lock = await prisma.videoPublication.updateMany({
    where: { id: pub.id, updatedAt: pub.updatedAt },
    data: { attempts: { increment: pub.status === "pending" ? 1 : 0 } },
  });
  if (lock.count === 0) return (await prisma.videoPublication.findUnique({ where: { id: pub.id } })) ?? pub;

  try {
    const job = await prisma.videoJob.findUnique({ where: { id: pub.jobId } });
    if (!job?.videoUrl) throw new Error("O vídeo não tem mp4 final.");
    const acc = await prisma.socialAccount.findUnique({ where: { platform: pub.platform } });
    if (!acc) throw new Error(`Conecte a conta do ${pub.platform === "youtube" ? "YouTube" : "Instagram"} primeiro.`);

    if (pub.platform === "youtube") {
      const r = await youtubeUpload(pub, job.videoUrl, job.thumbUrl, acc);
      return prisma.videoPublication.update({ where: { id: pub.id }, data: r });
    }
    if (pub.status === "pending") {
      const containerId = await igCreateContainer(pub, job.videoUrl, job.coverUrl, acc);
      return prisma.videoPublication.update({ where: { id: pub.id }, data: { status: "processing", containerId, error: null } });
    }
    if (now - (pub.scheduledAt ?? pub.createdAt).getTime() > IG_TIMEOUT_MS) {
      throw new Error("O Instagram demorou demais para processar o vídeo.");
    }
    const r = await igStep(pub, acc);
    if (!r) return prisma.videoPublication.update({ where: { id: pub.id }, data: { error: null } });
    return prisma.videoPublication.update({ where: { id: pub.id }, data: { status: "published", ...r, error: null } });
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
    // falha ao criar/enviar: tenta de novo no próximo passo até MAX_ATTEMPTS
    const retry = pub.status === "pending" && pub.attempts + 1 < MAX_ATTEMPTS && !/Conecte|não tem mp4|expirou/.test(message);
    return prisma.videoPublication.update({
      where: { id: pub.id },
      data: retry ? { error: message } : { status: "failed", error: message },
    });
  }
}

/** Avança as publicações em andamento (todas, ou só as de um vídeo). */
export async function advancePending(jobId?: string) {
  const pending = await prisma.videoPublication.findMany({
    where: {
      ...(jobId ? { jobId } : {}),
      status: { in: ["pending", "processing"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }, { platform: "youtube" }],
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  const out: VideoPublication[] = [];
  for (const p of pending) out.push(await advancePublication(p));
  return out;
}

export function serializePublication(p: VideoPublication) {
  return {
    id: p.id,
    platform: p.platform as Platform,
    status: p.status,
    title: p.title,
    caption: p.caption,
    privacy: p.privacy,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    url: p.url,
    error: p.error,
    createdAt: p.createdAt.toISOString(),
  };
}
export type PublicationDTO = ReturnType<typeof serializePublication>;

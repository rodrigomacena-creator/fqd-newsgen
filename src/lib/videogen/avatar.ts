// Vídeo base das cenas (só servidor): avatar falando do HeyGen ou vídeo pronto do usuário.
//
// HeyGen: a narração do ElevenLabs (voz clonada, tempos das palavras) vai pro HeyGen junto do
// personagem (avatar da conta ou a foto, que vira "talking photo") e volta um vídeo com lipsync.
// Normalmente é um pedido só (HEYGEN_MAX_SECONDS); no escopo "só as cenas marcadas" a narração é
// cortada em trechos alinhados às cenas. O worker junta os trechos numa trilha só e mostra essa
// trilha nas cenas marcadas com `avatar: true`; nas outras, a imagem cobre.
//
// Upload: o vídeo do usuário é a trilha inteira. A fala dele vira a narração (transcrita no
// ElevenLabs) e o roteiro é refeito dividindo essa fala em cenas.
import { put } from "@vercel/blob";
import type { VideoJob } from "@/generated/prisma/client";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { sliceMp3 } from "./mp3";
import { avatarStatus, HEYGEN_MAX_SECONDS, submitAvatar, uploadTalkingPhoto } from "./heygen";
import { planSegments } from "./avatarPlan";
import { parseVideoFormat, type AvatarCharacter, type AvatarSegment, type AvatarTrack, type NarrationWord, type VideoScript } from "./types";

export function parseAvatar(value: string | null): AvatarTrack | null {
  if (!value) return null;
  try {
    const a = JSON.parse(value) as AvatarTrack;
    return a && Array.isArray(a.segments) ? a : null;
  } catch {
    return null;
  }
}

/**
 * Manda pro HeyGen os trechos planejados. Devolve a trilha atualizada (status "generating").
 * `who`: um personagem já cadastrado na conta do HeyGen, ou uma foto (vira foto animada lá).
 */
export async function startHeygen(
  job: VideoJob,
  script: VideoScript,
  who: { character?: AvatarCharacter | null; imageUrl?: string | null },
  scope: "all" | "marked"
): Promise<AvatarTrack> {
  if (!job.narrationUrl || !job.narrationWords) throw new Error("Gere a narração antes do avatar.");
  const words = JSON.parse(job.narrationWords) as NarrationWord[];
  const total = job.narrationDurationS ?? words.at(-1)?.[2] ?? 0;
  const prev = parseAvatar(job.avatar);
  // mesma narração e mesmo personagem (ou mesma foto): aproveita os trechos prontos
  const sameWho = prev?.source === "heygen" && (who.character ? prev.character?.id === who.character.id : Boolean(who.imageUrl) && prev.imageUrl === who.imageUrl);
  const keep = prev && sameWho && prev.narrationUrl === job.narrationUrl ? prev.segments.filter((s) => s.status !== "failed") : [];
  if (prev && keep.length === 0) await discardAvatarFiles(prev, job.narrationUrl);

  const plan = planSegments(script, words, total, scope, keep, HEYGEN_MAX_SECONDS);
  if (plan.length === 0 && keep.length === 0) throw new Error("Marque ao menos uma cena como avatar.");

  // foto enviada: vira uma foto animada na conta do HeyGen (uma vez por trilha)
  let character = who.character ?? (keep.length ? prev?.character : undefined) ?? null;
  if (!character) {
    if (!who.imageUrl) throw new Error("Escolha um avatar do HeyGen ou envie uma foto.");
    character = await uploadTalkingPhoto(who.imageUrl);
  }
  const format = parseVideoFormat(job.format);

  let audio: Buffer | null = null;
  const fresh: AvatarSegment[] = [];
  for (const p of plan) {
    if (!audio) {
      const res = await fetch(job.narrationUrl);
      if (!res.ok) throw new Error(`Não consegui baixar a narração (HTTP ${res.status}).`);
      audio = Buffer.from(await res.arrayBuffer());
    }
    const piece = sliceMp3(audio, p.start, p.end);
    const blob = await put(`videogen/${job.id}/avatar/fala-${p.start.toFixed(2)}.mp3`, piece, {
      access: "public",
      addRandomSuffix: true,
      contentType: "audio/mpeg",
    });
    try {
      const videoId = await submitAvatar(character, blob.url, format);
      fresh.push({ ...p, audioUrl: blob.url, requestId: videoId, status: "queued" });
    } catch (e) {
      // o que já foi pedido segue; este trecho fica marcado como falho para tentar de novo
      fresh.push({ ...p, audioUrl: blob.url, status: "failed", error: (e as Error).message });
      if (fresh.every((s) => s.status === "failed")) throw e;
    }
  }
  const segments = [...keep, ...fresh].sort((a, b) => a.start - b.start);
  return summarize({
    source: "heygen",
    status: "generating",
    narrationUrl: job.narrationUrl,
    imageUrl: who.character ? undefined : (who.imageUrl ?? undefined),
    character,
    segments,
    durationS: total,
    createdAt: prev?.createdAt && keep.length ? prev.createdAt : new Date().toISOString(),
  });
}

/** Status geral a partir dos trechos. */
function summarize(a: AvatarTrack): AvatarTrack {
  const pending = a.segments.some((s) => s.status === "queued" || s.status === "in_progress");
  const failed = a.segments.filter((s) => s.status === "failed");
  if (pending) return { ...a, status: "generating", error: undefined };
  if (failed.length) return { ...a, status: "failed", error: `${failed.length} trecho(s) do avatar falharam: ${failed[0].error ?? "erro desconhecido"}` };
  return { ...a, status: "ready", error: undefined };
}

/**
 * Consulta o HeyGen pelos trechos ainda em geração; os prontos são copiados pro Blob (o link
 * deles expira). Chamado pela tela do vídeo a cada poucos segundos enquanto o avatar é gerado.
 */
export async function advanceAvatar(jobId: string, avatar: AvatarTrack): Promise<AvatarTrack> {
  if (avatar.status !== "generating") return avatar;
  if (avatar.source !== "heygen") {
    // trilha do provedor anterior: não dá mais para consultar
    return summarize({ ...avatar, segments: avatar.segments.map((s) => (s.status === "completed" ? s : { ...s, status: "failed", error: "gerado no provedor anterior; gere de novo" })) });
  }
  const segments = await Promise.all(
    avatar.segments.map(async (s, k): Promise<AvatarSegment> => {
      if (!(s.status === "queued" || s.status === "in_progress") || !s.requestId) return s;
      try {
        const st = await avatarStatus(s.requestId);
        if (st.status === "completed" && st.videoUrl) {
          const res = await fetch(st.videoUrl);
          if (!res.ok) throw new Error(`não consegui baixar o vídeo do avatar (HTTP ${res.status})`);
          const blob = await put(`videogen/${jobId}/avatar/trecho-${k}.mp4`, Buffer.from(await res.arrayBuffer()), {
            access: "public",
            addRandomSuffix: true,
            contentType: "video/mp4",
          });
          return { ...s, status: "completed", videoUrl: blob.url, error: undefined };
        }
        if (st.status === "failed") return { ...s, status: "failed", error: st.error };
        return { ...s, status: st.status };
      } catch (e) {
        // erro de rede na consulta: tenta de novo na próxima volta
        console.warn("[avatar] consulta falhou:", e);
        return s;
      }
    })
  );
  return summarize({ ...avatar, segments });
}

/** Apaga os arquivos da trilha (trechos de áudio e vídeo). O vídeo enviado que ainda é a narração fica. */
export async function discardAvatarFiles(avatar: AvatarTrack, keepUrl?: string | null) {
  const urls = avatar.segments.flatMap((s) => [s.audioUrl, s.videoUrl]).filter((u): u is string => Boolean(u) && u !== keepUrl);
  await Promise.all(urls.map((u) => deleteBlobIfOwned(u)));
}

/**
 * Distribui as palavras transcritas (na ordem) entre os pedaços de fala que a IA montou, para a
 * narração do roteiro ficar exatamente igual à transcrição (é isso que liga a legenda ao tempo).
 * A IA quase sempre copia certo; quando erra uma palavra ou outra, a contagem proporcional corrige.
 */
export function realignToTranscript(pieces: string[], words: string[]): string[] {
  const counts = pieces.map((p) => p.trim().split(/\s+/).filter(Boolean).length);
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum === 0) return pieces.map((_, i) => (i === 0 ? words.join(" ") : ""));
  const out: string[] = [];
  let pos = 0;
  let acc = 0;
  counts.forEach((c, i) => {
    acc += c;
    const end = i === counts.length - 1 ? words.length : Math.round((acc / sum) * words.length);
    out.push(words.slice(pos, Math.max(pos, end)).join(" "));
    pos = Math.max(pos, end);
  });
  return out;
}

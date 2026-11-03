// Vídeo base das cenas (só servidor): avatar falando do HeyGen ou vídeo pronto do usuário.
//
// HeyGen ("Avatar por IA"): o texto da narração do roteiro vai pro HeyGen com o personagem (avatar
// da conta ou a foto, que vira "talking photo") e uma voz do HeyGen; ele devolve um vídeo com voz
// e lipsync. Nada do ElevenLabs nesse caminho. Quando o vídeo fica pronto, a fala dele é transcrita
// (ElevenLabs STT, como no "Submeter áudio / vídeo") para virar os tempos das palavras (legenda e
// cortes), e o próprio mp4 passa a ser a narração do vídeo (`narrationUrl`). O worker mostra essa
// trilha nas cenas marcadas com `avatar: true`; nas outras, a imagem cobre.
//
// Upload: o vídeo do usuário é a trilha inteira. A fala dele vira a narração (transcrita no
// ElevenLabs) e o roteiro é refeito dividindo essa fala em cenas.
import { put } from "@vercel/blob";
import type { VideoJob } from "@/generated/prisma/client";
import { deleteBlobIfOwned } from "@/lib/blobStorage";
import { avatarStatus, listVoices, submitAvatar } from "./heygen";
import { speechToText } from "./elevenlabs";
import { fullNarration, parseVideoFormat, type AvatarCharacter, type AvatarSegment, type AvatarTrack, type HeygenVoice, type NarrationWord, type VideoScript } from "./types";

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
 * Pede ao HeyGen o vídeo do avatar (já criado na conta dele) falando o texto do roteiro (um pedido só).
 * Sem voz escolhida, usa a voz padrão do avatar no HeyGen.
 * Devolve a trilha com status "generating"; `advanceAvatar` acompanha e, pronto, transcreve.
 */
/**
 * Voz do avatar: a padrão dele no HeyGen; sem ela, a voz da conta com o mesmo nome (avatar instantâneo
 * "Erick Melo -- 17" costuma ter a voz clonada "Erick Melo -- 17"), senão a primeira voz em português.
 */
async function defaultVoiceFor(character: AvatarCharacter): Promise<HeygenVoice | null> {
  if (character.defaultVoiceId) return { id: character.defaultVoiceId, name: "Voz padrão do avatar" };
  let voices: HeygenVoice[] = [];
  try {
    voices = await listVoices();
  } catch (e) {
    console.warn("[heygen] lista de vozes falhou:", e);
  }
  const name = (character.name ?? "").trim().toLowerCase();
  const same = name ? voices.find((v) => v.name.toLowerCase().startsWith(name)) : undefined;
  const pt = voices.find((v) => /portug|pt\b|brazil|brasil/i.test(v.language ?? ""));
  return same ?? pt ?? null;
}

export async function startHeygen(job: VideoJob, script: VideoScript, character: AvatarCharacter, voice: HeygenVoice | null): Promise<AvatarTrack> {
  const text = fullNarration(script);
  if (!text) throw new Error("O roteiro não tem narração.");
  const spoken = voice ?? (await defaultVoiceFor(character));
  if (!spoken) throw new Error("Este avatar não tem voz padrão no HeyGen e não achei uma voz com o nome dele.");
  const prev = parseAvatar(job.avatar);
  if (prev) await discardAvatarFiles(prev);
  const videoId = await submitAvatar(character, { type: "text", voiceId: spoken.id, text }, parseVideoFormat(job.format));
  const estimate = Math.max(3, text.split(/\s+/).length / 2.3);
  return {
    source: "heygen",
    status: "generating",
    // enquanto gera, ainda não há narração: a trilha passa a valer quando o mp4 vira a narração
    narrationUrl: "",
    character,
    voice: spoken,
    text,
    segments: [{ start: 0, end: estimate, requestId: videoId, status: "queued" }],
    durationS: estimate,
    createdAt: new Date().toISOString(),
  };
}

/** Status geral a partir dos trechos. */
function summarize(a: AvatarTrack): AvatarTrack {
  const pending = a.segments.some((s) => s.status === "queued" || s.status === "in_progress");
  const failed = a.segments.filter((s) => s.status === "failed");
  if (pending) return { ...a, status: "generating", error: undefined };
  if (failed.length) return { ...a, status: "failed", error: `${failed.length} trecho(s) do avatar falharam: ${failed[0].error ?? "erro desconhecido"}` };
  return { ...a, status: "ready", error: undefined };
}

export interface AvatarAdvance {
  avatar: AvatarTrack;
  /** Campos do job a gravar quando o vídeo do HeyGen ficou pronto (vira a narração + tempos das palavras). */
  data?: Record<string, unknown>;
}

/**
 * Consulta o HeyGen pelos trechos ainda em geração; os prontos são copiados pro Blob (o link
 * deles expira). Chamado pela tela do vídeo a cada poucos segundos enquanto o avatar é gerado.
 * No modo texto (voz do HeyGen), o vídeo pronto é transcrito e vira a narração do job.
 */
export async function advanceAvatar(job: VideoJob, avatar: AvatarTrack): Promise<AvatarAdvance> {
  if (avatar.status !== "generating") return { avatar };
  if (avatar.source !== "heygen") {
    // trilha do provedor anterior: não dá mais para consultar
    return { avatar: summarize({ ...avatar, segments: avatar.segments.map((s) => (s.status === "completed" ? s : { ...s, status: "failed", error: "gerado no provedor anterior; gere de novo" })) }) };
  }
  let durationS: number | undefined;
  const segments = await Promise.all(
    avatar.segments.map(async (s, k): Promise<AvatarSegment> => {
      if (!(s.status === "queued" || s.status === "in_progress") || !s.requestId) return s;
      try {
        const st = await avatarStatus(s.requestId);
        if (st.status === "completed" && st.videoUrl) {
          const res = await fetch(st.videoUrl);
          if (!res.ok) throw new Error(`não consegui baixar o vídeo do avatar (HTTP ${res.status})`);
          const blob = await put(`videogen/${job.id}/avatar/trecho-${k}.mp4`, Buffer.from(await res.arrayBuffer()), {
            access: "public",
            addRandomSuffix: true,
            contentType: "video/mp4",
          });
          if (st.durationS) durationS = st.durationS;
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
  let next = summarize({ ...avatar, segments });
  if (next.status !== "ready" || !avatar.voice) return { avatar: next };

  // modo texto: o mp4 do HeyGen é a narração; a fala dele dá os tempos das palavras
  const videoUrl = next.segments[0]?.videoUrl;
  if (!videoUrl) return { avatar: next };
  const script = job.script ? (JSON.parse(job.script) as VideoScript) : null;
  let words: NarrationWord[] = [];
  try {
    const { words: raw } = await speechToText(videoUrl);
    words = raw.map((w) => [w.text.replace(/\s+/g, ""), Math.round(w.start * 1000) / 1000, Math.round(w.end * 1000) / 1000] as NarrationWord).filter((w) => w[0]);
  } catch (e) {
    next = { ...next, status: "failed", error: `O avatar ficou pronto, mas não consegui transcrever a fala dele: ${(e as Error).message}` };
    return { avatar: next };
  }
  if (words.length < 2) return { avatar: { ...next, status: "failed", error: "O vídeo do HeyGen veio sem fala reconhecível." } };
  const total = Math.max(durationS ?? 0, words.at(-1)![2] + 0.3);
  next = { ...next, narrationUrl: videoUrl, durationS: total, segments: [{ ...next.segments[0], start: 0, end: total }] };
  const data: Record<string, unknown> = {
    narrationUrl: videoUrl,
    narrationWords: JSON.stringify(words),
    narrationDurationS: Math.round(total * 100) / 100,
  };
  if (script) {
    // a narração do roteiro precisa ser exatamente a transcrição (é o que liga legenda e cortes ao tempo)
    const pieces = realignToTranscript([...script.scenes.map((sc) => sc.narration), script.cta.narration], words.map((w) => w[0]));
    script.scenes = script.scenes.map((sc, i) => ({ ...sc, narration: pieces[i] }));
    script.cta = { ...script.cta, narration: pieces[pieces.length - 1] };
    if (!script.scenes.some((sc) => sc.avatar) && script.scenes[0]) script.scenes[0].avatar = true;
    next = { ...next, text: fullNarration(script) };
    data.script = JSON.stringify(script);
  }
  if (job.narrationUrl && job.narrationUrl !== videoUrl) await deleteBlobIfOwned(job.narrationUrl);
  return { avatar: next, data };
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

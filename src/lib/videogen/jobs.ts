import type { VideoJob } from "@/generated/prisma/client";
import { parseCharacter, parseSpeaker, summarizeCosts, type Speaker, type AvatarCharacter, type AvatarTrack, type VideoFormat, type BriefingImage, type CostEntry, type CostSummary, type NarrationWord, type VideoJobStatus, type VideoScript } from "./types";
import { ELEVENLABS_USD_PER_CREDIT, parseCosts } from "./costs";
import { parseBriefingImages } from "./profiles";

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Formato do job devolvido pela API (JSON-em-string já convertido, datas em ISO). */
export interface VideoJobDTO {
  id: string;
  topic: string;
  patternId: string;
  voiceId: string;
  voiceName: string;
  durationS: number;
  textModel: string;
  extraInstructions: string | null;
  /** Direcionamento do usuário para o estilo livre (movimento, música, clima...). */
  styleNotes: string | null;
  /** Notícia do NewsGen que serviu de base ("Notícia vira vídeo"). */
  articleId: string | null;
  /** Perfil (pessoa) que fala no vídeo. */
  personId: string | null;
  /** Perfil (empresa) para quem é o conteúdo. */
  companyId: string | null;
  briefingImages: BriefingImage[];
  /** Vídeo base (avatar do HeyGen ou vídeo do usuário) mostrado nas cenas com `avatar: true`. */
  avatar: AvatarTrack | null;
  /** Quem fala: voz por IA, avatar por IA ou áudio/vídeo enviado. */
  speaker: Speaker;
  /** Foto escolhida na criação para o avatar (sem ela, a do perfil de quem fala). */
  avatarImageUrl: string | null;
  /** Avatar/foto animada da conta do HeyGen escolhido na criação (sem ele, o do perfil; sem os dois, a foto). */
  avatarCharacter: AvatarCharacter | null;
  status: VideoJobStatus;
  script: VideoScript | null;
  narrationUrl: string | null;
  narrationWords: NarrationWord[] | null;
  narrationDurationS: number | null;
  videoUrl: string | null;
  /** Prévia rápida (render leve, sem trilha), quando gerada. */
  previewUrl: string | null;
  /** Capa 9:16 (Reels/Shorts) e thumbnail 16:9 (YouTube), geradas no render final. */
  coverUrl: string | null;
  thumbUrl: string | null;
  /** "preview" enquanto a prévia está na fila/renderizando; null = render final. */
  renderMode: string | null;
  /** "9:16" (Reels/Shorts, padrão) ou "16:9" (YouTube horizontal). */
  format: VideoFormat;
  progress: number | null;
  error: string | null;
  costs: CostEntry[];
  /** null quando o job é anterior ao registro de custos. */
  costSummary: CostSummary | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeVideoJob(job: VideoJob): VideoJobDTO {
  return {
    ...job,
    status: job.status as VideoJobStatus,
    format: job.format === "16:9" ? "16:9" : "9:16",
    script: parseJson<VideoScript>(job.script),
    briefingImages: parseBriefingImages(job.briefingImages),
    avatar: parseJson<AvatarTrack>(job.avatar),
    avatarCharacter: parseCharacter(job.avatarCharacter),
    speaker: parseSpeaker(job.speaker),
    narrationWords: parseJson<NarrationWord[]>(job.narrationWords),
    costs: parseCosts(job.costs),
    costSummary: job.costs ? summarizeCosts(parseCosts(job.costs), ELEVENLABS_USD_PER_CREDIT) : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

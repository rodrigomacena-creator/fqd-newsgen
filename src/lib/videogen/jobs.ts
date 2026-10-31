import type { VideoJob } from "@/generated/prisma/client";
import type { NarrationWord, VideoJobStatus, VideoScript } from "./types";

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
  status: VideoJobStatus;
  script: VideoScript | null;
  narrationUrl: string | null;
  narrationWords: NarrationWord[] | null;
  narrationDurationS: number | null;
  videoUrl: string | null;
  progress: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeVideoJob(job: VideoJob): VideoJobDTO {
  return {
    ...job,
    status: job.status as VideoJobStatus,
    script: parseJson<VideoScript>(job.script),
    narrationWords: parseJson<NarrationWord[]>(job.narrationWords),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

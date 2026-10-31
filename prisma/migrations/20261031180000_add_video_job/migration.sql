-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "voiceName" TEXT NOT NULL,
    "durationS" INTEGER NOT NULL,
    "textModel" TEXT NOT NULL,
    "extraInstructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "script" TEXT,
    "narrationUrl" TEXT,
    "narrationWords" TEXT,
    "narrationDurationS" DOUBLE PRECISION,
    "videoUrl" TEXT,
    "progress" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoJob_status_createdAt_idx" ON "VideoJob"("status", "createdAt");

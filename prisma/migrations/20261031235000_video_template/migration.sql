-- CreateTable
CREATE TABLE "VideoTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceUrl" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER,
    "spec" TEXT,
    "summary" TEXT,
    "guide" TEXT,
    "sampleUrl" TEXT,
    "costs" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoTemplate_status_createdAt_idx" ON "VideoTemplate"("status", "createdAt");

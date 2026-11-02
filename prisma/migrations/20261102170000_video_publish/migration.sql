ALTER TABLE "VideoJob" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "VideoJob" ADD COLUMN "thumbUrl" TEXT;

CREATE TABLE "SocialAccount" (
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("platform")
);

CREATE TABLE "VideoPublication" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "privacy" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "containerId" TEXT,
    "externalId" TEXT,
    "url" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VideoPublication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VideoPublication_jobId_idx" ON "VideoPublication"("jobId");
CREATE INDEX "VideoPublication_status_scheduledAt_idx" ON "VideoPublication"("status", "scheduledAt");

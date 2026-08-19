-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "sources" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "coverImage" TEXT,
    "sections" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "textModel" TEXT NOT NULL,
    "imageModel" TEXT NOT NULL,
    "profileId" TEXT,
    "profileName" TEXT,
    "instagramCaption" TEXT,
    "instagramImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultTextModel" TEXT NOT NULL,
    "defaultImageModel" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructionProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "styleguideFileName" TEXT,
    "styleguidePath" TEXT,
    "styleguideColors" TEXT,
    "styleguideSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructionProfile_pkey" PRIMARY KEY ("id")
);

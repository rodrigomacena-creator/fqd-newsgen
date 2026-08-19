-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "youtubeUrl" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "coverImage" TEXT,
    "sections" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

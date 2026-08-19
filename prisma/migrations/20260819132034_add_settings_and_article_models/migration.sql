/*
  Warnings:

  - Added the required column `imageModel` to the `Article` table without a default value. This is not possible if the table is not empty.
  - Added the required column `textModel` to the `Article` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "defaultTextModel" TEXT NOT NULL,
    "defaultImageModel" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "Settings" ("id", "defaultTextModel", "defaultImageModel", "updatedAt")
VALUES ('default', 'google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash-image', CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "youtubeUrl" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "coverImage" TEXT,
    "sections" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "textModel" TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash-lite',
    "imageModel" TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash-image',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Article" ("coverImage", "createdAt", "id", "sections", "status", "subtitle", "title", "transcript", "updatedAt", "videoId", "youtubeUrl") SELECT "coverImage", "createdAt", "id", "sections", "status", "subtitle", "title", "transcript", "updatedAt", "videoId", "youtubeUrl" FROM "Article";
DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

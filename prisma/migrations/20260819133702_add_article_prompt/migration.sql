-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "articlePrompt" TEXT;

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
    "textModel" TEXT NOT NULL,
    "imageModel" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Article" ("coverImage", "createdAt", "id", "imageModel", "sections", "status", "subtitle", "textModel", "title", "transcript", "updatedAt", "videoId", "youtubeUrl") SELECT "coverImage", "createdAt", "id", "imageModel", "sections", "status", "subtitle", "textModel", "title", "transcript", "updatedAt", "videoId", "youtubeUrl" FROM "Article";
DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

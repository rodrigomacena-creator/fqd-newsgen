-- CreateTable
CREATE TABLE "InstructionProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Preserve any existing customized Settings.articlePrompt as a named profile
-- instead of discarding it silently.
INSERT INTO "InstructionProfile" ("id", "name", "prompt", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(16))),
  'Meu padrão (personalizado)',
  "articlePrompt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Settings"
WHERE "id" = 'default' AND "articlePrompt" IS NOT NULL;

-- AlterTable: add profileName to Article
ALTER TABLE "Article" ADD COLUMN "profileName" TEXT;

-- RedefineTables: drop Settings.articlePrompt
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "defaultTextModel" TEXT NOT NULL,
    "defaultImageModel" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("id", "defaultTextModel", "defaultImageModel", "updatedAt")
SELECT "id", "defaultTextModel", "defaultImageModel", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

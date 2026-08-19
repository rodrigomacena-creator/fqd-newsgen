-- Replace single youtubeUrl/videoId/transcript with a generalized "sources" JSON
-- array (type/url/title/content/videoId), preserving existing rows as a
-- single-element youtube source instead of discarding the data.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sources" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "coverImage" TEXT,
    "sections" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "textModel" TEXT NOT NULL,
    "imageModel" TEXT NOT NULL,
    "profileName" TEXT,
    "instagramCaption" TEXT,
    "instagramImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Article" (
  "id", "sources", "title", "subtitle", "coverImage", "sections", "status",
  "textModel", "imageModel", "profileName", "instagramCaption", "instagramImage",
  "createdAt", "updatedAt"
)
SELECT
  "id",
  json_array(json_object(
    'type', 'youtube',
    'url', "youtubeUrl",
    'title', 'Vídeo do YouTube (' || "videoId" || ')',
    'content', "transcript",
    'videoId', "videoId"
  )),
  "title", "subtitle", "coverImage", "sections", "status",
  "textModel", "imageModel", "profileName", "instagramCaption", "instagramImage",
  "createdAt", "updatedAt"
FROM "Article";

DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

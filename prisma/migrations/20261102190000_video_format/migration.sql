-- Formato do vídeo: "9:16" (padrão, Reels/Shorts) ou "16:9" (YouTube horizontal). Aditiva: vídeos existentes ficam 9:16.
ALTER TABLE "VideoJob" ADD COLUMN "format" TEXT NOT NULL DEFAULT '9:16';

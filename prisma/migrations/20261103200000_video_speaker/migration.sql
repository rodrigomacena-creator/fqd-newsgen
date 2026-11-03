-- Quem fala no vídeo, escolhido na criação (fluxo em passos). Vídeos antigos: deduzido do vídeo base.
ALTER TABLE "VideoJob" ADD COLUMN "speaker" TEXT NOT NULL DEFAULT 'ai_voice';
ALTER TABLE "VideoJob" ADD COLUMN "avatarImageUrl" TEXT;
UPDATE "VideoJob" SET "speaker" = 'upload' WHERE "avatar" ~ '"source":\s*"upload"';
UPDATE "VideoJob" SET "speaker" = 'ai_avatar' WHERE "avatar" ~ '"source":\s*"higgsfield"';

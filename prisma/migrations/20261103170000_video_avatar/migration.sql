-- Vídeo base (avatar do Higgsfield ou vídeo do próprio usuário) intercalado com as imagens das cenas.
ALTER TABLE "VideoJob" ADD COLUMN "avatar" TEXT;
ALTER TABLE "VideoProfile" ADD COLUMN "avatarUrl" TEXT;

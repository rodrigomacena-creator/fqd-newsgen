-- Avatar falando pelo HeyGen: personagem (avatar ou foto animada da conta) escolhido no perfil ou no vídeo.
ALTER TABLE "VideoProfile" ADD COLUMN "heygenAvatar" TEXT;
ALTER TABLE "VideoJob" ADD COLUMN "avatarCharacter" TEXT;

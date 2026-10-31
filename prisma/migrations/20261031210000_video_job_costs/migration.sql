-- Gastos por job do VideoGen (JSON-em-string). Coluna nullable: jobs antigos ficam sem registro.
ALTER TABLE "VideoJob" ADD COLUMN "costs" TEXT;

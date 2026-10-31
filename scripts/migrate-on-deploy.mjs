// Roda `prisma migrate deploy` durante o build, mas SÓ no deploy de produção da Vercel
// (VERCEL_ENV=production, ou seja, push na main). Previews e builds locais pulam, pra nunca
// mexer no banco de produção a partir de uma branch. Se a migration falhar, o build falha e
// a versão anterior continua no ar (melhor do que subir código que espera uma tabela que
// não existe).
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate-on-deploy] VERCEL_ENV=${process.env.VERCEL_ENV ?? "(local)"}: pulando migrations.`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("[migrate-on-deploy] DATABASE_URL não está disponível no build de produção.");
  process.exit(1);
}
console.log("[migrate-on-deploy] Aplicando migrations pendentes no banco de produção…");
execSync("npx prisma migrate deploy", { stdio: "inherit" });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

function createPool() {
  const p = new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    // Na Vercel a função "congela" entre requisições: uma conexão ociosa pode ter sido fechada
    // pelo banco nesse meio tempo. Conexões ociosas saem logo do pool e o connect tem prazo.
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  // Sem este listener, um erro numa conexão ociosa derruba o processo (a requisição vira HTTP 500).
  p.on("error", (err) => console.error("[pg] conexão ociosa caiu:", err.message));
  return p;
}

const pool = globalForPrisma.pgPool ?? createPool();

const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}

const TRANSIENT_DB = /connect|terminat|ECONNRESET|ETIMEDOUT|EPIPE|socket|closed|timeout/i;

/** Repete uma operação de banco quando a falha é de conexão (conexão morta, timeout), até 3 vezes. */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ""}` : String(e);
      if (!TRANSIENT_DB.test(msg) || i === attempts - 1) throw e;
      console.warn(`[db] falha de conexão, tentando de novo (${i + 1}/${attempts - 1}):`, msg.slice(0, 200));
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw last;
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLATFORMS, platformConfigured } from "@/lib/videogen/social";

/** Contas de rede social: configurada no app (variáveis de ambiente) e conectada (OAuth feito). */
export async function GET() {
  const rows = await prisma.socialAccount.findMany();
  return NextResponse.json({
    accounts: PLATFORMS.map((platform) => {
      const acc = rows.find((r) => r.platform === platform);
      return {
        platform,
        configured: platformConfigured(platform),
        connected: Boolean(acc),
        accountName: acc?.accountName ?? null,
        expiresAt: platform === "instagram" ? (acc?.expiresAt?.toISOString() ?? null) : null,
      };
    }),
  });
}

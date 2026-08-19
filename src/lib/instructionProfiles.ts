import { prisma } from "./prisma";
import { DEFAULT_ARTICLE_PROMPT } from "./prompts";

export function listInstructionProfiles() {
  return prisma.instructionProfile.findMany({ orderBy: { createdAt: "asc" } });
}

export function getInstructionProfile(id: string) {
  return prisma.instructionProfile.findUnique({ where: { id } });
}

export function createInstructionProfile(data: {
  name: string;
  prompt?: string;
  maxSectionImages?: number | null;
}) {
  return prisma.instructionProfile.create({
    data: {
      name: data.name,
      prompt: data.prompt?.trim() || DEFAULT_ARTICLE_PROMPT,
      maxSectionImages: data.maxSectionImages ?? null,
    },
  });
}

export function updateInstructionProfile(
  id: string,
  data: { name?: string; prompt?: string; maxSectionImages?: number | null }
) {
  return prisma.instructionProfile.update({ where: { id }, data });
}

export function deleteInstructionProfile(id: string) {
  return prisma.instructionProfile.delete({ where: { id } });
}

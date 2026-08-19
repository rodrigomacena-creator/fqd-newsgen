import { prisma } from "./prisma";
import { OPENROUTER_TEXT_MODEL, OPENROUTER_IMAGE_MODEL } from "./openrouter";

export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      defaultTextModel: OPENROUTER_TEXT_MODEL,
      defaultImageModel: OPENROUTER_IMAGE_MODEL,
    },
  });
}

export async function updateSettings(data: {
  defaultTextModel: string;
  defaultImageModel: string;
}) {
  return prisma.settings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  });
}

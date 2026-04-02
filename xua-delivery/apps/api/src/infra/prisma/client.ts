import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { logger } from "../logger";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
});

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info("Prisma disconnected");
  } catch (err) {
    logger.error({ err }, "Error disconnecting Prisma");
  }
}

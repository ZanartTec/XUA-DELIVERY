import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: path.join(__dirname, ".env") });

export default defineConfig({
  schema: path.join(__dirname, "prisma/schema.prisma"),
  migrations: {
    seed: `node --import tsx/esm ./prisma/seed.ts`,
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

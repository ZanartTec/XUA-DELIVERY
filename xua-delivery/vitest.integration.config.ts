import { defineConfig } from "vitest/config";
import path from "path";

// Testes de integração rodam contra um Postgres real (local: docker-compose.yml;
// CI: serviço efêmero do job) — nunca mockam Prisma. Ver docs/doc_desenvolvimento/testes-e-ci.md.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["apps/**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Um teste de integração por vez: eles compartilham o mesmo banco e usam
    // TRUNCATE entre testes, então rodar em paralelo causaria corrida entre si.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@xua/shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
});

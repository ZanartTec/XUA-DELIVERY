import { configDefaults, defineConfig } from "vitest/config";
import { ALIASES } from "./tests/aliases";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Os testes vivem fora do src desde a centralizacao em tests/ — ver tests/README.md.
    include: ["tests/unit/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["apps/api/src/**", "packages/shared/src/**"],
    },
  },
  resolve: {
    alias: ALIASES,
  },
});

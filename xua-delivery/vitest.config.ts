import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["apps/api/src/**", "packages/shared/src/**"],
    },
  },
  resolve: {
    alias: {
      "@xua/shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
});

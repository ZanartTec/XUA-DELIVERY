import { defineConfig, devices } from "@playwright/test";

// Scaffold de E2E — roda contra um stack já de pé (web + api + banco), nunca
// sobe os servidores sozinho: isso evitaria acidentalmente apontar pro
// DATABASE_URL de produção que apps/api/.env carrega hoje. Quem rodar local
// ou no CI é responsável por subir web/api primeiro com env isolada — ver
// docs/doc_desenvolvimento/testes-e-ci.md.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // E2E_BROWSER_CHANNEL=chrome usa o Chrome instalado (perfil temporário) em
  // vez de baixar o Chromium do Playwright.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.E2E_BROWSER_CHANNEL || undefined },
    },
  ],
});

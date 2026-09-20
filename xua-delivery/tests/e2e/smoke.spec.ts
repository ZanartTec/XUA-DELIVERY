import { expect, test } from "@playwright/test";

// Smoke test único de fase 2 do E2E: login como consumer + catálogo carrega.
// Não substitui unit/integration para regra de negócio — é só a garantia de
// que o caminho mais básico da aplicação (login -> redirecionamento por role
// -> catálogo) não está quebrado. Ver docs/doc_desenvolvimento/testes-e-ci.md.
test("consumer loga e chega no catálogo", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill(process.env.E2E_CONSUMER_EMAIL ?? "joao@xua.com.br");
  await page.getByLabel("Senha").fill(process.env.E2E_CONSUMER_PASSWORD ?? "senha123");
  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(page).toHaveURL(/\/catalog/, { timeout: 15_000 });
});

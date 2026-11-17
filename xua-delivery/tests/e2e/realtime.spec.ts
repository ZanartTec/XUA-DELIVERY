import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * E2E do tempo real (seção 4.4 do plano). Roda contra o stack de dev já de pé
 * (web 3001 + api 3000 + Redis + Postgres), com os usuários do seed.
 *
 * Duas sessões isoladas (cookies separados): a distribuidora fica na tela e o
 * cliente age por chamadas autenticadas. Todo pedido criado aqui é cancelado
 * no fim do teste.
 */

const ADMIN = process.env.E2E_DISTRIBUTOR_EMAIL ?? "admin@xua.com.br";
const CONSUMER = process.env.E2E_CONSUMER_EMAIL ?? "joao@xua.com.br";
const PASSWORD = process.env.E2E_PASSWORD ?? "senha123";
// Dados do seed (prisma/seed.ts): endereço do João, Distribuidora Xuá JF,
// horário da manhã e galão de 20 L.
const SEED = {
  addressId: "00000000-0000-4000-a000-000000000200",
  distributorId: "00000000-0000-4000-a000-000000000010",
  timeSlotId: "00000000-0000-4000-a000-000000000c01",
  productId: "00000000-0000-4000-a000-000000000001",
};
const REALTIME_TIMEOUT = 5_000;

test.describe.configure({ mode: "serial" });

let distributorContext: BrowserContext;
let consumerContext: BrowserContext;
let distributorPage: Page;
const createdOrders: string[] = [];

function shortId(orderId: string) {
  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

async function login(request: APIRequestContext, email: string) {
  const res = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
}

// Data aceita pela agenda, descoberta no primeiro pedido e reutilizada: cada
// tentativa recusada também conta no limite de 10 criações por minuto.
let deliveryDate: string | null = null;

/** Cria um pedido do João na próxima data (em até 10 dias) que a agenda aceita. */
async function createOrder(paymentMethod: "cash" | "pix" = "cash", quantity = 1): Promise<string> {
  const candidates = deliveryDate
    ? [deliveryDate]
    : Array.from({ length: 10 }, (_, i) =>
        new Date(Date.now() + (i + 1) * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
      );
  for (const date of candidates) {
    const res = await consumerContext.request.post("/api/orders", {
      data: {
        address_id: SEED.addressId,
        delivery_date: date,
        delivery_window: "morning",
        distributor_id: SEED.distributorId,
        time_slot_id: SEED.timeSlotId,
        items: [{ product_id: SEED.productId, quantity }],
        payment_method: paymentMethod,
      },
    });
    if (res.status() === 201) {
      const { order } = await res.json();
      deliveryDate = date;
      createdOrders.push(order.id);
      return order.id;
    }
    if (res.status() === 429) throw new Error("rate limit de criação de pedidos (10/min)");
  }
  throw new Error(deliveryDate ? `pedido recusado na data ${deliveryDate}` : "nenhuma data disponível nos próximos 10 dias");
}

async function asDistributor(method: "patch" | "get", url: string, data?: unknown) {
  const res = await distributorContext.request[method](url, data ? { data } : undefined);
  expect(res.ok(), `${method.toUpperCase()} ${url} → ${res.status()}`).toBeTruthy();
  return res.json();
}

async function openQueue() {
  await distributorPage.goto("/distributor/queue");
  await expect(distributorPage.locator('[data-realtime-status="live"]').first()).toBeVisible({ timeout: 10_000 });
}

test.beforeAll(async ({ browser }) => {
  distributorContext = await browser.newContext();
  consumerContext = await browser.newContext();
  await login(distributorContext.request, ADMIN);
  await login(consumerContext.request, CONSUMER);
  distributorPage = await distributorContext.newPage();
});

test.afterAll(async () => {
  for (const orderId of createdOrders) {
    await distributorContext.request
      // return_to_stock: o pedido de E6 está em rota; sem isto o galão não volta
      // ao estoque de dev. Em pedido ainda não aceito o flag não tem efeito.
      .patch(`/api/orders/${orderId}/cancel`, { data: { reason: "E2E tempo real: limpeza", return_to_stock: true } })
      .catch(() => undefined);
  }
  await distributorContext.close();
  await consumerContext.close();
});

test("E1 — pedido novo aparece na fila sem recarregar, com toast", async () => {
  await openQueue();
  const orderId = await createOrder("cash", 2);

  await expect(distributorPage.getByText(`Novo pedido ${shortId(orderId)}`)).toBeVisible({ timeout: REALTIME_TIMEOUT });
  await expect(distributorPage.getByText(shortId(orderId)).first()).toBeVisible({ timeout: REALTIME_TIMEOUT });
});

test("E2 — depois de F5 a fila continua recebendo (regressão do F2)", async () => {
  await openQueue();
  await distributorPage.reload();
  await expect(distributorPage.locator('[data-realtime-status="live"]').first()).toBeVisible({ timeout: 10_000 });

  const orderId = await createOrder();
  await expect(distributorPage.getByText(shortId(orderId)).first()).toBeVisible({ timeout: REALTIME_TIMEOUT });
});

test("E3 — pedido criado com a distribuidora offline aparece ao reconectar (resync)", async () => {
  await openQueue();
  await distributorContext.setOffline(true);
  await expect(distributorPage.locator('[data-realtime-status="offline"]').first()).toBeVisible({ timeout: 10_000 });

  const orderId = await createOrder();
  await distributorPage.waitForTimeout(1_000);
  await expect(distributorPage.getByText(shortId(orderId))).toHaveCount(0);

  await distributorContext.setOffline(false);
  await expect(distributorPage.getByText(shortId(orderId)).first()).toBeVisible({ timeout: 15_000 });
});

test("E4 — PIX confirmado num processo separado (como o worker) chega à fila (regressão do F1)", async () => {
  await openQueue();
  const me = await (await consumerContext.request.get("/api/auth/me")).json();
  const date =
    deliveryDate ??
    new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const output = execFileSync(
    process.execPath,
    [
      "--env-file=.env",
      "--import",
      "tsx",
      "../../tests/e2e/support/confirm-payment-as-worker.cts",
      me.consumer.id,
      SEED.addressId,
      SEED.distributorId,
      SEED.timeSlotId,
      SEED.productId,
      date,
    ],
    { cwd: path.resolve(__dirname, "../../apps/api"), encoding: "utf8", timeout: 60_000 }
  );
  // Os logs do worker se misturam à saída; o resultado vem na linha marcada.
  const resultLine = output.split(/\r?\n/).find((line) => line.startsWith("E4_RESULT "));
  expect(resultLine, output).toBeTruthy();
  const { orderId, transitioned } = JSON.parse(resultLine!.slice("E4_RESULT ".length));
  createdOrders.push(orderId);
  expect(transitioned).toBe(true);

  await expect(distributorPage.getByText(`Novo pedido ${shortId(orderId)}`)).toBeVisible({ timeout: REALTIME_TIMEOUT });
});

test("E5 — cliente cancela pedido aceito: toast de cancelamento na distribuidora", async () => {
  await openQueue();
  const orderId = await createOrder();
  await asDistributor("patch", `/api/orders/${orderId}/accept`, {});

  const res = await consumerContext.request.patch(`/api/orders/${orderId}/cancel`, { data: { reason: "Mudei de ideia" } });
  expect(res.ok()).toBeTruthy();

  await expect(distributorPage.getByText(`Pedido ${shortId(orderId)} foi cancelado pelo cliente`)).toBeVisible({
    timeout: REALTIME_TIMEOUT,
  });
});

test("E6 — distribuidora despacha: tela do cliente mostra o código sem recarregar", async () => {
  const orderId = await createOrder();
  const consumerPage = await consumerContext.newPage();
  await consumerPage.goto(`/orders/${orderId}`);
  await expect(consumerPage.getByText(shortId(orderId).slice(1))).toBeVisible({ timeout: 10_000 });
  await expect(consumerPage.getByText("Mostre este código ao entregador")).toHaveCount(0);

  const { drivers } = await asDistributor("get", "/api/distributor/drivers");
  const driver = (drivers as Array<{ id: string; is_active?: boolean }>).find((d) => d.is_active !== false);
  expect(driver, "a distribuidora do seed precisa de um motorista ativo").toBeTruthy();
  await asDistributor("patch", `/api/orders/${orderId}/accept`, {});
  await asDistributor("patch", `/api/orders/${orderId}/dispatch-with-checklist`, { driver_id: driver!.id });

  await expect(consumerPage.getByText("Mostre este código ao entregador")).toBeVisible({ timeout: REALTIME_TIMEOUT });
  await consumerPage.close();
});

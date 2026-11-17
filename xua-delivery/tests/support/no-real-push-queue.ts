import { vi } from "vitest";

/**
 * Teste unitário nunca enfileira push de verdade. Sem isto, qualquer serviço
 * de pedido executado num teste (aceite, despacho...) chamaria o producer da
 * fila `notifications` e abriria conexão com o Redis local, gravando jobs no
 * ambiente de desenvolvimento.
 *
 * Quem testa o próprio producer usa `vi.importActual`.
 */
vi.mock("@api/infra/queue/notifications.producer.js", () => ({
  enqueuePushNotification: vi.fn(async () => ({ id: "test-job", name: "send-push", correlationId: "test" })),
  pushJobId: (dedupeKey: string) => `push-${dedupeKey.replace(/:/g, "_")}`,
}));

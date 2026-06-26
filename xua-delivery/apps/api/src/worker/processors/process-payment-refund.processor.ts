import type { Job } from "bullmq";
import type { PaymentRefundJobPayload } from "../../infra/queue/contracts";
import { createLogger } from "../../infra/logger";
import { paymentService } from "../../modules/payments/services/payments.service.js";

const log = createLogger("payment-refund-worker");

type RefundResult =
  | { action: "skipped"; reason: string }
  | { action: "refunded"; externalId: string };

/**
 * Processa o reembolso de um pagamento capturado (ex.: pedido rejeitado pela
 * distribuidora após o pagamento já ter sido capturado pelo gateway).
 *
 * Idempotência: `paymentService.refund()` só age sobre pagamento ainda
 * CAPTURED — uma reexecução após sucesso não encontra mais nada a reembolsar
 * e retorna `null` (no-op). Em caso de falha do gateway, este processor
 * lança erro para o BullMQ tentar de novo (`attempts`/`backoff` do job).
 */
export async function processPaymentRefund(
  job: Job<PaymentRefundJobPayload>
): Promise<RefundResult> {
  const { orderId, paymentId, correlationId } = job.data;
  log.info({ orderId, paymentId, correlationId, jobId: job.id }, "Payment refund job started");

  const result = await paymentService.refund(orderId);

  if (!result) {
    log.info(
      { orderId, paymentId, correlationId },
      "Refund skipped — no capturable payment found (already refunded or none)"
    );
    return { action: "skipped", reason: "no_captured_payment" };
  }

  if (result.status !== "refunded") {
    throw new Error(`PAYMENT_REFUND_FAILED:${orderId}:${paymentId}`);
  }

  log.info(
    { orderId, paymentId, correlationId, externalId: result.externalId },
    "Payment refund job completed"
  );
  return { action: "refunded", externalId: result.externalId };
}

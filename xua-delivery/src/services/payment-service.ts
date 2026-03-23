import { prisma } from "@/src/lib/prisma";
import { auditRepository } from "@/src/repositories/audit-repository";
import { getPaymentGateway } from "@/src/services/payment-gateway";
import { AuditEventType, ActorType, SourceApp, PaymentStatus, PaymentKind } from "@/src/types/enums";

export const paymentService = {
  /**
   * Cria cobrança via gateway e persiste registro de pagamento.
   */
  async charge(
    orderId: string,
    amountCents: number,
    kind: PaymentKind
  ) {
    const gateway = getPaymentGateway();
    const result = await gateway.charge(amountCents, { orderId, kind });

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          order_id: orderId,
          kind,
          amount_cents: amountCents,
          status: result.status === "captured" ? PaymentStatus.CAPTURED : PaymentStatus.CREATED,
          external_id: result.externalId,
        },
      });

      const eventType =
        result.status === "captured"
          ? AuditEventType.PAYMENT_CAPTURED
          : AuditEventType.PAYMENT_CREATED;

      await auditRepository.emit(
        {
          eventType,
          actor: { type: ActorType.SYSTEM, id: "payment-gateway" },
          orderId,
          sourceApp: SourceApp.BACKEND,
          payload: { externalId: result.externalId, status: result.status },
        },
        tx
      );

      return created;
    });

    return { payment, gatewayResult: result };
  },

  /**
   * Confirma pagamento — chamado pelo webhook do gateway.
   */
  async confirmPayment(orderId: string, externalId: string) {
    const payment = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findFirst({
        where: { order_id: orderId, external_id: externalId },
      });
      if (!existing) throw new Error("PAYMENT_NOT_FOUND");

      const updated = await tx.payment.update({
        where: { id: existing.id },
        data: { status: PaymentStatus.CAPTURED },
      });

      await auditRepository.emit(
        {
          eventType: AuditEventType.PAYMENT_CAPTURED,
          actor: { type: ActorType.SYSTEM, id: "payment-webhook" },
          orderId,
          sourceApp: SourceApp.BACKEND,
        },
        tx
      );

      return updated;
    });

    return payment;
  },

  /**
   * Reembolsa pagamento — usado em cancelamentos.
   */
  async refund(orderId: string) {
    const payment = await prisma.payment.findFirst({
      where: { order_id: orderId, status: PaymentStatus.CAPTURED },
    });
    if (!payment) return null;

    const gateway = getPaymentGateway();
    const result = await gateway.refund(payment.external_id!);

    if (result.status === "refunded") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });
    }

    return result;
  },
};

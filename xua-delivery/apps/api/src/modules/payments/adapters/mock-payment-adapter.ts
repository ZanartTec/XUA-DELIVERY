import type {
  IPaymentGateway,
  PaymentChargeMetadata,
  PaymentResult,
  ProviderPaymentDetails,
  RefundResult,
} from "../gateway/payments.gateway.js";
import { randomUUID } from "crypto";

/**
 * Adapter de pagamento mock para desenvolvimento.
 * Retorna sucesso imediato com externalId sintético.
 */
export class MockPaymentAdapter implements IPaymentGateway {
  async charge(
    amountCents: number,
    _metadata: PaymentChargeMetadata
  ): Promise<PaymentResult> {
    await new Promise((r) => setTimeout(r, 200));
    return {
      externalId: `mock_${randomUUID()}`,
      status: "captured",
    };
  }

  async refund(externalId: string): Promise<RefundResult> {
    await new Promise((r) => setTimeout(r, 100));
    return {
      externalId,
      status: "refunded",
    };
  }

  async getPayment(externalId: string): Promise<ProviderPaymentDetails> {
    return {
      providerPaymentId: externalId,
      status: "approved",
      externalReference: externalId,
      orderReference: externalId,
      amountCents: 0,
      paidAt: new Date(),
      raw: { id: externalId, status: "approved" },
    };
  }
}

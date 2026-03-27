import { randomUUID } from "crypto";
import type { IPaymentGateway, PaymentResult, RefundResult } from "../payment-gateway";

/**
 * Adapter de pagamento mock para desenvolvimento.
 * Retorna sucesso imediato com externalId sintético.
 */
export class MockPaymentAdapter implements IPaymentGateway {
  async charge(amountCents: number, metadata: Record<string, string>): Promise<PaymentResult> {
    // Simula latência de gateway
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
}

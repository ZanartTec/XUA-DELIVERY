
/**
 * Interface abstrata para gateways de pagamento.
 * Implementações concretas: MockPaymentAdapter (dev), futuramente PIX/Stripe.
 */

export interface PaymentResult {
  externalId: string;
  status: "authorized" | "captured" | "failed";
  redirectUrl?: string;
}

export interface RefundResult {
  externalId: string;
  status: "refunded" | "failed";
}

export interface IPaymentGateway {
  charge(amountCents: number, metadata: Record<string, string>): Promise<PaymentResult>;
  refund(externalId: string): Promise<RefundResult>;
}

/**
 * Factory — retorna adapter baseado em PAYMENT_PROVIDER env var.
 */
export function getPaymentGateway(): IPaymentGateway {
  const provider = process.env.PAYMENT_PROVIDER || "mock";

  switch (provider) {
    case "mock": {
      // Lazy import para evitar carregar o mock em produção quando outro provider é usado
      const { MockPaymentAdapter } = require("./adapters/mock-payment-adapter");
      return new MockPaymentAdapter();
    }
    default:
      throw new Error(`Payment provider "${provider}" não implementado`);
  }
}

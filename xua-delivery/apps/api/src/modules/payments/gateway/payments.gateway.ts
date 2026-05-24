import { MockPaymentAdapter } from "../adapters/mock-payment-adapter.js";
import { MercadoPagoAdapter } from "../adapters/mercadopago-adapter.js";

export const PAYMENT_PROVIDERS = {
  mock: "mock",
  mercadoPago: "mercadopago",
} as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[keyof typeof PAYMENT_PROVIDERS];

export type PaymentMethod = "pix" | "credit" | "cash";

export interface PaymentChargeItem {
  id: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PaymentChargeMetadata {
  orderId: string;
  kind: string;
  idempotencyKey?: string;
  description?: string;
  payerEmail?: string | null;
  paymentMethod?: PaymentMethod;
  items?: PaymentChargeItem[];
}

export interface PaymentResult {
  externalId: string;
  status: "created" | "authorized" | "captured" | "failed";
  redirectUrl?: string;
  providerPaymentRef?: string;
  raw?: unknown;
}

export interface RefundResult {
  externalId: string;
  status: "refunded" | "failed";
  raw?: unknown;
}

export interface ProviderPaymentDetails {
  providerPaymentId: string;
  status: string;
  statusDetail?: string;
  externalReference?: string;
  orderReference?: string;
  paymentKind?: string;
  paymentMethod?: PaymentMethod;
  amountCents: number;
  paidAt?: Date;
  raw: unknown;
}

export interface IPaymentGateway {
  charge(
    amountCents: number,
    metadata: PaymentChargeMetadata
  ): Promise<PaymentResult>;
  refund(externalId: string): Promise<RefundResult>;
  getPayment?(externalId: string): Promise<ProviderPaymentDetails>;
}

export function getConfiguredPaymentProvider(): string {
  return process.env.PAYMENT_PROVIDER || PAYMENT_PROVIDERS.mock;
}

/**
 * Factory — retorna adapter baseado em PAYMENT_PROVIDER env var.
 */
export function getPaymentGateway(): IPaymentGateway {
  const provider = getConfiguredPaymentProvider();

  switch (provider) {
    case PAYMENT_PROVIDERS.mock:
      return new MockPaymentAdapter();
    case PAYMENT_PROVIDERS.mercadoPago:
      return new MercadoPagoAdapter();
    default:
      throw new Error(`Payment provider "${provider}" não implementado`);
  }
}

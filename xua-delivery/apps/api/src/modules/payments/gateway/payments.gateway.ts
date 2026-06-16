import type { CheckoutPaymentMethod } from "@xua/shared/enums";
import { MercadoPagoAdapter } from "../adapters/mercadopago-adapter.js";

export const PAYMENT_PROVIDERS = {
  mercadoPago: "mercadopago",
} as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[keyof typeof PAYMENT_PROVIDERS];

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
  paymentMethod?: CheckoutPaymentMethod;
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
  paymentMethod?: CheckoutPaymentMethod;
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

export function getConfiguredPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER;
  if (!provider) return PAYMENT_PROVIDERS.mercadoPago;
  if (provider === PAYMENT_PROVIDERS.mercadoPago) return provider;
  throw new Error(`Payment provider "${provider}" não implementado`);
}

/** Credenciais por distribuidora, resolvidas na hora do pagamento. */
export interface PaymentGatewayCredentials {
  accessToken: string;
}

/**
 * Factory — retorna adapter baseado em PAYMENT_PROVIDER env var, usando as
 * credenciais (por distribuidora) informadas. As credenciais não vêm mais do
 * ambiente: são resolvidas a partir da config da distribuidora escolhida.
 */
export function getPaymentGateway(credentials: PaymentGatewayCredentials): IPaymentGateway {
  const provider = getConfiguredPaymentProvider();

  if (provider === PAYMENT_PROVIDERS.mercadoPago) {
    return new MercadoPagoAdapter({ accessToken: credentials.accessToken });
  }

  throw new Error(`Payment provider "${provider}" não implementado`);
}

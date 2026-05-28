import { PaymentKind } from "@xua/shared/enums";

export type PaymentTargetKind = typeof PaymentKind.ORDER | typeof PaymentKind.SUBSCRIPTION;

export interface PaymentTarget {
  kind: PaymentTargetKind;
  id: string;
}

export interface WebhookPaymentContext {
  referenceId?: string;
  paymentKind?: string;
}

export interface PaymentTargetProcessingOutcome {
  target: PaymentTarget;
  orderId: string | null;
  subscriptionId: string | null;
  shouldFinalize: boolean;
  webhookMarkedProcessed: boolean;
}

export class NonRetryablePaymentWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryablePaymentWebhookError";
  }
}

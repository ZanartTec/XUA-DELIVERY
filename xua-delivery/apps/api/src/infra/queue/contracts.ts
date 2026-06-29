export const QUEUE_NAMES = {
  internalJobs: "internal-jobs",
  notifications: "notifications",
  paymentWebhooks: "payment-webhooks",
  payments: "payments",
  paymentReconciliation: "payment-reconciliation",
  paymentRefunds: "payment-refunds",
  subscriptionExpiration: "subscription-expiration",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const INTERNAL_JOB_NAMES = {
  noop: "noop",
  otpCleanup: "otp-cleanup",
  subscriptionGeneration: "subscription-generation",
  subscriptionExpiry: "subscription-expiry",
} as const;

export const PAYMENT_JOB_NAMES = {
  processWebhook: "process-webhook",
  chargePayment: "charge-payment",
  reconcilePayment: "reconcile-payment",
  expirePayment: "expire-payment",
  refundPayment: "refund-payment",
} as const;

export const SUBSCRIPTION_JOB_NAMES = {
  expireSubscription: "expire-subscription",
} as const;

export type InternalJobName =
  (typeof INTERNAL_JOB_NAMES)[keyof typeof INTERNAL_JOB_NAMES];
export type PaymentJobName =
  (typeof PAYMENT_JOB_NAMES)[keyof typeof PAYMENT_JOB_NAMES];
export type SubscriptionJobName =
  (typeof SUBSCRIPTION_JOB_NAMES)[keyof typeof SUBSCRIPTION_JOB_NAMES];

export interface BaseJobPayload {
  correlationId: string;
  requestedAt: string;
  source: "api" | "cron" | "worker" | "ops";
}

export interface InternalJobPayload extends BaseJobPayload {
  jobName: InternalJobName;
}

export interface PaymentWebhookJobPayload extends BaseJobPayload {
  jobName: typeof PAYMENT_JOB_NAMES.processWebhook;
  webhookEventId: string;
}

export interface PaymentChargeJobPayload extends BaseJobPayload {
  jobName: typeof PAYMENT_JOB_NAMES.chargePayment;
  paymentId: string;
  orderId?: string;
}

export interface PaymentReconciliationJobPayload extends BaseJobPayload {
  jobName: typeof PAYMENT_JOB_NAMES.reconcilePayment;
  paymentId?: string;
  providerPaymentId?: string;
}

export interface PaymentExpirationJobPayload extends BaseJobPayload {
  jobName: typeof PAYMENT_JOB_NAMES.expirePayment;
  orderId: string;
}

export interface PaymentRefundJobPayload extends BaseJobPayload {
  jobName: typeof PAYMENT_JOB_NAMES.refundPayment;
  orderId: string;
  paymentId: string;
}

export interface SubscriptionExpirationJobPayload extends BaseJobPayload {
  jobName: typeof SUBSCRIPTION_JOB_NAMES.expireSubscription;
  subscriptionId: string;
}

export type QueueJobPayload =
  | InternalJobPayload
  | PaymentWebhookJobPayload
  | PaymentChargeJobPayload
  | PaymentReconciliationJobPayload
  | PaymentExpirationJobPayload
  | PaymentRefundJobPayload
  | SubscriptionExpirationJobPayload;
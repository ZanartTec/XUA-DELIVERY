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

export const NOTIFICATION_JOB_NAMES = {
  sendPush: "send-push",
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
  /**
   * Alvo opcional da geração de assinatura (jobName = subscriptionGeneration).
   * Presente quando a geração é direcionada por evento (ativação do pagamento);
   * ausente no disparo do cron (varredura global). Ver D4 da arquitetura.
   */
  subscriptionId?: string;
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

/**
 * Intenção de push (Web Push): quem recebe e o que recebe. As regras de
 * domínio montam; o processor da fila `notifications` resolve os tokens e envia.
 */
export interface PushIntent {
  /** `user`: um usuário (cliente, motorista, ops). `distributor`: todos os admins ativos da distribuidora. */
  target: { kind: "user" | "distributor"; id: string };
  title: string;
  body: string;
  /** Tela aberta ao tocar na notificação. */
  url: string;
  /** Agrupa notificações do mesmo assunto (ex.: `order-<id>`). */
  tag: string;
  urgency: "high" | "normal" | "low";
  ttlSeconds: number;
  /** Vira o `jobId` do BullMQ: dois enfileiramentos iguais geram um job só. */
  dedupeKey: string;
  /** Usado pelo service worker (ex.: `new_order` pede interação). */
  kind: string;
  /** Sem som/vibração (resumo de assinaturas — D6). */
  silent?: boolean;
}

export interface PushNotificationJobPayload extends BaseJobPayload {
  jobName: typeof NOTIFICATION_JOB_NAMES.sendPush;
  intent: PushIntent;
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
  | SubscriptionExpirationJobPayload
  | PushNotificationJobPayload;
import { QueueEvents, Worker } from "bullmq";
import { createLogger } from "../infra/logger";
import { disconnectPrisma } from "../infra/prisma/client";
import { QUEUE_PREFIX } from "../infra/queue/config";
import { createQueueRedisConnection } from "../infra/queue/connection";
import {
  QUEUE_NAMES,
  type InternalJobPayload,
  type PaymentExpirationJobPayload,
  type PaymentRefundJobPayload,
  type PaymentWebhookJobPayload,
  type SubscriptionExpirationJobPayload,
} from "../infra/queue/contracts";
import { closeQueueInfra } from "../infra/queue/queues";
import { processInternalJob } from "./processors/internal-jobs.processor";
import { processPaymentJob } from "./processors/payment-jobs.processor";
import { processPaymentExpiration } from "./processors/expire-payment.processor";
import { processPaymentRefund } from "./processors/process-payment-refund.processor";
import { processSubscriptionExpiration } from "./processors/expire-subscription.processor";
import { registerRepeatableJobs } from "./register-repeatable-jobs";

const log = createLogger("worker");

function parseConcurrency(value: string | undefined): number {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

const internalJobsWorker = new Worker<InternalJobPayload>(
  QUEUE_NAMES.internalJobs,
  processInternalJob,
  {
    connection: createQueueRedisConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: parseConcurrency(process.env.INTERNAL_JOBS_WORKER_CONCURRENCY),
  }
);

const internalJobsEvents = new QueueEvents(QUEUE_NAMES.internalJobs, {
  connection: createQueueRedisConnection(),
  prefix: QUEUE_PREFIX,
});

const paymentWebhooksWorker = new Worker<PaymentWebhookJobPayload>(
  QUEUE_NAMES.paymentWebhooks,
  processPaymentJob,
  {
    connection: createQueueRedisConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: parseConcurrency(process.env.PAYMENT_WEBHOOK_WORKER_CONCURRENCY),
  }
);

const paymentWebhooksEvents = new QueueEvents(QUEUE_NAMES.paymentWebhooks, {
  connection: createQueueRedisConnection(),
  prefix: QUEUE_PREFIX,
});

const paymentsWorker = new Worker<PaymentExpirationJobPayload>(
  QUEUE_NAMES.payments,
  processPaymentExpiration,
  {
    connection: createQueueRedisConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: parseConcurrency(process.env.PAYMENTS_WORKER_CONCURRENCY),
  }
);

const paymentsEvents = new QueueEvents(QUEUE_NAMES.payments, {
  connection: createQueueRedisConnection(),
  prefix: QUEUE_PREFIX,
});

const paymentRefundsWorker = new Worker<PaymentRefundJobPayload>(
  QUEUE_NAMES.paymentRefunds,
  processPaymentRefund,
  {
    connection: createQueueRedisConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: parseConcurrency(process.env.PAYMENT_REFUNDS_WORKER_CONCURRENCY),
  }
);

const paymentRefundsEvents = new QueueEvents(QUEUE_NAMES.paymentRefunds, {
  connection: createQueueRedisConnection(),
  prefix: QUEUE_PREFIX,
});

const subscriptionExpirationWorker = new Worker<SubscriptionExpirationJobPayload>(
  QUEUE_NAMES.subscriptionExpiration,
  processSubscriptionExpiration,
  {
    connection: createQueueRedisConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: parseConcurrency(process.env.SUBSCRIPTION_EXPIRATION_WORKER_CONCURRENCY),
  }
);

const subscriptionExpirationEvents = new QueueEvents(QUEUE_NAMES.subscriptionExpiration, {
  connection: createQueueRedisConnection(),
  prefix: QUEUE_PREFIX,
});

internalJobsWorker.on("completed", (job) => {
  log.info(
    {
      jobId: job.id,
      jobName: job.name,
      correlationId: job.data.correlationId,
    },
    "Internal job completed"
  );
});

internalJobsWorker.on("failed", (job, err) => {
  log.error(
    {
      err,
      jobId: job?.id,
      jobName: job?.name,
      correlationId: job?.data.correlationId,
    },
    "Internal job failed"
  );
});

internalJobsEvents.on("failed", ({ jobId, failedReason }) => {
  log.warn({ jobId, failedReason }, "Internal job moved to failed state");
});

paymentWebhooksWorker.on("completed", (job) => {
  log.info(
    {
      jobId: job.id,
      jobName: job.name,
      correlationId: job.data.correlationId,
    },
    "Payment webhook job completed"
  );
});

paymentWebhooksWorker.on("failed", (job, err) => {
  log.error(
    {
      err,
      jobId: job?.id,
      jobName: job?.name,
      correlationId: job?.data.correlationId,
    },
    "Payment webhook job failed"
  );
});

paymentWebhooksEvents.on("failed", ({ jobId, failedReason }) => {
  log.warn({ jobId, failedReason }, "Payment webhook job moved to failed state");
});

paymentsWorker.on("completed", (job) => {
  log.info(
    {
      jobId: job.id,
      jobName: job.name,
      correlationId: job.data.correlationId,
    },
    "Payment job completed"
  );
});

paymentsWorker.on("failed", (job, err) => {
  log.error(
    {
      err,
      jobId: job?.id,
      jobName: job?.name,
      correlationId: job?.data.correlationId,
    },
    "Payment job failed"
  );
});

paymentsEvents.on("failed", ({ jobId, failedReason }) => {
  log.warn({ jobId, failedReason }, "Payment job moved to failed state");
});

paymentRefundsWorker.on("completed", (job) => {
  log.info(
    {
      jobId: job.id,
      jobName: job.name,
      correlationId: job.data.correlationId,
    },
    "Payment refund job completed"
  );
});

paymentRefundsWorker.on("failed", (job, err) => {
  const attempts = job?.opts.attempts ?? 1;
  const exhausted = job != null && job.attemptsMade >= attempts;

  log.error(
    {
      err,
      jobId: job?.id,
      jobName: job?.name,
      correlationId: job?.data.correlationId,
      orderId: job?.data.orderId,
      paymentId: job?.data.paymentId,
      attemptsMade: job?.attemptsMade,
      exhausted,
    },
    exhausted
      ? "Payment refund job exhausted all retries — requires manual ops follow-up (ver auditoria PAYMENT_REFUND_FAILED)"
      : "Payment refund job failed, will retry"
  );
});

paymentRefundsEvents.on("failed", ({ jobId, failedReason }) => {
  log.warn({ jobId, failedReason }, "Payment refund job moved to failed state");
});

subscriptionExpirationWorker.on("completed", (job) => {
  log.info(
    {
      jobId: job.id,
      jobName: job.name,
      correlationId: job.data.correlationId,
      subscriptionId: job.data.subscriptionId,
    },
    "Subscription expiration job completed"
  );
});

subscriptionExpirationWorker.on("failed", (job, err) => {
  log.error(
    {
      err,
      jobId: job?.id,
      jobName: job?.name,
      correlationId: job?.data.correlationId,
      subscriptionId: job?.data.subscriptionId,
    },
    "Subscription expiration job failed"
  );
});

subscriptionExpirationEvents.on("failed", ({ jobId, failedReason }) => {
  log.warn({ jobId, failedReason }, "Subscription expiration job moved to failed state");
});

// Agenda os Job Schedulers que substituem os antigos crons do Render
// (subscription-cron, subscription-expiry, otp-cleanup). Idempotente —
// seguro chamar em todo boot/restart do worker.
registerRepeatableJobs().catch((err) => {
  log.fatal({ err }, "Failed to register repeatable jobs");
});

log.info(
  {
    queue: QUEUE_NAMES.internalJobs,
    paymentWebhookQueue: QUEUE_NAMES.paymentWebhooks,
    paymentsQueue: QUEUE_NAMES.payments,
    paymentRefundsQueue: QUEUE_NAMES.paymentRefunds,
    subscriptionExpirationQueue: QUEUE_NAMES.subscriptionExpiration,
    prefix: QUEUE_PREFIX,
    internalConcurrency: internalJobsWorker.opts.concurrency,
    paymentWebhookConcurrency: paymentWebhooksWorker.opts.concurrency,
    paymentsConcurrency: paymentsWorker.opts.concurrency,
    paymentRefundsConcurrency: paymentRefundsWorker.opts.concurrency,
    subscriptionExpirationConcurrency: subscriptionExpirationWorker.opts.concurrency,
  },
  "XUA worker started"
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info({ signal }, "Worker shutdown signal received");

  // Armado ANTES de qualquer await: se o fechamento de workers/filas travar
  // (ex.: Redis de fila fora do ar), o processo ainda encerra em 30s.
  setTimeout(() => {
    log.error("Worker forced shutdown after timeout");
    process.exit(1);
  }, 30_000).unref();

  await internalJobsWorker.close();
  await paymentWebhooksWorker.close();
  await paymentsWorker.close();
  await paymentRefundsWorker.close();
  await subscriptionExpirationWorker.close();
  await internalJobsEvents.close();
  await paymentWebhooksEvents.close();
  await paymentsEvents.close();
  await paymentRefundsEvents.close();
  await subscriptionExpirationEvents.close();
  await closeQueueInfra();
  await disconnectPrisma();

  log.info("Worker shutdown completed");
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("uncaughtException", (err) => {
  log.fatal({ err }, "Worker uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.error({ reason }, "Worker unhandled rejection");
});
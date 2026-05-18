import { QueueEvents, Worker } from "bullmq";
import { createLogger } from "../infra/logger";
import { disconnectPrisma } from "../infra/prisma/client";
import { disconnectRedis } from "../infra/redis/client";
import { QUEUE_PREFIX } from "../infra/queue/config";
import { createQueueRedisConnection } from "../infra/queue/connection";
import { QUEUE_NAMES, type InternalJobPayload } from "../infra/queue/contracts";
import { closeQueueInfra } from "../infra/queue/queues";
import { processInternalJob } from "./processors/internal-jobs.processor";

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

log.info(
  {
    queue: QUEUE_NAMES.internalJobs,
    prefix: QUEUE_PREFIX,
    concurrency: internalJobsWorker.opts.concurrency,
  },
  "XUA worker started"
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info({ signal }, "Worker shutdown signal received");

  await internalJobsWorker.close();
  await internalJobsEvents.close();
  await closeQueueInfra();
  await disconnectPrisma();
  await disconnectRedis();

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
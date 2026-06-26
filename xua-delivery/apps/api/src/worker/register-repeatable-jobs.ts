import { INTERNAL_JOB_NAMES, QUEUE_NAMES, type InternalJobPayload } from "../infra/queue/contracts";
import { getQueue } from "../infra/queue/queues";
import { createLogger } from "../infra/logger";

const log = createLogger("worker-scheduler");

interface RepeatableJobSpec {
  schedulerId: string;
  pattern: string;
  jobName: InternalJobPayload["jobName"];
}

// Mesmos cron expressions (UTC) que estavam no render.yaml dos serviços
// `subscription-cron`, `subscription-expiry` e `otp-cleanup`.
const REPEATABLE_JOBS: RepeatableJobSpec[] = [
  {
    schedulerId: INTERNAL_JOB_NAMES.subscriptionGeneration,
    pattern: "0 3,8,19 * * *", // 00h, 05h, 16h São Paulo (BRT = UTC-3)
    jobName: INTERNAL_JOB_NAMES.subscriptionGeneration,
  },
  {
    schedulerId: INTERNAL_JOB_NAMES.subscriptionExpiry,
    pattern: "30 9 * * *", // 06h30 São Paulo
    jobName: INTERNAL_JOB_NAMES.subscriptionExpiry,
  },
  {
    schedulerId: INTERNAL_JOB_NAMES.otpCleanup,
    pattern: "*/15 * * * *", // a cada 15 minutos
    jobName: INTERNAL_JOB_NAMES.otpCleanup,
  },
];

/**
 * Registra os Job Schedulers do BullMQ que substituem os antigos serviços
 * `type: cron` do Render. Chamado uma vez no boot do worker.
 *
 * Idempotente: `upsertJobScheduler` atualiza o scheduler existente em vez de
 * duplicar — seguro chamar em todo restart/deploy do processo.
 */
export async function registerRepeatableJobs(): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.internalJobs);

  for (const job of REPEATABLE_JOBS) {
    const payload: InternalJobPayload = {
      jobName: job.jobName,
      source: "cron",
      correlationId: "scheduler",
      requestedAt: new Date(0).toISOString(),
    };

    await queue.upsertJobScheduler(
      job.schedulerId,
      { pattern: job.pattern },
      { name: job.jobName, data: payload }
    );

    log.info({ schedulerId: job.schedulerId, pattern: job.pattern }, "Repeatable job registered");
  }
}

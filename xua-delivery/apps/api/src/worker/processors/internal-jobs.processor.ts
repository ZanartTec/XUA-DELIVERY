import type { Job } from "bullmq";
import {
  INTERNAL_JOB_NAMES,
  type InternalJobPayload,
} from "../../infra/queue/contracts";
import { createLogger } from "../../infra/logger";
import { runOtpCleanupJob } from "../../jobs/otp-cleanup-job.js";
import { runSubscriptionExpiryJob } from "../../jobs/subscription-expiry-job.js";
import { runSubscriptionJob } from "../../jobs/subscription-job.js";

const log = createLogger("internal-jobs-worker");

export async function processInternalJob(job: Job<InternalJobPayload>) {
  const { jobName, correlationId } = job.data;
  log.info({ jobId: job.id, jobName, correlationId }, "Internal job started");

  switch (jobName) {
    case INTERNAL_JOB_NAMES.noop:
      return {
        ok: true,
        processedAt: new Date().toISOString(),
      };
    case INTERNAL_JOB_NAMES.otpCleanup:
      return runOtpCleanupJob();
    case INTERNAL_JOB_NAMES.subscriptionGeneration:
      return runSubscriptionJob();
    case INTERNAL_JOB_NAMES.subscriptionExpiry:
      return runSubscriptionExpiryJob();
  }
}
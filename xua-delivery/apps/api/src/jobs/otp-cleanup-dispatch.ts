import { INTERNAL_JOB_NAMES, type InternalJobPayload } from "../infra/queue/contracts";

interface EnqueueOtpCleanupInput {
  jobName: typeof INTERNAL_JOB_NAMES.otpCleanup;
  source: InternalJobPayload["source"];
  correlationId?: string;
}

interface EnqueueOtpCleanupResult {
  id: string | number | undefined;
  correlationId: string;
}

interface DispatchOtpCleanupOptions {
  useBullmq: boolean;
  source?: InternalJobPayload["source"];
  correlationId?: string;
  enqueue: (input: EnqueueOtpCleanupInput) => Promise<EnqueueOtpCleanupResult>;
  runSync: () => Promise<{ expired: number }>;
}

export type OtpCleanupDispatchResult =
  | { mode: "sync"; expired: number }
  | { mode: "queued"; jobId: string | null; correlationId: string }
  | { mode: "sync-fallback"; expired: number; enqueueError: unknown };

export function isBullmqOtpCleanupEnabled(
  flagValue = process.env.USE_BULLMQ_OTP_CLEANUP
): boolean {
  return flagValue === "true";
}

export async function dispatchOtpCleanup(
  options: DispatchOtpCleanupOptions
): Promise<OtpCleanupDispatchResult> {
  if (!options.useBullmq) {
    const result = await options.runSync();
    return { mode: "sync", expired: result.expired };
  }

  try {
    const queuedJob = await options.enqueue({
      jobName: INTERNAL_JOB_NAMES.otpCleanup,
      source: options.source ?? "cron",
      correlationId: options.correlationId,
    });

    return {
      mode: "queued",
      jobId: queuedJob.id != null ? String(queuedJob.id) : null,
      correlationId: queuedJob.correlationId,
    };
  } catch (enqueueError) {
    const result = await options.runSync();

    return {
      mode: "sync-fallback",
      expired: result.expired,
      enqueueError,
    };
  }
}
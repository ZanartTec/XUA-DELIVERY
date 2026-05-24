import {
  INTERNAL_JOB_NAMES,
  type InternalJobPayload,
} from "../infra/queue/contracts";

interface EnqueueSubscriptionExpiryInput {
  jobName: typeof INTERNAL_JOB_NAMES.subscriptionExpiry;
  source: InternalJobPayload["source"];
  correlationId?: string;
}

interface EnqueueSubscriptionExpiryResult {
  id: string | number | undefined;
  correlationId: string;
}

interface DispatchSubscriptionExpiryOptions {
  useBullmq: boolean;
  source?: InternalJobPayload["source"];
  correlationId?: string;
  enqueue: (
    input: EnqueueSubscriptionExpiryInput
  ) => Promise<EnqueueSubscriptionExpiryResult>;
  runSync: () => Promise<{ checked: number; notified: number; failed: number }>;
}

export type SubscriptionExpiryDispatchResult =
  | { mode: "sync"; checked: number; notified: number; failed: number }
  | { mode: "queued"; jobId: string | null; correlationId: string }
  | {
      mode: "sync-fallback";
      checked: number;
      notified: number;
      failed: number;
      enqueueError: unknown;
    };

export function isBullmqSubscriptionExpiryEnabled(
  flagValue = process.env.USE_BULLMQ_SUBSCRIPTION_EXPIRY
): boolean {
  return flagValue === "true";
}

export async function dispatchSubscriptionExpiry(
  options: DispatchSubscriptionExpiryOptions
): Promise<SubscriptionExpiryDispatchResult> {
  if (!options.useBullmq) {
    const result = await options.runSync();
    return {
      mode: "sync",
      checked: result.checked,
      notified: result.notified,
      failed: result.failed,
    };
  }

  try {
    const queuedJob = await options.enqueue({
      jobName: INTERNAL_JOB_NAMES.subscriptionExpiry,
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
      checked: result.checked,
      notified: result.notified,
      failed: result.failed,
      enqueueError,
    };
  }
}
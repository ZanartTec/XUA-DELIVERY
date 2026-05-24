import {
  INTERNAL_JOB_NAMES,
  type InternalJobPayload,
} from "../infra/queue/contracts";

interface EnqueueSubscriptionInput {
  jobName: typeof INTERNAL_JOB_NAMES.subscriptionGeneration;
  source: InternalJobPayload["source"];
  correlationId?: string;
}

interface EnqueueSubscriptionResult {
  id: string | number | undefined;
  correlationId: string;
}

interface DispatchSubscriptionOptions {
  useBullmq: boolean;
  source?: InternalJobPayload["source"];
  correlationId?: string;
  enqueue: (input: EnqueueSubscriptionInput) => Promise<EnqueueSubscriptionResult>;
  runSync: () => Promise<{ processed: number; created: number; failed: number }>;
}

export type SubscriptionDispatchResult =
  | { mode: "sync"; processed: number; created: number; failed: number }
  | { mode: "queued"; jobId: string | null; correlationId: string }
  | {
      mode: "sync-fallback";
      processed: number;
      created: number;
      failed: number;
      enqueueError: unknown;
    };

export function isBullmqSubscriptionEnabled(
  flagValue = process.env.USE_BULLMQ_SUBSCRIPTION
): boolean {
  return flagValue === "true";
}

export async function dispatchSubscription(
  options: DispatchSubscriptionOptions
): Promise<SubscriptionDispatchResult> {
  if (!options.useBullmq) {
    const result = await options.runSync();
    return {
      mode: "sync",
      processed: result.processed,
      created: result.created,
      failed: result.failed,
    };
  }

  try {
    const queuedJob = await options.enqueue({
      jobName: INTERNAL_JOB_NAMES.subscriptionGeneration,
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
      processed: result.processed,
      created: result.created,
      failed: result.failed,
      enqueueError,
    };
  }
}
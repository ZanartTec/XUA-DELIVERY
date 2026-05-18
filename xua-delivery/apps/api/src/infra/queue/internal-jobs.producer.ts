import { randomUUID } from "node:crypto";
import { getQueue } from "./queues";
import {
  QUEUE_NAMES,
  type InternalJobName,
  type InternalJobPayload,
} from "./contracts";

interface EnqueueInternalJobInput {
  jobName: InternalJobName;
  source: InternalJobPayload["source"];
  correlationId?: string;
  jobId?: string;
}

export async function enqueueInternalJob(input: EnqueueInternalJobInput) {
  const correlationId = input.correlationId ?? randomUUID();
  const payload: InternalJobPayload = {
    jobName: input.jobName,
    correlationId,
    requestedAt: new Date().toISOString(),
    source: input.source,
  };

  const queue = getQueue(QUEUE_NAMES.internalJobs);
  const job = await queue.add(input.jobName, payload, {
    jobId: input.jobId,
  });

  return {
    id: job.id,
    name: job.name,
    correlationId,
  };
}
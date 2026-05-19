import { describe, expect, it, vi } from "vitest";
import { INTERNAL_JOB_NAMES } from "../infra/queue/contracts.js";
import {
  dispatchSubscription,
  isBullmqSubscriptionEnabled,
} from "./subscription-dispatch.js";

describe("isBullmqSubscriptionEnabled", () => {
  it("ativa apenas com o valor true literal", () => {
    expect(isBullmqSubscriptionEnabled("true")).toBe(true);
    expect(isBullmqSubscriptionEnabled("false")).toBe(false);
    expect(isBullmqSubscriptionEnabled(undefined)).toBe(false);
  });
});

describe("dispatchSubscription", () => {
  it("executa o job de forma síncrona quando a flag está desligada", async () => {
    const enqueue = vi.fn();
    const runSync = vi.fn().mockResolvedValue({
      processed: 3,
      created: 2,
      failed: 1,
    });

    const result = await dispatchSubscription({
      useBullmq: false,
      enqueue,
      runSync,
    });

    expect(result).toEqual({
      mode: "sync",
      processed: 3,
      created: 2,
      failed: 1,
    });
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enfileira o job quando a flag está ligada", async () => {
    const enqueue = vi.fn().mockResolvedValue({
      id: "job-7",
      correlationId: "corr-sub-1",
    });
    const runSync = vi.fn();

    const result = await dispatchSubscription({
      useBullmq: true,
      source: "cron",
      correlationId: "corr-sub-1",
      enqueue,
      runSync,
    });

    expect(enqueue).toHaveBeenCalledWith({
      jobName: INTERNAL_JOB_NAMES.subscriptionGeneration,
      source: "cron",
      correlationId: "corr-sub-1",
    });
    expect(runSync).not.toHaveBeenCalled();
    expect(result).toEqual({
      mode: "queued",
      jobId: "job-7",
      correlationId: "corr-sub-1",
    });
  });

  it("faz fallback síncrono quando o enqueue falha", async () => {
    const enqueueError = new Error("redis down");
    const enqueue = vi.fn().mockRejectedValue(enqueueError);
    const runSync = vi.fn().mockResolvedValue({
      processed: 10,
      created: 8,
      failed: 2,
    });

    const result = await dispatchSubscription({
      useBullmq: true,
      enqueue,
      runSync,
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      mode: "sync-fallback",
      processed: 10,
      created: 8,
      failed: 2,
      enqueueError,
    });
  });
});
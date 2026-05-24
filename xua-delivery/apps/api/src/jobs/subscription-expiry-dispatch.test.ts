import { describe, expect, it, vi } from "vitest";
import { INTERNAL_JOB_NAMES } from "../infra/queue/contracts.js";
import {
  dispatchSubscriptionExpiry,
  isBullmqSubscriptionExpiryEnabled,
} from "./subscription-expiry-dispatch.js";

describe("isBullmqSubscriptionExpiryEnabled", () => {
  it("ativa apenas com o valor true literal", () => {
    expect(isBullmqSubscriptionExpiryEnabled("true")).toBe(true);
    expect(isBullmqSubscriptionExpiryEnabled("false")).toBe(false);
    expect(isBullmqSubscriptionExpiryEnabled(undefined)).toBe(false);
  });
});

describe("dispatchSubscriptionExpiry", () => {
  it("executa o job de forma síncrona quando a flag está desligada", async () => {
    const enqueue = vi.fn();
    const runSync = vi.fn().mockResolvedValue({
      checked: 3,
      notified: 2,
      failed: 1,
    });

    const result = await dispatchSubscriptionExpiry({
      useBullmq: false,
      enqueue,
      runSync,
    });

    expect(result).toEqual({
      mode: "sync",
      checked: 3,
      notified: 2,
      failed: 1,
    });
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enfileira o job quando a flag está ligada", async () => {
    const enqueue = vi.fn().mockResolvedValue({
      id: "job-exp-1",
      correlationId: "corr-exp-1",
    });
    const runSync = vi.fn();

    const result = await dispatchSubscriptionExpiry({
      useBullmq: true,
      source: "cron",
      correlationId: "corr-exp-1",
      enqueue,
      runSync,
    });

    expect(enqueue).toHaveBeenCalledWith({
      jobName: INTERNAL_JOB_NAMES.subscriptionExpiry,
      source: "cron",
      correlationId: "corr-exp-1",
    });
    expect(runSync).not.toHaveBeenCalled();
    expect(result).toEqual({
      mode: "queued",
      jobId: "job-exp-1",
      correlationId: "corr-exp-1",
    });
  });

  it("faz fallback síncrono quando o enqueue falha", async () => {
    const enqueueError = new Error("redis down");
    const enqueue = vi.fn().mockRejectedValue(enqueueError);
    const runSync = vi.fn().mockResolvedValue({
      checked: 10,
      notified: 8,
      failed: 2,
    });

    const result = await dispatchSubscriptionExpiry({
      useBullmq: true,
      enqueue,
      runSync,
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      mode: "sync-fallback",
      checked: 10,
      notified: 8,
      failed: 2,
      enqueueError,
    });
  });
});
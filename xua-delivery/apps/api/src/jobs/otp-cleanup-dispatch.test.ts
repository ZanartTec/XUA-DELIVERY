import { describe, expect, it, vi } from "vitest";
import { INTERNAL_JOB_NAMES } from "../infra/queue/contracts.js";
import {
  dispatchOtpCleanup,
  isBullmqOtpCleanupEnabled,
} from "./otp-cleanup-dispatch.js";

describe("isBullmqOtpCleanupEnabled", () => {
  it("ativa apenas com o valor true literal", () => {
    expect(isBullmqOtpCleanupEnabled("true")).toBe(true);
    expect(isBullmqOtpCleanupEnabled("false")).toBe(false);
    expect(isBullmqOtpCleanupEnabled(undefined)).toBe(false);
  });
});

describe("dispatchOtpCleanup", () => {
  it("executa o job de forma síncrona quando a flag está desligada", async () => {
    const enqueue = vi.fn();
    const runSync = vi.fn().mockResolvedValue({ expired: 3 });

    const result = await dispatchOtpCleanup({
      useBullmq: false,
      enqueue,
      runSync,
    });

    expect(result).toEqual({ mode: "sync", expired: 3 });
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enfileira o job quando a flag está ligada", async () => {
    const enqueue = vi.fn().mockResolvedValue({
      id: "job-1",
      correlationId: "corr-1",
    });
    const runSync = vi.fn();

    const result = await dispatchOtpCleanup({
      useBullmq: true,
      source: "cron",
      correlationId: "corr-1",
      enqueue,
      runSync,
    });

    expect(enqueue).toHaveBeenCalledWith({
      jobName: INTERNAL_JOB_NAMES.otpCleanup,
      source: "cron",
      correlationId: "corr-1",
    });
    expect(runSync).not.toHaveBeenCalled();
    expect(result).toEqual({
      mode: "queued",
      jobId: "job-1",
      correlationId: "corr-1",
    });
  });

  it("faz fallback síncrono quando o enqueue falha", async () => {
    const enqueueError = new Error("redis down");
    const enqueue = vi.fn().mockRejectedValue(enqueueError);
    const runSync = vi.fn().mockResolvedValue({ expired: 7 });

    const result = await dispatchOtpCleanup({
      useBullmq: true,
      enqueue,
      runSync,
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      mode: "sync-fallback",
      expired: 7,
      enqueueError,
    });
  });
});
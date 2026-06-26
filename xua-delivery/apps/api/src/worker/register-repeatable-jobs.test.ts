import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queue: { upsertJobScheduler: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../infra/queue/queues", () => ({
  getQueue: vi.fn(() => mocks.queue),
}));

vi.mock("../infra/logger", () => ({
  createLogger: () => mocks.logger,
}));

const { registerRepeatableJobs } = await import("./register-repeatable-jobs.js");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queue.upsertJobScheduler.mockResolvedValue(undefined);
});

describe("registerRepeatableJobs", () => {
  it("registra os 3 schedulers com os cron patterns que estavam no render.yaml", async () => {
    await registerRepeatableJobs();

    expect(mocks.queue.upsertJobScheduler).toHaveBeenCalledTimes(3);

    expect(mocks.queue.upsertJobScheduler).toHaveBeenCalledWith(
      "subscription-generation",
      { pattern: "0 3,8,19 * * *" },
      expect.objectContaining({
        name: "subscription-generation",
        data: expect.objectContaining({ jobName: "subscription-generation", source: "cron" }),
      })
    );

    expect(mocks.queue.upsertJobScheduler).toHaveBeenCalledWith(
      "subscription-expiry",
      { pattern: "30 9 * * *" },
      expect.objectContaining({
        name: "subscription-expiry",
        data: expect.objectContaining({ jobName: "subscription-expiry", source: "cron" }),
      })
    );

    expect(mocks.queue.upsertJobScheduler).toHaveBeenCalledWith(
      "otp-cleanup",
      { pattern: "*/15 * * * *" },
      expect.objectContaining({
        name: "otp-cleanup",
        data: expect.objectContaining({ jobName: "otp-cleanup", source: "cron" }),
      })
    );
  });
});

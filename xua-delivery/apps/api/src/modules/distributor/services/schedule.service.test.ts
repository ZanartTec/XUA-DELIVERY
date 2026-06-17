import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logInfo: vi.fn(),
  scheduleRepository: {
    findScheduleByDistributor: vi.fn(),
    findBlockedDates: vi.fn(),
  },
  timeslotRepository: {
    findActiveByDistributor: vi.fn(),
  },
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: mocks.logInfo }),
}));

vi.mock("../repository/schedule.repository.js", () => ({
  scheduleRepository: mocks.scheduleRepository,
}));

vi.mock("../repository/timeslot.repository.js", () => ({
  timeslotRepository: mocks.timeslotRepository,
}));

const { scheduleService, ScheduleServiceError } = await import("./schedule.service.js");

const distributorId = "dist-001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scheduleRepository.findScheduleByDistributor.mockResolvedValue([]);
  mocks.scheduleRepository.findBlockedDates.mockResolvedValue([]);
});

describe("scheduleService.validateDeliveryDate", () => {
  it("throws INVALID_DATE for malformed date", async () => {
    await expect(
      scheduleService.validateDeliveryDate(distributorId, "not-a-date", "MORNING" as any)
    ).rejects.toMatchObject({
      name: "ScheduleServiceError",
      code: "INVALID_DATE",
    });
  });

  it("throws WEEKDAY_INACTIVE when schedule marks day as inactive", async () => {
    // 2026-06-22 is a Monday (weekday 1)
    mocks.scheduleRepository.findScheduleByDistributor.mockResolvedValue([
      { weekday: 1, is_active: false, lead_time_hours: 2 },
    ]);

    await expect(
      scheduleService.validateDeliveryDate(distributorId, "2026-06-22", "MORNING" as any)
    ).rejects.toMatchObject({
      name: "ScheduleServiceError",
      code: "WEEKDAY_INACTIVE",
    });
  });

  it("throws DATE_BLOCKED when date is in blocked list", async () => {
    mocks.scheduleRepository.findBlockedDates.mockResolvedValue([
      { blocked_date: new Date("2026-06-22T00:00:00Z"), reason: "Holiday" },
    ]);

    await expect(
      scheduleService.validateDeliveryDate(distributorId, "2026-06-22", "MORNING" as any)
    ).rejects.toMatchObject({
      name: "ScheduleServiceError",
      code: "DATE_BLOCKED",
    });
  });

  it("throws LEAD_TIME_VIOLATION when window is too close", async () => {
    // Spy on isWindowAfterLeadTime to simulate a violation
    const spy = vi.spyOn(scheduleService, "isWindowAfterLeadTime").mockReturnValue(false);

    await expect(
      scheduleService.validateDeliveryDate(distributorId, "2026-06-22", "MORNING" as any)
    ).rejects.toMatchObject({
      name: "ScheduleServiceError",
      code: "LEAD_TIME_VIOLATION",
    });

    spy.mockRestore();
  });

  it("skips lead time check when bypassLeadTime is true", async () => {
    // Even if isWindowAfterLeadTime returns false, bypass should pass
    const spy = vi.spyOn(scheduleService, "isWindowAfterLeadTime").mockReturnValue(false);

    await expect(
      scheduleService.validateDeliveryDate(distributorId, "2026-06-22", "MORNING" as any, {
        bypassLeadTime: true,
      })
    ).resolves.toBeUndefined();

    // isWindowAfterLeadTime should NOT have been called
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("still validates weekday and blocked dates even with bypassLeadTime", async () => {
    mocks.scheduleRepository.findScheduleByDistributor.mockResolvedValue([
      { weekday: 1, is_active: false, lead_time_hours: 2 },
    ]);

    await expect(
      scheduleService.validateDeliveryDate(distributorId, "2026-06-22", "MORNING" as any, {
        bypassLeadTime: true,
      })
    ).rejects.toMatchObject({
      name: "ScheduleServiceError",
      code: "WEEKDAY_INACTIVE",
    });
  });

  it("passes validation for a valid date without bypass", async () => {
    const spy = vi.spyOn(scheduleService, "isWindowAfterLeadTime").mockReturnValue(true);

    await expect(
      scheduleService.validateDeliveryDate(distributorId, "2026-06-22", "MORNING" as any)
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

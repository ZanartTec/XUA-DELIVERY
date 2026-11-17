import { describe, expect, it } from "vitest";
import { addDaysToIsoDay, operationDayIso } from "@xua/shared/utils/operation-day";

describe("operationDayIso (America/Sao_Paulo)", () => {
  it("às 21h30 de Brasília ainda é o mesmo dia, mesmo com o UTC já no dia seguinte", () => {
    // 12/06/2026 21:30 em Brasília (UTC-3) = 13/06/2026 00:30 UTC
    expect(operationDayIso(new Date("2026-06-13T00:30:00.000Z"))).toBe("2026-06-12");
  });

  it("vira o dia à meia-noite de Brasília, não à do UTC", () => {
    expect(operationDayIso(new Date("2026-06-12T02:59:59.000Z"))).toBe("2026-06-11");
    expect(operationDayIso(new Date("2026-06-12T03:00:00.000Z"))).toBe("2026-06-12");
  });

  it("no meio do dia coincide com o UTC", () => {
    expect(operationDayIso(new Date("2026-06-12T15:00:00.000Z"))).toBe("2026-06-12");
  });
});

describe("addDaysToIsoDay", () => {
  it("soma e subtrai dias atravessando mês e ano", () => {
    expect(addDaysToIsoDay("2026-06-12", -30)).toBe("2026-05-13");
    expect(addDaysToIsoDay("2026-01-02", -5)).toBe("2025-12-28");
    expect(addDaysToIsoDay("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("não é afetado por horário de verão (aritmética pura de calendário)", () => {
    expect(addDaysToIsoDay("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDaysToIsoDay("2026-03-07", 1)).toBe("2026-03-08");
  });
});

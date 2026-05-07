import { describe, it, expect } from "vitest";
import { nextWeekdayDate } from "./date.js";

describe("nextWeekdayDate", () => {
  it("retorna o próprio dia quando inclusive=true e dia bate", () => {
    // 2026-05-07 = quinta (UTC weekday 4)
    const from = new Date("2026-05-07T00:00:00Z");
    expect(nextWeekdayDate([4], from, true)).toBe("2026-05-07");
  });

  it("retorna o próximo dia quando inclusive=false mesmo se hoje bate", () => {
    const from = new Date("2026-05-07T00:00:00Z"); // qui
    // próximo qui é 2026-05-14
    expect(nextWeekdayDate([4], from, false)).toBe("2026-05-14");
  });

  it("retorna o primeiro weekday futuro do array", () => {
    const from = new Date("2026-05-07T00:00:00Z"); // qui
    // sex (5) está disponível amanhã
    expect(nextWeekdayDate([1, 5], from, false)).toBe("2026-05-08");
  });

  it("vira a semana quando o array só tem um dia anterior", () => {
    const from = new Date("2026-05-07T00:00:00Z"); // qui (4)
    // próxima seg = 2026-05-11
    expect(nextWeekdayDate([1], from, false)).toBe("2026-05-11");
  });

  it("vira o mês corretamente", () => {
    const from = new Date("2026-05-31T00:00:00Z"); // dom (0)
    // próxima seg = 2026-06-01
    expect(nextWeekdayDate([1], from, false)).toBe("2026-06-01");
  });

  it("aceita domingo (0) como weekday válido", () => {
    const from = new Date("2026-05-07T00:00:00Z"); // qui
    expect(nextWeekdayDate([0], from, false)).toBe("2026-05-10");
  });

  it("lança erro quando weekdays está vazio", () => {
    const from = new Date("2026-05-07T00:00:00Z");
    expect(() => nextWeekdayDate([], from, false)).toThrow();
  });
});

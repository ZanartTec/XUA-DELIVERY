import { describe, expect, it } from "vitest";
import { computeSettlement } from "./deposit-settlement.service.js";

describe("computeSettlement — caução de vasilhames", () => {
  it("Cenário 1: traz vazios suficientes → nada a fazer", () => {
    const r = computeSettlement({
      bottlesFullOrdered: 3,
      emptyBottlesProvided: 3,
      program: { isEnabled: true, maxBottles: 10 },
      currentBalance: 0,
    });
    expect(r).toEqual({ missing: 0, sold: 0, loaned: 0 });
  });

  it("Cenário 2: sem vínculo → faltantes vendidos (default)", () => {
    const r = computeSettlement({
      bottlesFullOrdered: 3,
      emptyBottlesProvided: 1,
      program: null,
      currentBalance: 0,
    });
    expect(r).toEqual({ missing: 2, sold: 2, loaned: 0 });
  });

  it("Cenário 2b: vínculo desabilitado → venda", () => {
    const r = computeSettlement({
      bottlesFullOrdered: 3,
      emptyBottlesProvided: 1,
      program: { isEnabled: false, maxBottles: 10 },
      currentBalance: 0,
    });
    expect(r).toEqual({ missing: 2, sold: 2, loaned: 0 });
  });

  it("Cenário 2c: max_bottles = 0 (bloqueado) → venda", () => {
    const r = computeSettlement({
      bottlesFullOrdered: 3,
      emptyBottlesProvided: 1,
      program: { isEnabled: true, maxBottles: 0 },
      currentBalance: 0,
    });
    expect(r).toEqual({ missing: 2, sold: 2, loaned: 0 });
  });

  it("Cenário 3: vínculo ativo dentro do limite → caução", () => {
    const r = computeSettlement({
      bottlesFullOrdered: 3,
      emptyBottlesProvided: 1,
      program: { isEnabled: true, maxBottles: 6 },
      currentBalance: 0,
    });
    expect(r).toEqual({ missing: 2, sold: 0, loaned: 2 });
  });

  it("Excedente acima do limite → caução até o teto, restante vendido", () => {
    const r = computeSettlement({
      bottlesFullOrdered: 5,
      emptyBottlesProvided: 0,
      program: { isEnabled: true, maxBottles: 4 },
      currentBalance: 3, // headroom = 1
    });
    expect(r).toEqual({ missing: 5, sold: 4, loaned: 1 });
  });

  it("Saldo já no limite → sem headroom → tudo vendido", () => {
    const r = computeSettlement({
      bottlesFullOrdered: 2,
      emptyBottlesProvided: 0,
      program: { isEnabled: true, maxBottles: 3 },
      currentBalance: 3,
    });
    expect(r).toEqual({ missing: 2, sold: 2, loaned: 0 });
  });

  it("Traz mais vazios que pediu → sem faltantes", () => {
    const r = computeSettlement({
      bottlesFullOrdered: 2,
      emptyBottlesProvided: 5,
      program: { isEnabled: true, maxBottles: 10 },
      currentBalance: 4,
    });
    expect(r).toEqual({ missing: 0, sold: 0, loaned: 0 });
  });
});

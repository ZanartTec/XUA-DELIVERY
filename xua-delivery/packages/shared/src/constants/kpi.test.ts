import { describe, expect, it } from "vitest";
import { KPI_TARGETS, aggregateKpiStatus, classifyKpi } from "./kpi";

describe("classifyKpi", () => {
  it("trata KPIs de 'quanto maior, melhor' contra a meta", () => {
    expect(classifyKpi("slaAcceptance", 99)).toBe("ok");
    expect(classifyKpi("slaAcceptance", KPI_TARGETS.slaAcceptance)).toBe("ok");
    expect(classifyKpi("slaAcceptance", 95)).toBe("warning");
    // 98 − 92 = 6pp de desvio, acima da margem de 5pp
    expect(classifyKpi("slaAcceptance", 92)).toBe("critical");
  });

  it("inverte a comparação na taxa de reentrega", () => {
    expect(classifyKpi("redeliveryRate", 1)).toBe("ok");
    expect(classifyKpi("redeliveryRate", KPI_TARGETS.redeliveryRate)).toBe("ok");
    expect(classifyKpi("redeliveryRate", 6)).toBe("warning");
    expect(classifyKpi("redeliveryRate", 9)).toBe("critical");
  });
});

describe("aggregateKpiStatus", () => {
  const healthy = {
    sla_acceptance_pct: 99,
    acceptance_rate_pct: 97,
    redelivery_rate_pct: 2,
  };

  it("é ok quando os três KPIs batem a meta", () => {
    expect(aggregateKpiStatus(healthy)).toBe("ok");
  });

  it("assume o pior status entre os três", () => {
    expect(aggregateKpiStatus({ ...healthy, acceptance_rate_pct: 94 })).toBe("warning");
    expect(aggregateKpiStatus({ ...healthy, redelivery_rate_pct: 20 })).toBe("critical");
  });

  it("prioriza critical sobre warning", () => {
    expect(
      aggregateKpiStatus({
        sla_acceptance_pct: 97, // warning
        acceptance_rate_pct: 80, // critical
        redelivery_rate_pct: 1,
      })
    ).toBe("critical");
  });
});

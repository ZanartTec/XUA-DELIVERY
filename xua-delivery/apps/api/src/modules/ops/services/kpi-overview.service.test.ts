import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $queryRaw: mocks.queryRaw }),
}));

const { kpiOverviewService } = await import("./kpi-overview.service.js");

const START = new Date("2026-08-01T00:00:00.000Z");
const END = new Date("2026-08-02T00:00:00.000Z");

const ALPHA = "7e1d7b55-3f52-4d10-aac3-74387c236301";
const BETA = "7e1d7b55-3f52-4d10-aac3-74387c236302";
const GAMMA = "7e1d7b55-3f52-4d10-aac3-74387c236303";

/** Distribuidora saudável: SLA 100%, aceite 100%, reentrega 0%. */
function alphaRow() {
  return {
    distributor_id: ALPHA,
    distributor_name: "Xuá Centro",
    received: 100,
    within_sla: 100,
    accepted: 100,
    rejected: 0,
    dispatched: 98,
    delivered: 95,
    redeliveries: 0,
  };
}

/** Distribuidora ruim: SLA 50%, aceite 80%, reentrega 20%. */
function betaRow() {
  return {
    distributor_id: BETA,
    distributor_name: "Xuá Norte",
    received: 50,
    within_sla: 25,
    accepted: 40,
    rejected: 10,
    dispatched: 35,
    delivered: 30,
    redeliveries: 6,
  };
}

/** Distribuidora ativa sem nenhum pedido no período. */
function gammaRow() {
  return {
    distributor_id: GAMMA,
    distributor_name: "Xuá Sul",
    received: 0,
    within_sla: 0,
    accepted: 0,
    rejected: 0,
    dispatched: 0,
    delivered: 0,
    redeliveries: 0,
  };
}

interface Fixture {
  aggregates?: unknown[];
  series?: unknown[];
  latency?: unknown[];
  nps?: unknown[];
}

/**
 * Roteia cada `$queryRaw` pela sua marca no SQL estático — as 4 queries do
 * service saem em Promise.all, então não dá para distinguir por ordem.
 */
function mockQueries({ aggregates = [], series = [], latency = [], nps = [] }: Fixture) {
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("generate_series")) return Promise.resolve(series);
    if (sql.includes("'not_accepted'")) return Promise.resolve(latency);
    if (sql.includes("AVG(o.nps_score)")) return Promise.resolve(nps);
    return Promise.resolve(aggregates);
  });
}

beforeEach(() => {
  mocks.queryRaw.mockReset();
});

describe("kpiOverviewService.getOverview", () => {
  it("faz uma passada agregada por consulta, independente do nº de distribuidoras", async () => {
    mockQueries({ aggregates: [alphaRow(), betaRow(), gammaRow()] });

    await kpiOverviewService.getOverview(START, END);

    // 4 queries fixas — o controller legado fazia 3 por distribuidora.
    expect(mocks.queryRaw).toHaveBeenCalledTimes(4);
  });

  it("deriva as três taxas e o semáforo de cada distribuidora", async () => {
    mockQueries({ aggregates: [alphaRow(), betaRow()] });

    const { by_distributor } = await kpiOverviewService.getOverview(START, END);
    const [alpha, beta] = by_distributor;

    expect(alpha).toMatchObject({
      sla_acceptance_pct: 100,
      acceptance_rate_pct: 100,
      redelivery_rate_pct: 0,
      status: "ok",
    });

    expect(beta).toMatchObject({
      sla_acceptance_pct: 50,
      acceptance_rate_pct: 80,
      redelivery_rate_pct: 20,
      status: "critical",
    });
  });

  it("consolida o resumo global somando as contagens, não a média das taxas", async () => {
    mockQueries({ aggregates: [alphaRow(), betaRow()] });

    const { summary } = await kpiOverviewService.getOverview(START, END);

    // 125 dentro do SLA em 150 recebidos = 83,33% (média simples daria 75%)
    expect(summary.sla_acceptance_pct).toBeCloseTo(83.33, 2);
    expect(summary.acceptance_rate_pct).toBeCloseTo(93.33, 2);
    // 6 reentregas em 125 entregues
    expect(summary.redelivery_rate_pct).toBeCloseTo(4.8, 2);
    expect(summary.orders_received).toBe(150);
    expect(summary.orders_delivered).toBe(125);
    expect(summary.distributors_count).toBe(2);
    expect(summary.status).toBe("critical");
  });

  it("devolve 0 (não NaN) quando o denominador é zero", async () => {
    mockQueries({ aggregates: [gammaRow()] });

    const { summary, by_distributor } = await kpiOverviewService.getOverview(START, END);

    expect(by_distributor[0].sla_acceptance_pct).toBe(0);
    expect(by_distributor[0].acceptance_rate_pct).toBe(0);
    expect(by_distributor[0].redelivery_rate_pct).toBe(0);
    expect(summary.sla_acceptance_pct).toBe(0);
    expect(Number.isNaN(summary.redelivery_rate_pct)).toBe(false);
  });

  it("não pinta de vermelho quem não teve volume no período", async () => {
    mockQueries({ aggregates: [gammaRow()] });

    const { by_distributor, summary } = await kpiOverviewService.getOverview(START, END);

    expect(by_distributor[0].status).toBe("ok");
    expect(summary.status).toBe("ok");
  });

  it("ordena o ranking e exclui distribuidoras sem volume", async () => {
    mockQueries({ aggregates: [betaRow(), alphaRow(), gammaRow()] });

    const { ranking } = await kpiOverviewService.getOverview(START, END);

    expect(ranking.best?.distributor_id).toBe(ALPHA);
    expect(ranking.worst?.distributor_id).toBe(BETA);
  });

  it("não repete a mesma distribuidora como melhor e pior", async () => {
    mockQueries({ aggregates: [alphaRow(), gammaRow()] });

    const { ranking } = await kpiOverviewService.getOverview(START, END);

    expect(ranking.best?.distributor_id).toBe(ALPHA);
    expect(ranking.worst).toBeNull();
  });

  it("soma o funil entre todas as distribuidoras", async () => {
    mockQueries({ aggregates: [alphaRow(), betaRow()] });

    const { funnel } = await kpiOverviewService.getOverview(START, END);
    const byStage = Object.fromEntries(funnel.map((s) => [s.stage, s.count]));

    expect(byStage).toEqual({
      received: 150,
      accepted: 140,
      dispatched: 133,
      delivered: 125,
      rejected: 10,
      redelivery: 6,
    });
  });

  it("preenche com zero os buckets de latência que o SQL não retornou", async () => {
    mockQueries({
      aggregates: [alphaRow()],
      latency: [
        { bucket: "lt_60", count: 80 },
        { bucket: "not_accepted", count: 4 },
      ],
    });

    const { acceptance_latency } = await kpiOverviewService.getOverview(START, END);

    expect(acceptance_latency).toHaveLength(6);
    expect(acceptance_latency[0]).toEqual({
      bucket: "< 1 min",
      count: 80,
      within_sla: true,
    });
    expect(acceptance_latency[1]).toEqual({
      bucket: "1–2 min",
      count: 0,
      within_sla: true,
    });
    expect(acceptance_latency.at(-1)).toEqual({
      bucket: "Não aceito",
      count: 4,
      within_sla: false,
    });
  });

  it("anexa o NPS por distribuidora e usa null quando não houve resposta", async () => {
    mockQueries({
      aggregates: [alphaRow(), betaRow()],
      nps: [{ distributor_id: ALPHA, avg_nps: 8.6 }],
    });

    const { by_distributor } = await kpiOverviewService.getOverview(START, END);

    expect(by_distributor[0].avg_nps).toBe(8.6);
    expect(by_distributor[1].avg_nps).toBeNull();
  });

  it("converte a série diária para taxas percentuais com data ISO", async () => {
    mockQueries({
      aggregates: [alphaRow()],
      series: [
        {
          day: new Date("2026-08-01T00:00:00.000Z"),
          received: 10,
          within_sla: 9,
          accepted: 10,
          delivered: 8,
          redeliveries: 1,
          orders_count: 12,
        },
        {
          day: new Date("2026-08-02T00:00:00.000Z"),
          received: 0,
          within_sla: 0,
          accepted: 0,
          delivered: 0,
          redeliveries: 0,
          orders_count: 0,
        },
      ],
    });

    const { series } = await kpiOverviewService.getOverview(START, END);

    expect(series[0]).toEqual({
      date: "2026-08-01",
      sla_pct: 90,
      acceptance_pct: 100,
      redelivery_pct: 12.5,
      orders_count: 12,
    });
    // Dia sem movimento é mantido zerado, para a linha não "pular" datas.
    expect(series[1]).toEqual({
      date: "2026-08-02",
      sla_pct: 0,
      acceptance_pct: 0,
      redelivery_pct: 0,
      orders_count: 0,
    });
  });
});

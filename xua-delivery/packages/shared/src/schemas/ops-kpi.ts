import { z } from "zod";

export const KPI_PERIOD_VALUES = ["1d", "7d", "30d", "90d"] as const;
export type KpiPeriod = (typeof KPI_PERIOD_VALUES)[number];

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

export const opsKpiOverviewQuerySchema = z
  .object({
    period: z.preprocess(
      emptyStringToUndefined,
      z.enum(KPI_PERIOD_VALUES, { message: "Período inválido" }).default("7d")
    ),
    distributorId: z.preprocess(
      emptyStringToUndefined,
      z.string().uuid("Distribuidor inválido").optional()
    ),
  })
  .strict();
export type OpsKpiOverviewQueryInput = z.infer<typeof opsKpiOverviewQuerySchema>;

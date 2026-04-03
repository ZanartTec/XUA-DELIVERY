/**
 * Calcula a data do mês seguinte mantendo o mesmo dia-do-mês,
 * com tratamento seguro para meses mais curtos (ex.: 31 jan → 28 fev).
 * FUNC-02
 */
export function nextMonthSameDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const targetMonth = d.getUTCMonth() + 1;
  const targetYear =
    targetMonth > 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const normalizedMonth = targetMonth > 11 ? 0 : targetMonth;
  const lastDayOfTarget = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0)
  ).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDayOfTarget);
  const result = new Date(Date.UTC(targetYear, normalizedMonth, day));
  return result.toISOString().split("T")[0];
}

/**
 * Converte um período abreviado ("1d", "7d", "30d", "90d") em datas de início/fim.
 * Usado em dashboards de KPI.
 */
export function parsePeriodDates(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  const days =
    period === "1d" ? 1 : period === "30d" ? 30 : period === "90d" ? 90 : 7;
  start.setDate(start.getDate() - days);
  return { start, end };
}

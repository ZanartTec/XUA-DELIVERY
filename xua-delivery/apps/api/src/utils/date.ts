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
 * Dado um array de weekdays (0=Dom..6=Sáb) e uma data base,
 * retorna a próxima data (ISO YYYY-MM-DD) cujo dia-da-semana está no array.
 * Se `inclusive` = true e a data base já bate, retorna a própria data base.
 */
export function nextWeekdayDate(
  weekdays: number[],
  fromDate: Date,
  inclusive = false,
): string {
  if (weekdays.length === 0) throw new Error("weekdays vazio");
  const set = new Set(weekdays);
  const start = inclusive ? 0 : 1;
  for (let offset = start; offset < start + 7; offset++) {
    const d = new Date(
      Date.UTC(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate() + offset,
      ),
    );
    if (set.has(d.getUTCDay())) return d.toISOString().split("T")[0];
  }
  throw new Error("nenhum weekday válido (não deveria acontecer)");
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

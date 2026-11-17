/**
 * Dia de calendário da operação (America/Sao_Paulo).
 *
 * "Hoje" não pode vir de `toISOString()` (UTC): às 21h de Brasília o UTC já virou o dia seguinte,
 * e tudo que compara com uma data de entrega (`delivery_date`, coluna `DATE`) passaria a tratar os
 * pedidos de hoje como atrasados. Todo "dia de calendário" da operação passa por aqui, como
 * string `YYYY-MM-DD`.
 */
export const OPERATION_TIME_ZONE = "America/Sao_Paulo";

const operationDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: OPERATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia de calendário (YYYY-MM-DD) de um instante, no fuso da operação. */
export function operationDayIso(instant: Date = new Date()): string {
  return operationDayFormatter.format(instant);
}

/** Soma dias a um YYYY-MM-DD sem passar por fuso (aritmética em UTC puro, sem efeito de horário de verão). */
export function addDaysToIsoDay(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

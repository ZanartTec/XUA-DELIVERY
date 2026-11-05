/**
 * Datas de calendário no fuso da operação (America/Sao_Paulo).
 *
 * O "hoje" do app não pode vir de `toISOString()` (UTC): às 21h de Brasília
 * o UTC já virou o dia seguinte e o agendamento bloqueava o dia corrente (C-05).
 * Tudo que for "dia de calendário" passa por aqui como string `YYYY-MM-DD`.
 */
export const APP_TIME_ZONE = "America/Sao_Paulo";

const isoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia de calendário (YYYY-MM-DD) de um instante, no fuso da operação. */
export function toIsoDay(instant: Date = new Date()): string {
  return isoDayFormatter.format(instant);
}

/** "Hoje" no fuso da operação, como YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDay(now);
}

/** Soma dias a um YYYY-MM-DD sem passar por fuso (aritmética em UTC puro). */
export function addDaysIso(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Converte YYYY-MM-DD em Date ao meio-dia UTC — seguro para formatar em qualquer fuso. */
export function isoDayToDate(isoDay: string): Date {
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Hora atual (0–23) no fuso da operação. */
export function currentHourInAppZone(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

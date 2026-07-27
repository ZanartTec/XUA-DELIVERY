import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge de classes Tailwind — padrão shadcn/ui */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata centavos para moeda BRL: 5000 → "R$ 50,00" */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/**
 * Campos date-only ("YYYY-MM-DD") ou UTC midnight do Prisma @db.Date ("YYYY-MM-DDT00:00:00.000Z"):
 * interpretamos como meia-noite local para evitar o shift de fuso horário no Brasil (UTC-3).
 */
function resolveSafeDate(date: Date | string): Date {
  if (typeof date === "string") {
    if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(date)) {
      const [year, month, day] = date.slice(0, 10).split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date(date);
  }
  return date;
}

/** Formata Date para string legível pt-BR: "20 de mar. de 2026" */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(resolveSafeDate(date));
}

/** Formata Date para "27/07" — compacto, usado nos cards da fila. */
export function formatDateShort(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(resolveSafeDate(date));
}

/** Formata Date para string de hora: "09:30" */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "agora" / "há 12min" / "há 3h" / "há 2d" — cai para formatDateShort acima de 6 dias. */
export function formatRelativeShort(date: Date | string, now: Date = new Date()): string {
  const target = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - target.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days <= 6) return `há ${days}d`;
  return formatDateShort(target);
}

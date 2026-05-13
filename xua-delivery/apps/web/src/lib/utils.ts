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

/** Formata Date para string legível pt-BR: "20 de mar. de 2026" */
export function formatDate(date: Date | string): string {
  let d: Date;
  if (typeof date === "string") {
    // Campos date-only ("YYYY-MM-DD") ou UTC midnight do Prisma @db.Date ("YYYY-MM-DDT00:00:00.000Z"):
    // interpretamos como meia-noite local para evitar o shift de fuso horário no Brasil (UTC-3).
    if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(date)) {
      const [year, month, day] = date.slice(0, 10).split("-").map(Number);
      d = new Date(year, month - 1, day);
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Formata Date para string de hora: "09:30" */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

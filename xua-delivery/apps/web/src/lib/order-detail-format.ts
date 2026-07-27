import { OrderStatus } from "@/src/types/enums";
import type { OrderDetail } from "@/src/types/order-detail";

interface ScheduledTimeFields {
  scheduled_time_label?: string | null;
  scheduled_time_start_hour?: number | null;
  scheduled_time_start_minute?: number | null;
  scheduled_time_end_hour?: number | null;
  scheduled_time_end_minute?: number | null;
  delivery_window: string;
}

export const EVENT_LABELS: Record<string, string> = {
  ORDER_CREATED: "Pedido criado",
  ORDER_PRICING_FINALIZED: "Preço finalizado",
  ORDER_CONFIRMED: "Pagamento confirmado",
  ORDER_CANCELLED: "Pedido cancelado",
  ORDER_RECEIVED_BY_DISTRIBUTOR: "Recebido pela distribuidora",
  ORDER_ACCEPTED_BY_DISTRIBUTOR: "Aceito pela distribuidora",
  ORDER_REJECTED_BY_DISTRIBUTOR: "Recusado pela distribuidora",
  ORDER_DRIVER_ASSIGNED: "Motorista atribuído",
  DISPATCH_CHECKLIST_COMPLETED: "Checklist concluído",
  ORDER_DISPATCHED: "Pedido despachado",
  OTP_GENERATED: "Código de entrega gerado",
  OTP_SENT: "Código de entrega enviado",
  OTP_VALIDATION_ATTEMPTED: "Código de entrega validado",
  OTP_OVERRIDE: "Entrega liberada sem código (override)",
  ORDER_DELIVERED: "Pedido entregue",
  BOTTLE_EXCHANGE_RECORDED: "Troca de vasilhame registrada",
  EMPTY_NOT_COLLECTED: "Vasilhame vazio não coletado",
  REDELIVERY_REQUIRED: "Reentrega necessária",
  REDELIVERY_SCHEDULED: "Reentrega agendada",
  PAYMENT_CREATED: "Pagamento criado",
  PAYMENT_CAPTURED: "Pagamento capturado",
  PAYMENT_FAILED: "Falha no pagamento",
  PAYMENT_EXPIRED: "Pagamento expirado",
  PAYMENT_REFUNDED: "Pagamento reembolsado",
  PAYMENT_REFUND_FAILED: "Falha no reembolso",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pagamento pendente",
  pending_payment: "Pagamento pendente",
  ACTIVE: "Ativa",
  active: "Ativa",
  PAUSED: "Pausada",
  paused: "Pausada",
  CANCELLED: "Cancelada",
  cancelled: "Cancelada",
  COMPLETED: "Concluída",
  completed: "Concluída",
};

export const DELIVERY_STEPS = [
  { key: "received", label: "Recebido", shortLabel: "Receb." },
  { key: "accepted", label: "Aceite", shortLabel: "Aceite" },
  { key: "dispatch", label: "Despacho", shortLabel: "Desp." },
  { key: "route", label: "Em rota", shortLabel: "Rota" },
  { key: "done", label: "Concluído", shortLabel: "Concl." },
] as const;

export const TERMINAL_ISSUE_STATUSES = [
  OrderStatus.REJECTED_BY_DISTRIBUTOR,
  OrderStatus.CANCELLED,
  OrderStatus.DELIVERY_FAILED,
] as const;

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

export function formatShortOrderId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function formatWindowLabel(window: string) {
  return window === "MORNING" ? "Manhã (08:00-12:00)" : "Tarde (13:00-18:00)";
}

/**
 * Exibe o horário priorizando o snapshot imutável gravado no pedido.
 * Fallback para janela genérica em pedidos antigos (pré-snapshot).
 */
export function formatScheduledTime(order: ScheduledTimeFields) {
  if (order.scheduled_time_label) return order.scheduled_time_label;
  if (order.scheduled_time_start_hour != null && order.scheduled_time_end_hour != null) {
    const startMinute = order.scheduled_time_start_minute ?? 0;
    const endMinute = order.scheduled_time_end_minute ?? 0;
    return `${pad2(order.scheduled_time_start_hour)}:${pad2(startMinute)}–${pad2(order.scheduled_time_end_hour)}:${pad2(endMinute)}`;
  }
  return formatWindowLabel(order.delivery_window);
}

export function isFromSubscription(order: { order_origin?: "cart" | "subscription" }) {
  return order.order_origin === "subscription";
}

export function formatSubscriptionProgress(order: OrderDetail) {
  if (order.delivery_sequence == null || order.total_deliveries == null) return null;
  return `Entrega ${order.delivery_sequence}/${order.total_deliveries}`;
}

export function formatEventLabel(status: string) {
  return EVENT_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ");
}

export function formatSubscriptionStatus(status?: string | null) {
  if (!status) return "-";
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ");
}

export function matchesStatuses(status: string, statuses: readonly string[]) {
  return statuses.includes(status);
}

export function getStatusStepIndex(status: string) {
  switch (status) {
    case OrderStatus.SENT_TO_DISTRIBUTOR:
      return 0;
    case OrderStatus.ACCEPTED_BY_DISTRIBUTOR:
      return 1;
    case OrderStatus.READY_FOR_DISPATCH:
      return 2;
    case OrderStatus.OUT_FOR_DELIVERY:
      return 3;
    case OrderStatus.DELIVERED:
      return 4;
    default:
      return 0;
  }
}

const DEFAULT_WINDOW_END_HOUR: Record<string, number> = { MORNING: 12, AFTERNOON: 18 };

/** Meia-noite local — mesmo cuidado de fuso de `resolveSafeDate` em `lib/utils.ts`. */
function toLocalMidnight(date: Date | string): Date {
  if (typeof date === "string") {
    if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(date)) {
      const [year, month, day] = date.slice(0, 10).split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDeliveryWindowEnd(order: ScheduledTimeFields, deliveryDay: Date): Date {
  const endHour = order.scheduled_time_end_hour ?? DEFAULT_WINDOW_END_HOUR[order.delivery_window] ?? 18;
  const endMinute = order.scheduled_time_end_minute ?? 0;
  const end = new Date(deliveryDay);
  end.setHours(endHour, endMinute, 0, 0);
  return end;
}

export type DeliveryUrgencyLevel = "overdue" | "urgent" | "soon" | "normal" | "none";

export interface DeliveryUrgency {
  level: DeliveryUrgencyLevel;
  /** Negativo = dias em atraso; 0 = hoje; 1 = amanhã; etc. */
  daysRemaining: number;
  label: string;
}

export interface DeliveryUrgencyInput extends ScheduledTimeFields {
  delivery_date: string | Date;
  status: string;
}

/**
 * Urgência de entrega a partir de delivery_date + fim da janela agendada.
 * "none" para status finais (entregue/cancelado/etc.) — não há ação a tomar
 * num pedido já resolvido, então o card não marca urgência/atraso pra ele.
 */
export function getDeliveryUrgency(order: DeliveryUrgencyInput, now: Date = new Date()): DeliveryUrgency {
  if (matchesStatuses(order.status, [...TERMINAL_ISSUE_STATUSES, OrderStatus.DELIVERED])) {
    return { level: "none", daysRemaining: 0, label: "" };
  }

  const today = toLocalMidnight(now);
  const deliveryDay = toLocalMidnight(order.delivery_date);
  const daysRemaining = Math.round((deliveryDay.getTime() - today.getTime()) / 86_400_000);
  const windowEnd = getDeliveryWindowEnd(order, deliveryDay);
  const isOverdue = daysRemaining < 0 || (daysRemaining === 0 && now.getTime() > windowEnd.getTime());

  if (isOverdue) {
    return {
      level: "overdue",
      daysRemaining,
      label: daysRemaining < 0 ? `Atrasado ${Math.abs(daysRemaining)}d` : "Atrasado",
    };
  }
  if (daysRemaining === 0) return { level: "urgent", daysRemaining, label: "Hoje" };
  if (daysRemaining === 1) return { level: "soon", daysRemaining, label: "Amanhã" };
  return { level: "normal", daysRemaining, label: `Em ${daysRemaining}d` };
}

export function getOperationalMessage(status: string) {
  switch (status) {
    case OrderStatus.REJECTED_BY_DISTRIBUTOR:
      return "Pedido recusado. O consumidor já deve receber a atualização deste status.";
    case OrderStatus.OUT_FOR_DELIVERY:
      return "Pedido já despachado. Agora o acompanhamento principal acontece na fila de entregas do motorista.";
    case OrderStatus.DELIVERED:
      return "Pedido concluído com sucesso. Esta tela permanece apenas para consulta operacional.";
    case OrderStatus.READY_FOR_DISPATCH:
      return "Checklist concluído e pedido pronto para despacho.";
    default:
      return "Revise os dados do pedido e avance somente quando a etapa operacional estiver concluída.";
  }
}

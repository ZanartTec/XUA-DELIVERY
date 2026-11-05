import { OrderStatus } from "@/src/types/enums";

export type StatusTone = "neutral" | "info" | "progress" | "warning" | "success" | "danger";

export const ORDER_STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  [OrderStatus.DRAFT]: { label: "Rascunho", tone: "neutral" },
  [OrderStatus.CREATED]: { label: "Criado", tone: "neutral" },
  [OrderStatus.PAYMENT_PENDING]: { label: "Aguardando pagamento", tone: "warning" },
  [OrderStatus.CONFIRMED]: { label: "Confirmado", tone: "info" },
  [OrderStatus.SENT_TO_DISTRIBUTOR]: { label: "Aguardando distribuidora", tone: "info" },
  [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: { label: "Aceito", tone: "progress" },
  [OrderStatus.REJECTED_BY_DISTRIBUTOR]: { label: "Recusado", tone: "danger" },
  [OrderStatus.PICKING]: { label: "Em separação", tone: "progress" },
  [OrderStatus.READY_FOR_DISPATCH]: { label: "Pronto para sair", tone: "progress" },
  [OrderStatus.OUT_FOR_DELIVERY]: { label: "A caminho", tone: "progress" },
  [OrderStatus.DELIVERED]: { label: "Entregue", tone: "success" },
  [OrderStatus.DELIVERY_FAILED]: { label: "Falha na entrega", tone: "danger" },
  [OrderStatus.REDELIVERY_SCHEDULED]: { label: "Reentrega agendada", tone: "warning" },
  [OrderStatus.CANCELLED]: { label: "Cancelado", tone: "neutral" },
};

export function orderStatusMeta(status: string) {
  return ORDER_STATUS_META[status] ?? { label: status.toLowerCase().replaceAll("_", " "), tone: "neutral" as const };
}

/** Etapas que o consumidor acompanha. */
export const CONSUMER_ORDER_STEPS = ["Confirmado", "Aceito", "A caminho", "Entregue"] as const;

export type OrderProgress =
  | { kind: "progress"; current: number }
  | { kind: "pending" }
  | { kind: "issue" };

/**
 * Posição do pedido nas etapas do consumidor. "Enviado à distribuidora" ainda
 * é a etapa "Confirmado" — antes marcava "A caminho" (C-07).
 */
export function consumerOrderProgress(status: string): OrderProgress {
  switch (status) {
    case OrderStatus.DRAFT:
    case OrderStatus.CREATED:
    case OrderStatus.PAYMENT_PENDING:
      return { kind: "pending" };
    case OrderStatus.CONFIRMED:
    case OrderStatus.SENT_TO_DISTRIBUTOR:
      return { kind: "progress", current: 0 };
    case OrderStatus.ACCEPTED_BY_DISTRIBUTOR:
    case OrderStatus.PICKING:
    case OrderStatus.READY_FOR_DISPATCH:
    case OrderStatus.REDELIVERY_SCHEDULED:
      return { kind: "progress", current: 1 };
    case OrderStatus.OUT_FOR_DELIVERY:
      return { kind: "progress", current: 2 };
    case OrderStatus.DELIVERED:
      return { kind: "progress", current: 3 };
    default:
      return { kind: "issue" };
  }
}

export const ACTIVE_ORDER_STATUSES: readonly string[] = [
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.SENT_TO_DISTRIBUTOR,
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.PICKING,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.REDELIVERY_SCHEDULED,
];

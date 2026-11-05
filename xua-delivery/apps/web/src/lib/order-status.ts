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

/**
 * Rótulos do ponto de vista da operação (distribuidora, motorista, ops):
 * "Aguardando distribuidora" faz sentido para o cliente, não para quem aceita.
 */
const OPS_STATUS_LABELS: Partial<Record<string, string>> = {
  [OrderStatus.SENT_TO_DISTRIBUTOR]: "Novo",
  [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: "Aceito · separar",
  [OrderStatus.READY_FOR_DISPATCH]: "Pronto para despachar",
  [OrderStatus.OUT_FOR_DELIVERY]: "Em rota",
  [OrderStatus.CONFIRMED]: "Confirmado",
};

export function opsStatusLabel(status: string) {
  return OPS_STATUS_LABELS[status] ?? orderStatusMeta(status).label;
}

/** Etapas da operação da distribuidora. */
export const OPS_ORDER_STEPS = ["Recebido", "Aceito", "Despachado", "Entregue"] as const;

/**
 * Quantas etapas já foram cumpridas (a próxima é a "atual").
 * Antes "Aceito" aparecia como etapa 1 e PICKING caía em 0 (D-02).
 */
export function opsStepsDone(status: string): number | null {
  switch (status) {
    case OrderStatus.SENT_TO_DISTRIBUTOR:
      return 1;
    case OrderStatus.ACCEPTED_BY_DISTRIBUTOR:
    case OrderStatus.PICKING:
    case OrderStatus.READY_FOR_DISPATCH:
    case OrderStatus.REDELIVERY_SCHEDULED:
      return 2;
    case OrderStatus.OUT_FOR_DELIVERY:
      return 3;
    case OrderStatus.DELIVERED:
      return 4;
    default:
      return null;
  }
}

/** Quem fez a ação no histórico (antes saía "distributor_user", "system"...). */
export const ACTOR_TYPE_LABELS: Record<string, string> = {
  CONSUMER: "Cliente",
  DISTRIBUTOR_USER: "Distribuidora",
  DRIVER: "Motorista",
  OPS: "Operação",
  SUPPORT: "Suporte",
  SYSTEM: "Automático",
  PAYMENT_GATEWAY: "Mercado Pago",
};

export function actorTypeLabel(actorType?: string | null) {
  if (!actorType) return null;
  return ACTOR_TYPE_LABELS[actorType.toUpperCase()] ?? null;
}

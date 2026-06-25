import { OrderStatus } from "@xua/shared/enums";
import { OrderServiceError } from "../errors.js";

// ARCH-03: Máquina de estados — transições válidas (com estados intermediários)
export const VALID_TRANSITIONS: Record<string, string[]> = {
  [OrderStatus.CREATED]: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SENT_TO_DISTRIBUTOR, OrderStatus.CANCELLED],
  [OrderStatus.SENT_TO_DISTRIBUTOR]: [
    OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    OrderStatus.REJECTED_BY_DISTRIBUTOR,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.CANCELLED],
  [OrderStatus.REJECTED_BY_DISTRIBUTOR]: [],
  [OrderStatus.READY_FOR_DISPATCH]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERY_FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.DELIVERY_FAILED]: [OrderStatus.REDELIVERY_SCHEDULED, OrderStatus.CANCELLED],
  [OrderStatus.REDELIVERY_SCHEDULED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [],
};

export function assertTransition(currentStatus: string, newStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new OrderServiceError(
      "INVALID_TRANSITION",
      `Transição inválida: ${currentStatus} → ${newStatus}`
    );
  }
}

/**
 * Mutação lateral (driver_id) que não passa pela máquina de estados acima —
 * permitida enquanto o pedido estiver numa dessas fases de preparação.
 */
export const ASSIGNABLE_DRIVER_STATUSES = new Set<string>([
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.READY_FOR_DISPATCH,
]);

export const CANCEL_AUTO_RETURN_STATUSES = new Set<string>([
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.READY_FOR_DISPATCH,
]);

export const CANCEL_EXPLICIT_RETURN_STATUSES = new Set<string>([
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
]);

import type { OrderStatus } from "../enums/index";

/**
 * Contrato dos eventos de tempo real (Socket.IO) entre API, worker e web.
 *
 * Os nomes são os mesmos que já trafegavam como strings soltas — mudar um
 * deles quebra clientes já abertos durante o deploy. Payloads só podem ganhar
 * campos (opcionais para quem lê), nunca perder.
 */
export const RealtimeEvent = {
  NEW_ORDER: "new_order",
  ORDER_STATUS_CHANGED: "order_status_changed",
  NEW_DELIVERY: "new_delivery",
  DELIVERY_ASSIGNED: "delivery_assigned",
  OTP_GENERATED: "otp_generated",
  OTP_LOCKED: "otp_locked",
  BOTTLE_STEP_RECORDED: "bottle_step_recorded",
} as const;

export type RealtimeEventName = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export const REALTIME_EVENT_NAMES: readonly RealtimeEventName[] = Object.values(RealtimeEvent);

export function isRealtimeEventName(value: string): value is RealtimeEventName {
  return (REALTIME_EVENT_NAMES as readonly string[]).includes(value);
}

/** Origem do pedido, para a tela decidir se alerta com som (D6). */
export type RealtimeOrderOrigin = "avulso" | "assinatura";

export interface NewOrderPayload {
  orderId: string;
  status: OrderStatus;
  origin?: RealtimeOrderOrigin;
  deliveryDate?: string | null;
  totalCents?: number;
  itemsCount?: number;
  customerFirstName?: string | null;
}

export interface OrderStatusChangedPayload {
  orderId: string;
  status: OrderStatus;
  driverId?: string | null;
  distributorId?: string;
  reason?: string;
  newDate?: string;
  [extra: string]: unknown;
}

export interface DeliveryPayload {
  orderId: string;
  status: OrderStatus;
}

export interface OtpGeneratedPayload {
  orderId: string;
  code: string;
}

export interface OtpLockedPayload {
  orderId: string;
  distributorId: string;
  driverId: string;
  attempts: number;
}

export interface BottleStepRecordedPayload {
  orderId: string;
  [extra: string]: unknown;
}

export interface RealtimePayloads {
  new_order: NewOrderPayload;
  order_status_changed: OrderStatusChangedPayload;
  new_delivery: DeliveryPayload;
  delivery_assigned: DeliveryPayload;
  otp_generated: OtpGeneratedPayload;
  otp_locked: OtpLockedPayload;
  bottle_step_recorded: BottleStepRecordedPayload;
}

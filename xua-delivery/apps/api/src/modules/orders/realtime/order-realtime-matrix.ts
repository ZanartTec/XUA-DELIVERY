import { OrderStatus } from "@xua/shared/enums";
import type { RealtimeEventName } from "@xua/shared/realtime/events";

/**
 * Matriz status × comunicação (seção 1.3 do plano de tempo real), em código.
 *
 * É documental: os serviços NÃO leem esta tabela em runtime. Ela existe para o
 * teste U5 percorrer cada linha executando o serviço de verdade e comparar o
 * que saiu (salas, eventos, pushes) com o que está escrito aqui. Mudou uma
 * regra de aviso? Muda aqui e o teste aponta o serviço que ficou para trás.
 *
 * Fora daqui (testados em outros arquivos): expiração de pagamento no worker
 * (U4), `bottle_step_recorded` e `otp_locked`, que não são transições.
 */

export type RealtimeAudience = "consumer" | "distributor" | "driver" | "ops";
export type PushAudience = "consumer" | "distributor" | "driver";

export interface OrderRealtimeRule {
  /** Identificador do cenário (usado pelo teste para escolher o serviço). */
  scenario: string;
  description: string;
  from: OrderStatus | null;
  to: OrderStatus;
  process: "api" | "worker" | "api|worker";
  sockets: ReadonlyArray<{ audience: RealtimeAudience; event: RealtimeEventName }>;
  push: readonly PushAudience[];
}

const statusChanged = "order_status_changed" as const;

export const ORDER_REALTIME_MATRIX: readonly OrderRealtimeRule[] = [
  {
    scenario: "confirm_payment",
    description: "Pagamento online aprovado (webhook)",
    from: OrderStatus.PAYMENT_PENDING,
    to: OrderStatus.CONFIRMED,
    process: "worker",
    sockets: [{ audience: "consumer", event: statusChanged }],
    push: [],
  },
  {
    scenario: "send_to_distributor_single",
    description: "Pedido avulso chega à distribuidora",
    from: OrderStatus.CONFIRMED,
    to: OrderStatus.SENT_TO_DISTRIBUTOR,
    process: "api|worker",
    sockets: [
      { audience: "distributor", event: "new_order" },
      { audience: "consumer", event: statusChanged },
    ],
    push: ["distributor"],
  },
  {
    scenario: "send_to_distributor_subscription",
    description: "Pedido de assinatura chega à distribuidora (D6: sem push individual)",
    from: OrderStatus.CONFIRMED,
    to: OrderStatus.SENT_TO_DISTRIBUTOR,
    process: "worker",
    sockets: [
      { audience: "distributor", event: "new_order" },
      { audience: "consumer", event: statusChanged },
    ],
    push: [],
  },
  {
    scenario: "accept",
    description: "Distribuidora aceita",
    from: OrderStatus.SENT_TO_DISTRIBUTOR,
    to: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "distributor", event: statusChanged },
    ],
    push: ["consumer"],
  },
  {
    scenario: "reject",
    description: "Distribuidora recusa",
    from: OrderStatus.SENT_TO_DISTRIBUTOR,
    to: OrderStatus.REJECTED_BY_DISTRIBUTOR,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "distributor", event: statusChanged },
    ],
    push: ["consumer"],
  },
  {
    scenario: "assign_driver",
    description: "Distribuidora atribui motorista (status não muda)",
    from: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    to: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    process: "api",
    sockets: [
      { audience: "distributor", event: statusChanged },
      { audience: "driver", event: "delivery_assigned" },
    ],
    push: [],
  },
  {
    scenario: "complete_checklist",
    description: "Separação concluída",
    from: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    to: OrderStatus.READY_FOR_DISPATCH,
    process: "api",
    sockets: [
      { audience: "distributor", event: statusChanged },
      { audience: "consumer", event: statusChanged },
    ],
    push: [],
  },
  {
    scenario: "dispatch",
    description: "Saiu para entrega",
    from: OrderStatus.READY_FOR_DISPATCH,
    to: OrderStatus.OUT_FOR_DELIVERY,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "consumer", event: "otp_generated" },
      { audience: "distributor", event: statusChanged },
      { audience: "driver", event: "new_delivery" },
    ],
    push: ["consumer", "driver"],
  },
  {
    scenario: "deliver",
    description: "Entregue",
    from: OrderStatus.OUT_FOR_DELIVERY,
    to: OrderStatus.DELIVERED,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "distributor", event: statusChanged },
    ],
    push: ["consumer"],
  },
  {
    scenario: "delivery_failed",
    description: "Falha na entrega",
    from: OrderStatus.OUT_FOR_DELIVERY,
    to: OrderStatus.DELIVERY_FAILED,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "distributor", event: statusChanged },
      { audience: "ops", event: statusChanged },
    ],
    push: ["consumer"],
  },
  {
    scenario: "schedule_redelivery",
    description: "Ops agenda reentrega",
    from: OrderStatus.DELIVERY_FAILED,
    to: OrderStatus.REDELIVERY_SCHEDULED,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "distributor", event: statusChanged },
      { audience: "ops", event: statusChanged },
    ],
    push: ["consumer"],
  },
  {
    scenario: "cancel_by_consumer_before_distributor",
    description: "Cliente cancela antes de o pedido chegar à distribuidora",
    from: OrderStatus.PAYMENT_PENDING,
    to: OrderStatus.CANCELLED,
    process: "api",
    sockets: [{ audience: "consumer", event: statusChanged }],
    push: [],
  },
  {
    scenario: "cancel_by_consumer_after_accept",
    description: "Cliente cancela pedido já aceito e com motorista escalado",
    from: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    to: OrderStatus.CANCELLED,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "distributor", event: statusChanged },
      { audience: "driver", event: statusChanged },
    ],
    push: ["distributor"],
  },
  {
    scenario: "cancel_by_distributor",
    description: "Distribuidora cancela pedido recém-chegado",
    from: OrderStatus.SENT_TO_DISTRIBUTOR,
    to: OrderStatus.CANCELLED,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "distributor", event: statusChanged },
    ],
    push: ["consumer"],
  },
  {
    scenario: "cancel_by_ops_out_for_delivery",
    description: "Ops cancela pedido em rota",
    from: OrderStatus.OUT_FOR_DELIVERY,
    to: OrderStatus.CANCELLED,
    process: "api",
    sockets: [
      { audience: "consumer", event: statusChanged },
      { audience: "distributor", event: statusChanged },
      { audience: "driver", event: statusChanged },
    ],
    push: ["consumer", "distributor", "driver"],
  },
];

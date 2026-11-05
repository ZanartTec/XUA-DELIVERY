"use client";

import { cn } from "@/src/lib/utils";
import { useIsClient } from "@/src/hooks/use-is-client";
import { formatEventLabel, resolveEventType } from "@/src/lib/order-detail-format";

export interface TimelineEvent {
  status: string;
  timestamp: string;
  actor?: string;
  /** Detalhe do evento. Necessário para resolver eventos históricos gravados
   *  com o tipo errado — ver `resolveEventType`. */
  payload?: unknown;
}

interface OrderTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  ORDER_CREATED:               { label: "Pedido criado", color: "bg-secondary text-primary" },
  ORDER_DRAFT_CREATED:         { label: "Pedido iniciado", color: "bg-surface-high text-muted-foreground" },
  PAYMENT_PENDING:             { label: "Aguardando pagamento", color: "bg-warning-surface text-warning-foreground" },
  PAYMENT_CAPTURED:            { label: "Pagamento confirmado", color: "bg-success-surface text-success-foreground" },
  PAYMENT_FAILED:              { label: "Falha no pagamento", color: "bg-danger-surface text-destructive" },
  ORDER_CONFIRMED:             { label: "Pedido confirmado", color: "bg-success-surface text-success-foreground" },
  ORDER_RECEIVED_BY_DISTRIBUTOR: { label: "Recebido pelo distribuidor", color: "bg-secondary text-primary" },
  ORDER_ACCEPTED_BY_DISTRIBUTOR: { label: "Aceito pelo distribuidor", color: "bg-success-surface text-success-foreground" },
  ORDER_REJECTED_BY_DISTRIBUTOR: { label: "Rejeitado pelo distribuidor", color: "bg-danger-surface text-destructive" },
  ORDER_PICKING:               { label: "Em separação", color: "bg-warning-surface text-warning-foreground" },
  ORDER_READY_FOR_DISPATCH:    { label: "Pronto para despacho", color: "bg-sky/15 text-primary" },
  ORDER_DISPATCHED:            { label: "Despachado ao motorista", color: "bg-sky/15 text-primary" },
  ORDER_OUT_FOR_DELIVERY:      { label: "Em rota de entrega", color: "bg-sky/15 text-primary" },
  ORDER_DELIVERED:             { label: "Entregue com sucesso", color: "bg-success-surface text-success-foreground" },
  ORDER_DELIVERY_FAILED:       { label: "Falha na entrega", color: "bg-danger-surface text-destructive" },
  REDELIVERY_REQUIRED:         { label: "Falha na entrega", color: "bg-danger-surface text-destructive" },
  REDELIVERY_SCHEDULED:        { label: "Reentrega agendada", color: "bg-warning-surface text-warning-foreground" },
  ORDER_CANCELLED:             { label: "Pedido cancelado", color: "bg-surface-high text-muted-foreground" },
  OTP_GENERATED:               { label: "Código de confirmação gerado", color: "bg-secondary text-primary" },
  OTP_VALIDATED:               { label: "Código de confirmação validado", color: "bg-success-surface text-success-foreground" },
  OTP_FAILED:                  { label: "Tentativa inválida de código", color: "bg-danger-surface text-destructive" },
  CHECKLIST_COMPLETED:         { label: "Checklist concluído", color: "bg-sky/15 text-primary" },
  BOTTLE_EXCHANGE:             { label: "Troca de vasilhame registrada", color: "bg-warning-surface text-warning-foreground" },
  NON_COLLECTION:              { label: "Não coletado registrado", color: "bg-warning-surface text-warning-foreground" },
  RECEIPT_ISSUED:              { label: "Comprovante de venda emitido", color: "bg-surface-high text-muted-foreground" },
  RECEIPT_PRINTED:             { label: "Comprovante de venda impresso", color: "bg-surface-high text-muted-foreground" },
};

const ACTOR_LABELS: Record<string, string> = {
  "payment-gateway": "Mercado Pago",
  "mock-gateway":    "Mercado Pago",
};

/**
 * Só mostra o ator quando ele diz algo a quem lê (ex.: "Mercado Pago").
 * UUIDs e identificadores técnicos ("system", "pay-on-delivery") ficam ocultos.
 */
function formatActor(actor: string): string {
  if (ACTOR_LABELS[actor]) return ACTOR_LABELS[actor];
  if (/^[a-z0-9_-]+$/i.test(actor)) return "";
  return actor;
}

export function OrderTimeline({ events, className }: OrderTimelineProps) {
  const isClient = useIsClient();
  return (
    <ol className={cn("relative border-l border-hairline ml-3", className)}>
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        const eventType = resolveEventType(event.status, event.payload);
        const config = EVENT_LABELS[eventType] ?? {
          label: formatEventLabel(event.status, event.payload).replace(/^\w/, (c) => c.toUpperCase()),
          color: "bg-surface-high text-muted-foreground",
        };
        const actor = event.actor ? formatActor(event.actor) : "";

        return (
          <li key={`${event.status}-${event.timestamp}`} className="mb-6 ml-6 last:mb-0">
            <span
              className={cn(
                "absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-card",
                isLast ? "bg-primary" : "bg-surface-highest"
              )}
            />
            <div className="flex flex-col gap-1">
              <span className={cn("inline-flex w-fit items-center rounded-md px-2.5 py-0.5 text-xs font-semibold", config.color)}>
                {config.label}
              </span>
              <time className="text-xs text-muted-foreground">
                {isClient ? new Date(event.timestamp).toLocaleString("pt-BR") : ""}
              </time>
              {actor && (
                <span className="text-xs text-muted-foreground">{actor}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

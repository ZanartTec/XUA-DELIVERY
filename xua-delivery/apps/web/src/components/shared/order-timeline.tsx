"use client";

import { cn } from "@/src/lib/utils";
import { useIsClient } from "@/src/hooks/use-is-client";

export interface TimelineEvent {
  status: string;
  timestamp: string;
  actor?: string;
}

interface OrderTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  ORDER_CREATED:               { label: "Pedido criado", color: "bg-blue-100 text-blue-700" },
  ORDER_DRAFT_CREATED:         { label: "Pedido iniciado", color: "bg-gray-100 text-gray-600" },
  PAYMENT_PENDING:             { label: "Aguardando pagamento", color: "bg-yellow-100 text-yellow-700" },
  PAYMENT_CAPTURED:            { label: "Pagamento confirmado", color: "bg-green-100 text-green-700" },
  PAYMENT_FAILED:              { label: "Falha no pagamento", color: "bg-red-100 text-red-700" },
  ORDER_CONFIRMED:             { label: "Pedido confirmado", color: "bg-green-100 text-green-700" },
  ORDER_RECEIVED_BY_DISTRIBUTOR: { label: "Recebido pelo distribuidor", color: "bg-indigo-100 text-indigo-700" },
  ORDER_ACCEPTED_BY_DISTRIBUTOR: { label: "Aceito pelo distribuidor", color: "bg-emerald-100 text-emerald-700" },
  ORDER_REJECTED_BY_DISTRIBUTOR: { label: "Rejeitado pelo distribuidor", color: "bg-red-100 text-red-700" },
  ORDER_PICKING:               { label: "Em separação", color: "bg-orange-100 text-orange-700" },
  ORDER_READY_FOR_DISPATCH:    { label: "Pronto para despacho", color: "bg-teal-100 text-teal-700" },
  ORDER_DISPATCHED:            { label: "Despachado ao motorista", color: "bg-purple-100 text-purple-700" },
  ORDER_OUT_FOR_DELIVERY:      { label: "Em rota de entrega", color: "bg-purple-100 text-purple-700" },
  ORDER_DELIVERED:             { label: "Entregue com sucesso", color: "bg-green-100 text-green-800" },
  ORDER_DELIVERY_FAILED:       { label: "Falha na entrega", color: "bg-red-100 text-red-700" },
  ORDER_CANCELLED:             { label: "Pedido cancelado", color: "bg-gray-200 text-gray-600" },
  OTP_GENERATED:               { label: "Código de confirmação gerado", color: "bg-blue-100 text-blue-700" },
  OTP_VALIDATED:               { label: "Código de confirmação validado", color: "bg-green-100 text-green-700" },
  OTP_FAILED:                  { label: "Tentativa inválida de código", color: "bg-red-100 text-red-700" },
  CHECKLIST_COMPLETED:         { label: "Checklist concluído", color: "bg-teal-100 text-teal-700" },
  BOTTLE_EXCHANGE:             { label: "Troca de vasilhame registrada", color: "bg-amber-100 text-amber-700" },
  NON_COLLECTION:              { label: "Não coletado registrado", color: "bg-orange-100 text-orange-700" },
};

const ACTOR_LABELS: Record<string, string> = {
  "payment-gateway": "Gateway de pagamento",
  "system":          "Sistema",
  "mock-gateway":    "Gateway de pagamento",
};

function formatActor(actor: string): string {
  if (ACTOR_LABELS[actor]) return ACTOR_LABELS[actor];
  // UUID — oculta, sem contexto útil para o consumidor
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(actor)) return "";
  return actor;
}

export function OrderTimeline({ events, className }: OrderTimelineProps) {
  const isClient = useIsClient();
  return (
    <ol className={cn("relative border-l border-[#e1e3e4] ml-3", className)}>
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        const config = EVENT_LABELS[event.status] ?? {
          label: event.status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
          color: "bg-gray-100 text-gray-600",
        };
        const actor = event.actor ? formatActor(event.actor) : "";

        return (
          <li key={`${event.status}-${event.timestamp}`} className="mb-6 ml-6 last:mb-0">
            <span
              className={cn(
                "absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white",
                isLast ? "bg-[#0041c8]" : "bg-[#c7cbd4]"
              )}
            />
            <div className="flex flex-col gap-1">
              <span className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", config.color)}>
                {config.label}
              </span>
              <time className="text-xs text-[#737688]">
                {isClient ? new Date(event.timestamp).toLocaleString("pt-BR") : ""}
              </time>
              {actor && (
                <span className="text-xs text-[#9fa6b2]">{actor}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

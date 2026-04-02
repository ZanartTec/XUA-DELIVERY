"use client";

import { cn } from "@/src/lib/utils";
import { OrderStatus } from "@/src/types/enums";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  [OrderStatus.DRAFT]: { label: "Rascunho", color: "bg-gray-100 text-gray-700" },
  [OrderStatus.CREATED]: { label: "Criado", color: "bg-blue-100 text-blue-700" },
  [OrderStatus.PAYMENT_PENDING]: { label: "Aguardando pagamento", color: "bg-yellow-100 text-yellow-700" },
  [OrderStatus.CONFIRMED]: { label: "Confirmado", color: "bg-green-100 text-green-700" },
  [OrderStatus.SENT_TO_DISTRIBUTOR]: { label: "Enviado ao distribuidor", color: "bg-indigo-100 text-indigo-700" },
  [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: { label: "Aceito", color: "bg-emerald-100 text-emerald-700" },
  [OrderStatus.REJECTED_BY_DISTRIBUTOR]: { label: "Rejeitado", color: "bg-red-100 text-red-700" },
  [OrderStatus.PICKING]: { label: "Separando", color: "bg-orange-100 text-orange-700" },
  [OrderStatus.READY_FOR_DISPATCH]: { label: "Pronto para despacho", color: "bg-teal-100 text-teal-700" },
  [OrderStatus.OUT_FOR_DELIVERY]: { label: "Em rota de entrega", color: "bg-purple-100 text-purple-700" },
  [OrderStatus.DELIVERED]: { label: "Entregue", color: "bg-green-100 text-green-800" },
  [OrderStatus.DELIVERY_FAILED]: { label: "Falha na entrega", color: "bg-red-100 text-red-700" },
  [OrderStatus.REDELIVERY_SCHEDULED]: { label: "Reentrega agendada", color: "bg-amber-100 text-amber-700" },
  [OrderStatus.CANCELLED]: { label: "Cancelado", color: "bg-gray-200 text-gray-600" },
};

interface StatusPillProps {
  status: string;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    color: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}

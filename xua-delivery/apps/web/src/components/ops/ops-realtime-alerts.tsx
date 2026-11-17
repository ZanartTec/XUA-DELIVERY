"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRealtimeEvent } from "@/src/realtime/use-realtime-event";
import { formatShortOrderId } from "@/src/lib/order-detail-format";

/**
 * Avisos globais do console de ops/suporte (T3.7): só o que pede ação humana
 * chega à sala `ops:broadcast` — OTP bloqueado e falha de entrega.
 */
export function OpsRealtimeAlerts() {
  const router = useRouter();

  useRealtimeEvent("otp_locked", (data) => {
    toast.warning(`OTP bloqueado · pedido #${formatShortOrderId(data.orderId)}`, {
      description: `${data.attempts} tentativas erradas. O motorista precisa de liberação.`,
      duration: 15_000,
      action: { label: "Liberar", onClick: () => router.push("/ops/otp-override") },
    });
  });

  useRealtimeEvent("order_status_changed", (data) => {
    if (data.status === "DELIVERY_FAILED") {
      toast.error(`Falha na entrega · pedido #${formatShortOrderId(data.orderId)}`, {
        description: data.reason ? String(data.reason) : "Precisa de reagendamento.",
        duration: 15_000,
        action: { label: "Abrir", onClick: () => router.push(`/support/${data.orderId}`) },
      });
    }
  });

  return null;
}

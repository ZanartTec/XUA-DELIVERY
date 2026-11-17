"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRealtimeEvent } from "@/src/realtime/use-realtime-event";
import {
  cancellationToastMessage,
  createNewOrderAlerts,
  formatTabTitle,
} from "@/src/realtime/new-order-alerts";
import {
  installAudioUnlock,
  isNewOrderSoundEnabled,
  playNewOrderSound,
  vibrateNewOrder,
} from "@/src/realtime/alert-sound";
import { formatCurrency } from "@/src/lib/utils";
import { formatShortOrderId } from "@/src/lib/order-detail-format";

function describeNewOrder(data: {
  customerFirstName?: string | null;
  itemsCount?: number;
  totalCents?: number;
}): string | undefined {
  const parts: string[] = [];
  if (data.customerFirstName) parts.push(data.customerFirstName);
  if (data.itemsCount) parts.push(`${data.itemsCount} ${data.itemsCount === 1 ? "item" : "itens"}`);
  if (typeof data.totalCents === "number" && data.totalCents > 0) parts.push(formatCurrency(data.totalCents));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Alertas da distribuidora em QUALQUER tela dela (Fase 4): toast de pedido
 * novo com som/vibração, contador no título da aba oculta e toast de
 * cancelamento de pedido em andamento.
 */
export function DistributorAlerts() {
  const router = useRouter();
  const [alerts] = useState(() => createNewOrderAlerts());

  useEffect(() => {
    installAudioUnlock();

    // Título da aba: o contador entra quando a aba some e sai quando ela volta.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        alerts.markSeen();
        document.title = formatTabTitle(document.title, 0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.title = formatTabTitle(document.title, 0);
    };
  }, [alerts]);

  useRealtimeEvent("new_order", (data) => {
    const hidden = document.visibilityState === "hidden";
    const decision = alerts.onNewOrder(data, { hidden, soundEnabled: isNewOrderSoundEnabled() });
    if (!decision.toast) return;

    if (hidden) document.title = formatTabTitle(document.title, decision.unseen);
    if (decision.sound) {
      playNewOrderSound();
      vibrateNewOrder();
    }

    toast(`Novo pedido #${formatShortOrderId(data.orderId)}`, {
      id: `new-order-${data.orderId}`,
      description: describeNewOrder(data),
      duration: 10_000,
      action: { label: "Ver", onClick: () => router.push(`/distributor/orders/${data.orderId}`) },
    });
  });

  useRealtimeEvent("order_status_changed", (data) => {
    const message = cancellationToastMessage(data);
    if (!message) return;
    toast.warning(message, {
      id: `cancelled-${data.orderId}`,
      description: data.reason ? String(data.reason) : undefined,
      duration: 10_000,
    });
  });

  return null;
}

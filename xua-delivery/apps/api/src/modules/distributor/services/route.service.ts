import { DeliveryWindow, OrderStatus } from "@prisma/client";
import { distributorRepository } from "../repository/distributor.repository.js";

function parseRouteId(routeId: string): Date {
  if (routeId === "today") {
    return new Date();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(routeId)) {
    throw new Error("INVALID_ROUTE_ID");
  }

  const parsed = new Date(`${routeId}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("INVALID_ROUTE_ID");
  }

  return parsed;
}

function formatMapsQuery(parts: Array<string | null | undefined>) {
  return encodeURIComponent(parts.filter(Boolean).join(", "));
}

function mapStopStatus(status: OrderStatus) {
  if (status === OrderStatus.DELIVERED) {
    return { label: "Entregue", tone: "success" as const };
  }
  if (status === OrderStatus.DELIVERY_FAILED) {
    return { label: "Falha", tone: "danger" as const };
  }
  if (status === OrderStatus.READY_FOR_DISPATCH) {
    return { label: "Pronto para despacho", tone: "warning" as const };
  }
  return { label: "Pendente", tone: "neutral" as const };
}

export const routeService = {
  async getDailyRoute(distributorId: string, routeId: string) {
    const deliveryDate = parseRouteId(routeId);
    const stops = await distributorRepository.findRouteStopsByDistributor(distributorId, deliveryDate);

    const groupsMap = new Map<string, {
      zone_name: string;
      delivery_window: DeliveryWindow;
      stops: Array<{
        order_id: string;
        consumer_name: string;
        consumer_phone: string | null;
        total_items_qty: number;
        status: string;
        status_label: string;
        status_tone: "success" | "danger" | "warning" | "neutral";
        address_line: string;
        maps_url: string;
      }>;
    }>();

    for (const stop of stops) {
      const key = `${stop.zone.name}::${stop.delivery_window}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          zone_name: stop.zone.name,
          delivery_window: stop.delivery_window,
          stops: [],
        });
      }

      const addressLine = [
        `${stop.address.street}, ${stop.address.number}`,
        stop.address.complement,
        stop.address.neighborhood,
        `${stop.address.city}/${stop.address.state}`,
      ].filter(Boolean).join(" - ");

      const statusMeta = mapStopStatus(stop.status);

      groupsMap.get(key)!.stops.push({
        order_id: stop.id,
        consumer_name: stop.consumer.name,
        consumer_phone: stop.consumer.phone,
        total_items_qty: stop.items.reduce((sum, item) => sum + item.quantity, 0),
        status: stop.status,
        status_label: statusMeta.label,
        status_tone: statusMeta.tone,
        address_line: addressLine,
        maps_url: `https://www.google.com/maps/search/?api=1&query=${formatMapsQuery([
          stop.address.street,
          stop.address.number,
          stop.address.neighborhood,
          stop.address.city,
          stop.address.state,
        ])}`,
      });
    }

    const groups = Array.from(groupsMap.values()).sort((left, right) => {
      if (left.delivery_window !== right.delivery_window) {
        return left.delivery_window === DeliveryWindow.MORNING ? -1 : 1;
      }
      return left.zone_name.localeCompare(right.zone_name, "pt-BR");
    });

    return {
      id: routeId,
      date: deliveryDate.toISOString().slice(0, 10),
      total_stops: stops.length,
      delivered_stops: stops.filter((stop) => stop.status === OrderStatus.DELIVERED).length,
      pending_stops: stops.filter((stop) => stop.status !== OrderStatus.DELIVERED).length,
      groups,
    };
  },
};
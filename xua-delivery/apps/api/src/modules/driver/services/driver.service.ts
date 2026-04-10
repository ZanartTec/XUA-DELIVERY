import { driverRepository } from "../repository/driver.repository.js";
import type {
  OrderWithConsumer,
  OrderWithConsumerAndAddress,
  OrderHistoryWithConsumer,
} from "../repository/driver.repository.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("driver");

function formatAddress(address: {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
} | null) {
  if (!address) {
    return "Endereço não informado";
  }

  return [
    `${address.street}, ${address.number}`,
    address.complement,
    address.neighborhood,
    `${address.city}/${address.state}`,
  ].filter(Boolean).join(" - ");
}

function totalItemsQty(items: { quantity: number }[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export const driverService = {
  async listDeliveries(driverId: string, date?: Date) {
    log.debug({ driverId, date }, "Listing driver deliveries");
    const deliveries = await driverRepository.findTodayDeliveries(driverId, date);
    return deliveries.map((d: OrderWithConsumer, index: number) => ({
      ...d,
      consumer: undefined,
      address: undefined,
      items: undefined,
      order_id: d.id,
      consumer_name: d.consumer.name,
      consumer_phone: d.consumer.phone,
      total_items_qty: totalItemsQty(d.items),
      address_line: formatAddress(d.address),
      sequence: index + 1,
    }));
  },

  async listPendingDeliveries(driverId: string) {
    const deliveries = await driverRepository.findPendingDeliveries(driverId);
    return deliveries.map((d: OrderWithConsumerAndAddress) => ({
      ...d,
      consumer: undefined,
      address: undefined,
      consumer_name: d.consumer.name,
      consumer_phone: d.consumer.phone,
      delivery_address: d.address
        ? {
            street: d.address.street,
            number: d.address.number,
            complement: d.address.complement,
            neighborhood: d.address.neighborhood,
            city: d.address.city,
            state: d.address.state,
            zip_code: d.address.zip_code,
          }
        : null,
    }));
  },

  async listDeliveryHistory(driverId: string, limit: number, offset: number) {
    const deliveries = await driverRepository.findDeliveryHistory(
      driverId,
      limit,
      offset
    );
    return {
      deliveries: deliveries.map((delivery: OrderHistoryWithConsumer) => ({
        ...delivery,
        consumer: undefined,
        address: undefined,
        items: undefined,
        order_id: delivery.id,
        consumer_name: delivery.consumer.name,
        consumer_phone: delivery.consumer.phone,
        total_items_qty: totalItemsQty(delivery.items),
        address_line: formatAddress(delivery.address),
        occurred_at: delivery.delivered_at ?? delivery.updated_at,
        failure_reason: delivery.status === "DELIVERY_FAILED" ? delivery.cancellation_reason : null,
      })),
      limit,
      offset,
    };
  },
};

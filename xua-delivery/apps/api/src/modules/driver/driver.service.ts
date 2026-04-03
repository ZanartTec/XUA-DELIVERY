import { driverRepository } from "./driver.repository.js";
import type {
  OrderWithConsumer,
  OrderWithConsumerAndAddress,
} from "./driver.repository.js";

export const driverService = {
  async listDeliveries(driverId: string) {
    const deliveries = await driverRepository.findTodayDeliveries(driverId);
    return deliveries.map((d: OrderWithConsumer) => ({
      ...d,
      consumer: undefined,
      consumer_name: d.consumer.name,
      consumer_phone: d.consumer.phone,
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
    return { deliveries, limit, offset };
  },
};

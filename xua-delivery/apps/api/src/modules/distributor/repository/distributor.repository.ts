import { getPrisma } from "../../../infra/prisma/client.js";
import type { Address, Consumer, Order, OrderItem, Zone } from "@prisma/client";
import { ConsumerRole, OrderStatus } from "@prisma/client";

export type DistributorRouteStop = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Pick<Address, "street" | "number" | "complement" | "neighborhood" | "city" | "state">;
  zone: Pick<Zone, "name">;
  items: Pick<OrderItem, "quantity">[];
};

export const distributorRepository = {
  async findAllActive() {
    const prisma = getPrisma();
    return prisma.distributor.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
    });
  },

  async findDriversByDistributor(distributorId: string): Promise<Array<{ id: string; name: string }>> {
    const prisma = getPrisma();
    const linkedDrivers = await prisma.consumer.findMany({
      where: { role: ConsumerRole.DRIVER, distributor_id: distributorId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (linkedDrivers.length > 0) {
      return linkedDrivers;
    }

    const activeDistributors = await prisma.distributor.findMany({
      where: { is_active: true },
      select: { id: true },
    });

    if (activeDistributors.length !== 1 || activeDistributors[0]?.id !== distributorId) {
      return [];
    }

    const orphanDrivers = await prisma.consumer.findMany({
      where: { role: ConsumerRole.DRIVER, distributor_id: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (orphanDrivers.length === 0) {
      return [];
    }

    await prisma.consumer.updateMany({
      where: {
        id: { in: orphanDrivers.map((driver) => driver.id) },
        distributor_id: null,
      },
      data: { distributor_id: distributorId },
    });

    return orphanDrivers;
  },

  async findRouteStopsByDistributor(
    distributorId: string,
    deliveryDate: Date
  ): Promise<DistributorRouteStop[]> {
    const prisma = getPrisma();
    const dayStart = new Date(deliveryDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(deliveryDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    return prisma.order.findMany({
      where: {
        distributor_id: distributorId,
        delivery_date: { gte: dayStart, lte: dayEnd },
        status: {
          in: [
            OrderStatus.READY_FOR_DISPATCH,
            OrderStatus.OUT_FOR_DELIVERY,
            OrderStatus.DELIVERED,
            OrderStatus.DELIVERY_FAILED,
          ],
        },
      },
      include: {
        consumer: { select: { name: true, phone: true } },
        address: {
          select: {
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        },
        zone: { select: { name: true } },
        items: { select: { quantity: true } },
      },
      orderBy: [
        { delivery_window: "asc" },
        { created_at: "asc" },
      ],
    }) as unknown as Promise<DistributorRouteStop[]>;
  },

  /**
   * Resolve o distributor_id (empresa) a partir do ID do usuário logado.
   * Retorna null se o usuário não estiver vinculado a nenhuma distribuidora.
   */
  async resolveDistributorId(userId: string): Promise<string | null> {
    const prisma = getPrisma();
    const consumer = await prisma.consumer.findUnique({
      where: { id: userId },
      select: { distributor_id: true, role: true },
    });

    if (!consumer) {
      return null;
    }

    if (consumer.distributor_id) {
      return consumer.distributor_id;
    }

    if (consumer.role !== ConsumerRole.DRIVER) {
      return null;
    }

    const activeDistributors = await prisma.distributor.findMany({
      where: { is_active: true },
      select: { id: true },
    });

    if (activeDistributors.length !== 1) {
      return null;
    }

    const inferredDistributorId = activeDistributors[0]!.id;
    await prisma.consumer.update({
      where: { id: userId },
      data: { distributor_id: inferredDistributorId },
    });

    return inferredDistributorId;
  },
};

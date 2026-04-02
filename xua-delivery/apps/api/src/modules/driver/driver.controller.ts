import type { Request, Response } from "express";
import type { Order, Consumer, Address } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";
import { logger } from "../../infra/logger/index.js";

// Helper types
type OrderWithConsumer = Order & { consumer: Pick<Consumer, "name" | "phone"> };
type OrderWithConsumerAndAddress = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Address | null;
};

/**
 * DriverController — handlers HTTP para rotas do motorista.
 */
export const driverController = {
  /**
   * GET /api/driver/deliveries
   * Lista entregas do dia do motorista.
   */
  async listDeliveries(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const prisma = getPrisma();

    try {
      const today = new Date().toISOString().slice(0, 10);
      const dayStart = new Date(today + "T00:00:00Z");
      const dayEnd = new Date(today + "T23:59:59.999Z");

      const deliveries = await prisma.order.findMany({
        where: {
          driver_id: user.sub,
          status: {
            in: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
          },
          delivery_date: { gte: dayStart, lte: dayEnd },
        },
        include: {
          consumer: {
            select: { name: true, phone: true },
          },
        },
        orderBy: { delivery_date: "asc" },
      });

      const mapped = deliveries.map((delivery: OrderWithConsumer) => ({
        ...delivery,
        consumer: undefined,
        consumer_name: delivery.consumer.name,
        consumer_phone: delivery.consumer.phone,
      }));

      res.json(mapped);
    } catch (error) {
      logger.error({ error }, "Error listing deliveries");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * GET /api/driver/deliveries/pending
   * Lista entregas pendentes (OUT_FOR_DELIVERY) do motorista.
   */
  async listPendingDeliveries(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const prisma = getPrisma();

    try {
      const deliveries = await prisma.order.findMany({
        where: {
          driver_id: user.sub,
          status: OrderStatus.OUT_FOR_DELIVERY,
        },
        include: {
          consumer: {
            select: { name: true, phone: true },
          },
          address: true,
        },
        orderBy: { delivery_date: "asc" },
      });

      const mapped = deliveries.map((delivery: OrderWithConsumerAndAddress) => ({
        ...delivery,
        consumer: undefined,
        address: undefined,
        consumer_name: delivery.consumer.name,
        consumer_phone: delivery.consumer.phone,
        delivery_address: delivery.address
          ? {
              street: delivery.address.street,
              number: delivery.address.number,
              complement: delivery.address.complement,
              neighborhood: delivery.address.neighborhood,
              city: delivery.address.city,
              state: delivery.address.state,
              zip_code: delivery.address.zip_code,
            }
          : null,
      }));

      res.json(mapped);
    } catch (error) {
      logger.error({ error }, "Error listing pending deliveries");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * GET /api/driver/deliveries/history
   * Lista histórico de entregas do motorista.
   */
  async listDeliveryHistory(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const prisma = getPrisma();
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      const deliveries = await prisma.order.findMany({
        where: {
          driver_id: user.sub,
          status: {
            in: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
          },
        },
        orderBy: { delivered_at: "desc" },
        take: limit,
        skip: offset,
      });

      res.json({ deliveries, limit, offset });
    } catch (error) {
      logger.error({ error }, "Error listing delivery history");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};

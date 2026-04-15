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

  /**
   * Busca distribuidoras ativas com allows_consumer_choice=true que atendem
   * a mesma área geográfica (via ZoneCoverage) da zona informada e possuem
   * capacidade disponível para a data/janela solicitada.
   */
  async findAvailableForZone(
    zoneId: string,
    date: string,
    window: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      avg_nps: number | null;
      next_available_date: string | null;
    }>
  > {
    const prisma = getPrisma();
    const windowLower = window.toLowerCase();

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        avg_nps: number | null;
        next_available_date: Date | null;
      }>
    >`
      SELECT
        d.id,
        d.name,
        ROUND(AVG(o.nps_score)::numeric, 1)::float AS avg_nps,
        MIN(dc_next.delivery_date) AS next_available_date
      FROM "03_mst_distributors" d
      -- Zonas da distribuidora que cobrem a mesma área da zona informada
      JOIN "04_mst_zones" z2 ON z2.distributor_id = d.id AND z2.is_active = true
      JOIN "05_mst_zone_coverage" zc2 ON zc2.zone_id = z2.id
      -- Coverage da zona original
      JOIN "05_mst_zone_coverage" zc_orig ON zc_orig.zone_id = ${zoneId}::uuid
      -- Capacidade para a data/janela solicitada
      JOIN "07_cfg_delivery_capacity" dc
        ON dc.zone_id = z2.id
        AND dc.delivery_date = ${date}::date
        AND dc."window" = ${windowLower}::"delivery_window"
        AND dc.capacity_reserved < dc.capacity_total
      -- Próxima disponibilidade (LEFT JOIN para não excluir se não tiver futura)
      LEFT JOIN "07_cfg_delivery_capacity" dc_next
        ON dc_next.zone_id = z2.id
        AND dc_next.delivery_date >= ${date}::date
        AND dc_next.capacity_reserved < dc_next.capacity_total
      -- NPS média (LEFT JOIN em pedidos entregues)
      LEFT JOIN "09_trn_orders" o
        ON o.distributor_id = d.id AND o.nps_score IS NOT NULL
      WHERE d.is_active = true
        AND d.allows_consumer_choice = true
        AND (
          (zc2.neighborhood IS NOT NULL AND zc2.neighborhood = zc_orig.neighborhood)
          OR (zc2.zip_code IS NOT NULL AND zc2.zip_code = zc_orig.zip_code)
        )
      GROUP BY d.id, d.name
      ORDER BY avg_nps DESC NULLS LAST, d.name ASC
    `;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      avg_nps: r.avg_nps,
      next_available_date: r.next_available_date
        ? new Date(r.next_available_date).toISOString().split("T")[0]
        : null,
    }));
  },

  /**
   * Valida que o distributor_id pertence a uma zona que cobre a mesma
   * área geográfica do zoneId informado e tem capacidade para data/janela.
   */
  async validateDistributorForZone(
    distributorId: string,
    zoneId: string,
    date: string,
    window: string,
  ): Promise<{ valid: boolean; resolvedZoneId: string | null }> {
    const prisma = getPrisma();
    const windowLower = window.toLowerCase();

    const rows = await prisma.$queryRaw<Array<{ zone_id: string }>>`
      SELECT z2.id AS zone_id
      FROM "04_mst_zones" z2
      JOIN "05_mst_zone_coverage" zc2 ON zc2.zone_id = z2.id
      JOIN "05_mst_zone_coverage" zc_orig ON zc_orig.zone_id = ${zoneId}::uuid
      JOIN "07_cfg_delivery_capacity" dc
        ON dc.zone_id = z2.id
        AND dc.delivery_date = ${date}::date
        AND dc."window" = ${windowLower}::"delivery_window"
        AND dc.capacity_reserved < dc.capacity_total
      WHERE z2.distributor_id = ${distributorId}::uuid
        AND z2.is_active = true
        AND (
          (zc2.neighborhood IS NOT NULL AND zc2.neighborhood = zc_orig.neighborhood)
          OR (zc2.zip_code IS NOT NULL AND zc2.zip_code = zc_orig.zip_code)
        )
      LIMIT 1
    `;

    return {
      valid: rows.length > 0,
      resolvedZoneId: rows[0]?.zone_id ?? null,
    };
  },
};

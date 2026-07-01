import { getPrisma } from "../../../infra/prisma/client.js";
import type { Address, Consumer, Order, OrderItem, Zone } from "@prisma/client";
import { ConsumerRole, OrderStatus } from "@xua/shared/enums";

export type DistributorRouteStop = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Pick<Address, "street" | "number" | "complement" | "neighborhood" | "city" | "state">;
  zone: Pick<Zone, "name">;
  items: Pick<OrderItem, "quantity">[];
};

export const distributorRepository = {
  async findAllActive() {
    const prisma = getPrisma();
    const rows = await prisma.distributor.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        payment_settings: {
          select: { mp_access_token_enc: true, mp_webhook_secret_enc: true },
        },
      },
    });
    return rows.map(({ payment_settings, ...distributor }) => ({
      ...distributor,
      mp_connected: Boolean(
        payment_settings?.mp_access_token_enc && payment_settings?.mp_webhook_secret_enc,
      ),
    }));
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
   * Busca distribuidoras ativas com `allows_consumer_choice=true` que atendem
   * a mesma área geográfica (via ZoneCoverage) da zona informada.
   *
   * @param zoneId - ID da zona do endereço selecionado pelo consumidor.
   * @param _date  - Reservado para uso futuro (filtragem por disponibilidade de data).
   *                 Atualmente ignorado — todas as distribuidoras ativas são retornadas.
   * @param _window - Reservado para uso futuro (filtragem por janela MORNING/AFTERNOON).
   *                  Atualmente ignorado.
   *
   * Performance:
   *   - O match geográfico usa os índices `05_mst_zone_coverage_neighborhood_idx`
   *     e `05_mst_zone_coverage_zip_code_idx` criados em `20260630000000_add_zone_coverage_indexes`.
   *   - O cálculo de avg_nps usa o índice `09_trn_orders_distributor_nps_idx` (parcial
   *     WHERE nps_score IS NOT NULL) criado em `20260701120000_add_orders_nps_index`.
   *
   * @returns Array ordenado por avg_nps DESC; `next_available_date` sempre null
   *          até que o cálculo de disponibilidade por agenda seja implementado.
   */
  async findAvailableForZone(
    zoneId: string,
    _date?: string,
    _window?: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      avg_nps: number | null;
      next_available_date: string | null;
    }>
  > {
    const prisma = getPrisma();

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        avg_nps: number | null;
      }>
    >`
      WITH target_distributors AS (
        SELECT DISTINCT d.id, d.name
        FROM "03_mst_distributors" d
        JOIN "04_mst_zones" z2 ON z2.distributor_id = d.id AND z2.is_active = true
        JOIN "05_mst_zone_coverage" zc2 ON zc2.zone_id = z2.id
        JOIN "05_mst_zone_coverage" zc_orig ON zc_orig.zone_id = ${zoneId}::uuid
        WHERE d.is_active = true
          AND d.allows_consumer_choice = true
          AND (
            (zc2.neighborhood IS NOT NULL AND zc2.neighborhood = zc_orig.neighborhood)
            OR (zc2.zip_code IS NOT NULL AND zc2.zip_code = zc_orig.zip_code)
          )
      )
      SELECT
        d.id,
        d.name,
        (
          SELECT ROUND(AVG(o.nps_score)::numeric, 1)::float
          FROM "09_trn_orders" o
          WHERE o.distributor_id = d.id AND o.nps_score IS NOT NULL
        ) AS avg_nps
      FROM target_distributors d
      ORDER BY avg_nps DESC NULLS LAST, d.name ASC
    `;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      avg_nps: r.avg_nps,
      // TODO: calcular com base na agenda da distribuidora (weekdays + blocked dates)
      next_available_date: null,
    }));
  },

  /**
   * Resolve a zone da distribuidora que cobre a mesma área geográfica da
   * zone original, sem exigir capacidade para uma data específica.
   */
  async resolveCoveredZone(
    distributorId: string,
    zoneId: string,
  ): Promise<string | null> {
    const prisma = getPrisma();

    const rows = await prisma.$queryRaw<Array<{ zone_id: string }>>`
      SELECT z2.id AS zone_id
      FROM "04_mst_zones" z2
      JOIN "05_mst_zone_coverage" zc2 ON zc2.zone_id = z2.id
      JOIN "05_mst_zone_coverage" zc_orig ON zc_orig.zone_id = ${zoneId}::uuid
      WHERE z2.distributor_id = ${distributorId}::uuid
        AND z2.is_active = true
        AND (
          (zc2.neighborhood IS NOT NULL AND zc2.neighborhood = zc_orig.neighborhood)
          OR (zc2.zip_code IS NOT NULL AND zc2.zip_code = zc_orig.zip_code)
        )
      LIMIT 1
    `;

    return rows[0]?.zone_id ?? null;
  },

  /**
   * Valida que o distributor_id pertence a uma zona que cobre a mesma
   * área geográfica do zoneId informado.
   */
  async validateDistributorForZone(
    distributorId: string,
    zoneId: string,
    _date: string,
    _window: string,
  ): Promise<{ valid: boolean; resolvedZoneId: string | null }> {
    const prisma = getPrisma();

    const rows = await prisma.$queryRaw<Array<{ zone_id: string }>>`
      SELECT z2.id AS zone_id
      FROM "04_mst_zones" z2
      JOIN "05_mst_zone_coverage" zc2 ON zc2.zone_id = z2.id
      JOIN "05_mst_zone_coverage" zc_orig ON zc_orig.zone_id = ${zoneId}::uuid
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

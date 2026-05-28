import { getPrisma } from "../../../infra/prisma/client.js";
import type { Address, Consumer, Order, OrderItem, Zone } from "@prisma/client";
import { ConsumerRole, DeliveryWindow, OrderStatus } from "@xua/shared/enums";

export type DistributorRouteStop = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Pick<Address, "street" | "number" | "complement" | "neighborhood" | "city" | "state">;
  zone: Pick<Zone, "name">;
  items: Pick<OrderItem, "quantity">[];
};

type CoverageMatch = { neighborhood: string | null; zip_code: string | null };
type CoverageFilter =
  | { neighborhood: { in: string[] } }
  | { zip_code: { in: string[] } };

function dbDateToISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function toDeliveryWindow(value: string): DeliveryWindow {
  return value.toUpperCase() as DeliveryWindow;
}

function coverageFilters(originCoverage: CoverageMatch[]): CoverageFilter[] {
  const neighborhoods = [
    ...new Set(
      originCoverage
        .map((coverage) => coverage.neighborhood)
        .filter((neighborhood): neighborhood is string => neighborhood !== null)
    ),
  ];
  const zipCodes = [
    ...new Set(
      originCoverage
        .map((coverage) => coverage.zip_code)
        .filter((zipCode): zipCode is string => zipCode !== null)
    ),
  ];

  return [
    ...(neighborhoods.length > 0 ? [{ neighborhood: { in: neighborhoods } }] : []),
    ...(zipCodes.length > 0 ? [{ zip_code: { in: zipCodes } }] : []),
  ];
}

function matchesCoverage(candidate: CoverageMatch, originCoverage: CoverageMatch[]): boolean {
  return originCoverage.some((origin) => {
    const sameNeighborhood =
      candidate.neighborhood !== null && candidate.neighborhood === origin.neighborhood;
    const sameZipCode = candidate.zip_code !== null && candidate.zip_code === origin.zip_code;

    return sameNeighborhood || sameZipCode;
  });
}

function roundNps(avg: number | null | undefined): number | null {
  return typeof avg === "number" ? Math.round(avg * 10) / 10 : null;
}

function sortByNpsThenName(
  left: { name: string; avg_nps: number | null },
  right: { name: string; avg_nps: number | null }
): number {
  if (left.avg_nps !== null && right.avg_nps === null) return -1;
  if (left.avg_nps === null && right.avg_nps !== null) return 1;
  if (left.avg_nps !== null && right.avg_nps !== null && left.avg_nps !== right.avg_nps) {
    return right.avg_nps - left.avg_nps;
  }

  return left.name.localeCompare(right.name);
}

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
    date?: string,
    window?: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      avg_nps: number | null;
      next_available_date: string | null;
    }>
  > {
    const prisma = getPrisma();
    const originCoverage = await prisma.zoneCoverage.findMany({
      where: { zone_id: zoneId },
      select: { neighborhood: true, zip_code: true },
    });
    const coverageOr = coverageFilters(originCoverage);

    if (coverageOr.length === 0) {
      return [];
    }

    const requestedDate = date ? new Date(date) : null;
    const requestedWindow = window ? toDeliveryWindow(window) : null;
    const distributors = await prisma.distributor.findMany({
      where: {
        is_active: true,
        allows_consumer_choice: true,
        zones: {
          some: {
            is_active: true,
            coverage: { some: { OR: coverageOr } },
          },
        },
      },
      select: {
        id: true,
        name: true,
        zones: {
          where: {
            is_active: true,
            coverage: { some: { OR: coverageOr } },
          },
          select: {
            id: true,
            coverage: { select: { neighborhood: true, zip_code: true } },
            ...(requestedDate
              ? {
                  capacity_slots: {
                    where: { delivery_date: { gte: requestedDate } },
                    select: {
                      delivery_date: true,
                      window: true,
                      capacity_total: true,
                      capacity_reserved: true,
                    },
                  },
                }
              : {}),
          },
        },
      },
    });

    const npsByDistributor = new Map<string, number | null>();
    if (distributors.length > 0) {
      const npsRows = await prisma.order.groupBy({
        by: ["distributor_id"],
        where: {
          distributor_id: { in: distributors.map((distributor) => distributor.id) },
          nps_score: { not: null },
        },
        _avg: { nps_score: true },
      });

      for (const npsRow of npsRows) {
        npsByDistributor.set(npsRow.distributor_id, roundNps(npsRow._avg.nps_score));
      }
    }

    if (date && window) {
      const rows = distributors.flatMap((distributor) => {
        const matchingZones = distributor.zones.filter((zone) =>
          zone.coverage.some((coverage) => matchesCoverage(coverage, originCoverage))
        );

        const availableOnRequestedDate = matchingZones.some((zone) =>
          zone.capacity_slots.some(
            (slot) =>
              dbDateToISODate(slot.delivery_date) === date &&
              slot.window === requestedWindow &&
              slot.capacity_reserved < slot.capacity_total
          )
        );

        if (!availableOnRequestedDate) {
          return [];
        }

        const nextAvailableDate = matchingZones
          .flatMap((zone) => zone.capacity_slots)
          .filter((slot) => slot.capacity_reserved < slot.capacity_total)
          .map((slot) => slot.delivery_date)
          .sort((left, right) => left.getTime() - right.getTime())[0];

        return [
          {
            id: distributor.id,
            name: distributor.name,
            avg_nps: npsByDistributor.get(distributor.id) ?? null,
            next_available_date: nextAvailableDate ? dbDateToISODate(nextAvailableDate) : null,
          },
        ];
      });

      return rows.sort(sortByNpsThenName);
    }

    return distributors
      .map((distributor) => ({
        id: distributor.id,
        name: distributor.name,
        avg_nps: npsByDistributor.get(distributor.id) ?? null,
        next_available_date: null,
      }))
      .sort(sortByNpsThenName);
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
    const originCoverage = await prisma.zoneCoverage.findMany({
      where: { zone_id: zoneId },
      select: { neighborhood: true, zip_code: true },
    });
    const coverageOr = coverageFilters(originCoverage);

    if (coverageOr.length === 0) {
      return null;
    }

    const zone = await prisma.zone.findFirst({
      where: {
        distributor_id: distributorId,
        is_active: true,
        coverage: { some: { OR: coverageOr } },
      },
      select: { id: true },
    });

    return zone?.id ?? null;
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
    const originCoverage = await prisma.zoneCoverage.findMany({
      where: { zone_id: zoneId },
      select: { neighborhood: true, zip_code: true },
    });
    const coverageOr = coverageFilters(originCoverage);

    if (coverageOr.length === 0) {
      return { valid: false, resolvedZoneId: null };
    }

    const requestedWindow = toDeliveryWindow(window);
    const zones = await prisma.zone.findMany({
      where: {
        distributor_id: distributorId,
        is_active: true,
        coverage: { some: { OR: coverageOr } },
        capacity_slots: {
          some: {
            delivery_date: new Date(date),
            window: requestedWindow,
          },
        },
      },
      select: {
        id: true,
        capacity_slots: {
          where: {
            delivery_date: new Date(date),
            window: requestedWindow,
          },
          select: { capacity_total: true, capacity_reserved: true },
        },
      },
    });

    const zone = zones.find((candidateZone) =>
      candidateZone.capacity_slots.some(
        (slot) => slot.capacity_reserved < slot.capacity_total
      )
    );

    return {
      valid: Boolean(zone),
      resolvedZoneId: zone?.id ?? null,
    };
  },
};

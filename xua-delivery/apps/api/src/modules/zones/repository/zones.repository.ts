import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@xua/shared/enums";
import { ORDER_TERMINAL_STATUS_VALUES } from "@xua/shared/schemas/order";
import { normalizeNeighborhood } from "@xua/shared/utils/zip";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

/**
 * Pedidos nestes status já saíram do fluxo operacional — só eles não impedem
 * a transferência de uma zona para outra distribuidora.
 */
const TERMINAL_ORDER_STATUS: OrderStatus[] = [...ORDER_TERMINAL_STATUS_VALUES];

export type CoverageEntry = { neighborhood?: string; zip_code?: string };

export interface ConflictRow {
  id: string;
  neighborhood: string | null;
  zip_code: string | null;
  zone_id: string;
  zone_name: string;
}

export interface ZoneOpsFilters {
  distributor_id?: string;
  q?: string;
  coverage?: string;
  status: "active" | "inactive" | "all";
  limit: number;
  offset: number;
}

/** Filtros que não envolvem busca por texto — vão pelo query builder tipado. */
function buildOpsWhere(filters: ZoneOpsFilters): Prisma.ZoneWhereInput {
  return {
    ...(filters.distributor_id ? { distributor_id: filters.distributor_id } : {}),
    ...(filters.status === "all" ? {} : { is_active: filters.status === "active" }),
  };
}

const ZONE_LIST_INCLUDE = {
  distributor: { select: { id: true, name: true, is_active: true } },
  _count: { select: { coverage: true, addresses: true, orders: true } },
} satisfies Prisma.ZoneInclude;

const ZONE_LIST_ORDER_BY = [
  { is_active: "desc" },
  { name: "asc" },
] satisfies Prisma.ZoneOrderByWithRelationInput[];

/**
 * Listagem com `q` e/ou `coverage`: precisa de SQL bruto porque a busca é
 * insensível a acento (Prisma não expõe `unaccent()` no query builder — mesma
 * razão documentada em products.repository.ts) e porque queremos que a
 * substring bata com o índice trigram (`immutable_unaccent(...) ILIKE ...`),
 * não com um `contains` comum que ignoraria o índice.
 *
 * Resolve só os ids da página primeiro (bruto), depois busca os registros
 * completos via Prisma — mesmo padrão de productsRepository.findActive.
 */
async function findAllForOpsWithTextSearch(
  client: TxClient,
  filters: ZoneOpsFilters
): Promise<{ zones: unknown[]; total: number }> {
  const conditions: Prisma.Sql[] = [];

  if (filters.distributor_id) {
    conditions.push(Prisma.sql`z.distributor_id = ${filters.distributor_id}::uuid`);
  }
  if (filters.status !== "all") {
    conditions.push(Prisma.sql`z.is_active = ${filters.status === "active"}`);
  }
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      Prisma.sql`immutable_unaccent(z.name) ILIKE immutable_unaccent(${pattern})`
    );
  }
  if (filters.coverage) {
    const pattern = `%${filters.coverage}%`;
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "05_mst_zone_coverage" zc
      WHERE zc.zone_id = z.id
        AND (
          immutable_unaccent(zc.neighborhood) ILIKE immutable_unaccent(${pattern})
          OR zc.zip_code ILIKE ${pattern}
        )
    )`);
  }

  const whereClause = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  const [rows, countRows] = await Promise.all([
    client.$queryRaw<{ id: string }[]>`
      SELECT z.id
      FROM "04_mst_zones" z
      ${whereClause}
      ORDER BY z.is_active DESC, z.name ASC
      LIMIT ${filters.limit} OFFSET ${filters.offset}
    `,
    client.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "04_mst_zones" z
      ${whereClause}
    `,
  ]);

  const ids = rows.map((r) => r.id);
  const zones = ids.length
    ? await client.zone.findMany({
        where: { id: { in: ids } },
        include: ZONE_LIST_INCLUDE,
        orderBy: ZONE_LIST_ORDER_BY,
      })
    : [];

  return { zones, total: Number(countRows[0]?.count ?? 0) };
}

export const zonesRepository = {
  /**
   * Listagem pública/consumidor: só zonas ativas.
   * NÃO usar em telas de operação — ver `findAllForOps`.
   */
  async findAllActive(tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.findMany({
      where: { is_active: true },
      include: { coverage: true },
      orderBy: { name: "asc" },
    });
  },

  /**
   * Listagem operacional (ops): inclui zonas INATIVAS, senão desativar uma zona
   * a faz sumir da tela sem possibilidade de reativação. Espelha o par
   * findAllActive/findAllForOps de distributor.repository.ts.
   *
   * Devolve apenas CONTAGENS de cobertura, nunca as linhas: uma única zona de
   * produção tem ~3.700 linhas de cobertura, e trazê-las na lista tornaria a
   * tela inutilizável. A cobertura é carregada sob demanda por
   * `findCoverageByZone`, também paginada.
   */
  async findAllForOps(filters: ZoneOpsFilters, tx?: TxClient) {
    const prisma = getPrisma();
    const client = (tx ?? prisma) as TxClient;

    if (filters.q || filters.coverage) {
      return findAllForOpsWithTextSearch(client, filters);
    }

    const where = buildOpsWhere(filters);
    const [zones, total] = await Promise.all([
      client.zone.findMany({
        where,
        include: ZONE_LIST_INCLUDE,
        orderBy: ZONE_LIST_ORDER_BY,
        take: filters.limit,
        skip: filters.offset,
      }),
      client.zone.count({ where }),
    ]);

    return { zones, total };
  },

  /**
   * Cobertura de uma zona, paginada e com busca por bairro/CEP. Mesma técnica
   * de acento/trigram da listagem — `q` casa com o índice trigram de
   * ZoneCoverage.neighborhood.
   */
  async findCoverageByZone(
    zoneId: string,
    filters: { q?: string; limit: number; offset: number },
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    const client = (tx ?? prisma) as TxClient;

    if (filters.q) {
      const pattern = `%${filters.q}%`;
      const [rows, countRows] = await Promise.all([
        client.$queryRaw<{ id: string; neighborhood: string | null; zip_code: string | null }[]>`
          SELECT zc.id, zc.neighborhood, zc.zip_code
          FROM "05_mst_zone_coverage" zc
          WHERE zc.zone_id = ${zoneId}::uuid
            AND (
              (zc.neighborhood IS NOT NULL AND immutable_unaccent(zc.neighborhood) ILIKE immutable_unaccent(${pattern}))
              OR (zc.zip_code IS NOT NULL AND zc.zip_code ILIKE ${pattern})
            )
          ORDER BY zc.neighborhood ASC NULLS LAST, zc.zip_code ASC NULLS LAST
          LIMIT ${filters.limit} OFFSET ${filters.offset}
        `,
        client.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM "05_mst_zone_coverage" zc
          WHERE zc.zone_id = ${zoneId}::uuid
            AND (
              (zc.neighborhood IS NOT NULL AND immutable_unaccent(zc.neighborhood) ILIKE immutable_unaccent(${pattern}))
              OR (zc.zip_code IS NOT NULL AND zc.zip_code ILIKE ${pattern})
            )
        `,
      ]);
      return { coverage: rows, total: Number(countRows[0]?.count ?? 0) };
    }

    const where = { zone_id: zoneId };
    const [coverage, total] = await Promise.all([
      client.zoneCoverage.findMany({
        where,
        select: { id: true, neighborhood: true, zip_code: true },
        orderBy: [{ neighborhood: "asc" }, { zip_code: "asc" }],
        take: filters.limit,
        skip: filters.offset,
      }),
      client.zoneCoverage.count({ where }),
    ]);

    return { coverage, total };
  },

  /** Sem cobertura embutida — ver `findCoverageByZone` para isso, paginado. */
  async findById(id: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.findUnique({ where: { id } });
  },

  /** Nome de zona é único por distribuidora — evita duas "Zona Sul" na mesma casa. */
  async findByNameInDistributor(
    distributorId: string,
    name: string,
    excludeZoneId?: string,
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.findFirst({
      where: {
        distributor_id: distributorId,
        name: { equals: name, mode: "insensitive" },
        ...(excludeZoneId ? { id: { not: excludeZoneId } } : {}),
      },
      select: { id: true, name: true },
    });
  },

  async create(data: Prisma.ZoneUncheckedCreateInput, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.create({ data });
  },

  async update(id: string, data: Prisma.ZoneUncheckedUpdateInput, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.update({ where: { id }, data });
  },

  async softDelete(id: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.update({
      where: { id },
      data: { is_active: false },
    });
  },

  /** Move a zona E toda a sua cobertura (distributor_id denormalizado) numa tacada. */
  async transfer(id: string, distributorId: string, tx?: TxClient) {
    const prisma = getPrisma();
    const client = (tx ?? prisma) as TxClient;
    const zone = await client.zone.update({
      where: { id },
      data: { distributor_id: distributorId },
    });
    await client.zoneCoverage.updateMany({
      where: { zone_id: id },
      data: { distributor_id: distributorId },
    });
    return zone;
  },

  // ─── Cobertura ─────────────────────────────────────────────────────────────

  async createCoverage(
    data: {
      zone_id: string;
      distributor_id: string;
      neighborhood?: string | null;
      zip_code?: string | null;
    },
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).zoneCoverage.create({
      data: {
        zone_id: data.zone_id,
        distributor_id: data.distributor_id,
        neighborhood: data.neighborhood ?? null,
        zip_code: data.zip_code ?? null,
      },
    });
  },

  async createManyCoverage(
    zoneId: string,
    distributorId: string,
    entries: CoverageEntry[],
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).zoneCoverage.createMany({
      data: entries.map((entry) => ({
        zone_id: zoneId,
        distributor_id: distributorId,
        neighborhood: entry.neighborhood ?? null,
        zip_code: entry.zip_code ?? null,
      })),
      skipDuplicates: true,
    });
  },

  async deleteCoverage(coverageId: string, zoneId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zoneCoverage.delete({
      where: { id: coverageId, zone_id: zoneId },
    });
  },

  /**
   * Entre os `entries` recebidos (payload de criação/import), quais já são
   * atendidos por OUTRA zona ativa da MESMA distribuidora.
   *
   * Bounded pelo tamanho do payload (até 500 linhas), não pelo tamanho da
   * distribuidora: filtra direto por `distributor_id` (índice, sem JOIN) e só
   * traz de volta linhas que colidem com os valores do próprio payload — nunca
   * carrega a cobertura inteira da distribuidora para a memória do Node.
   */
  async findConflictingCoverage(
    distributorId: string,
    entries: CoverageEntry[],
    excludeZoneId: string,
    tx?: TxClient
  ): Promise<ConflictRow[]> {
    const prisma = getPrisma();
    const client = (tx ?? prisma) as TxClient;

    const neighborhoods = entries
      .map((e) => (e.neighborhood ? normalizeNeighborhood(e.neighborhood) : null))
      .filter((v): v is string => Boolean(v));
    const zipCodes = entries.map((e) => e.zip_code).filter((v): v is string => Boolean(v));
    if (neighborhoods.length === 0 && zipCodes.length === 0) return [];

    const matchConditions: Prisma.Sql[] = [];
    if (neighborhoods.length > 0) {
      matchConditions.push(
        Prisma.sql`(zc.neighborhood IS NOT NULL AND normalize_neighborhood(zc.neighborhood) = ANY(${neighborhoods}::text[]))`
      );
    }
    if (zipCodes.length > 0) {
      matchConditions.push(
        Prisma.sql`(zc.zip_code IS NOT NULL AND zc.zip_code = ANY(${zipCodes}::text[]))`
      );
    }

    return client.$queryRaw<ConflictRow[]>`
      SELECT zc.id, zc.neighborhood, zc.zip_code, z.id AS zone_id, z.name AS zone_name
      FROM "05_mst_zone_coverage" zc
      JOIN "04_mst_zones" z ON z.id = zc.zone_id
      WHERE zc.distributor_id = ${distributorId}::uuid
        AND z.is_active = true
        AND z.id != ${excludeZoneId}::uuid
        AND (${Prisma.join(matchConditions, " OR ")})
    `;
  },

  /**
   * A cobertura de UMA zona colide com a de outra zona ativa da mesma
   * distribuidora? Usado ao reativar uma zona e ao transferi-la — nenhum dos
   * dois carrega linhas de cobertura para o Node, o Postgres faz o cruzamento.
   */
  async findSelfOverlapConflicts(zoneId: string, tx?: TxClient): Promise<ConflictRow[]> {
    const prisma = getPrisma();
    const client = (tx ?? prisma) as TxClient;

    return client.$queryRaw<ConflictRow[]>`
      SELECT DISTINCT zc2.id, zc2.neighborhood, zc2.zip_code, z2.id AS zone_id, z2.name AS zone_name
      FROM "05_mst_zone_coverage" zc1
      JOIN "05_mst_zone_coverage" zc2
        ON zc2.distributor_id = zc1.distributor_id
        AND zc2.zone_id != zc1.zone_id
        AND (
          (zc1.neighborhood IS NOT NULL AND zc2.neighborhood IS NOT NULL
            AND normalize_neighborhood(zc1.neighborhood) = normalize_neighborhood(zc2.neighborhood))
          OR (zc1.zip_code IS NOT NULL AND zc2.zip_code IS NOT NULL AND zc1.zip_code = zc2.zip_code)
        )
      JOIN "04_mst_zones" z2 ON z2.id = zc2.zone_id AND z2.is_active = true
      WHERE zc1.zone_id = ${zoneId}::uuid
      LIMIT 20
    `;
  },

  /**
   * A cobertura de uma zona colide com a cobertura ativa de uma distribuidora
   * DE DESTINO (checagem de transferência)? Simétrico a
   * `findSelfOverlapConflicts`, mas comparando contra uma distribuidora
   * explícita em vez da própria — nunca carrega a cobertura da zona para o
   * Node, o Postgres faz o cruzamento inteiro.
   */
  async findTransferConflicts(
    zoneId: string,
    targetDistributorId: string,
    tx?: TxClient
  ): Promise<ConflictRow[]> {
    const prisma = getPrisma();
    const client = (tx ?? prisma) as TxClient;

    return client.$queryRaw<ConflictRow[]>`
      SELECT DISTINCT zc2.id, zc2.neighborhood, zc2.zip_code, z2.id AS zone_id, z2.name AS zone_name
      FROM "05_mst_zone_coverage" zc1
      JOIN "05_mst_zone_coverage" zc2
        ON zc2.distributor_id = ${targetDistributorId}::uuid
        AND (
          (zc1.neighborhood IS NOT NULL AND zc2.neighborhood IS NOT NULL
            AND normalize_neighborhood(zc1.neighborhood) = normalize_neighborhood(zc2.neighborhood))
          OR (zc1.zip_code IS NOT NULL AND zc2.zip_code IS NOT NULL AND zc1.zip_code = zc2.zip_code)
        )
      JOIN "04_mst_zones" z2 ON z2.id = zc2.zone_id AND z2.is_active = true
      WHERE zc1.zone_id = ${zoneId}::uuid
      LIMIT 20
    `;
  },

  /**
   * Zonas de OUTRAS distribuidoras cobrindo a mesma área. Isso é esperado e
   * alimenta a escolha de distribuidora no checkout (`findAvailableForZone`) —
   * vira aviso na UI, nunca bloqueio.
   */
  async findExternalOverlaps(
    entries: CoverageEntry[],
    excludeDistributorId: string,
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    const neighborhoods = entries
      .map((e) => e.neighborhood)
      .filter((v): v is string => Boolean(v));
    const zipCodes = entries.map((e) => e.zip_code).filter((v): v is string => Boolean(v));

    if (neighborhoods.length === 0 && zipCodes.length === 0) return [];

    return (tx ?? prisma).zoneCoverage.findMany({
      where: {
        zone: { is_active: true },
        distributor_id: { not: excludeDistributorId },
        OR: [
          ...(neighborhoods.length ? [{ neighborhood: { in: neighborhoods } }] : []),
          ...(zipCodes.length ? [{ zip_code: { in: zipCodes } }] : []),
        ],
      },
      select: {
        neighborhood: true,
        zip_code: true,
        zone: {
          select: { id: true, name: true, distributor: { select: { id: true, name: true } } },
        },
      },
      take: 50,
    });
  },

  // ─── Guards ────────────────────────────────────────────────────────────────

  /** Pedidos ainda em curso na zona — bloqueiam a transferência de distribuidora. */
  async countOpenOrders(zoneId: string, tx?: TxClient): Promise<number> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.count({
      where: { zone_id: zoneId, status: { notIn: TERMINAL_ORDER_STATUS } },
    });
  },

  /** Endereços já vinculados — desativar a zona os deixa sem cobertura. */
  async countAddresses(zoneId: string, tx?: TxClient): Promise<number> {
    const prisma = getPrisma();
    return (tx ?? prisma).address.count({ where: { zone_id: zoneId } });
  },

  /** Checagem leve de existência/estado da distribuidora alvo de criação/transferência. */
  async findDistributor(distributorId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).distributor.findUnique({
      where: { id: distributorId },
      select: { id: true, name: true, is_active: true },
    });
  },

  async findDistributorId(zoneId: string, tx?: TxClient): Promise<string | null> {
    const prisma = getPrisma();
    const zone = await (tx ?? prisma).zone.findUnique({
      where: { id: zoneId },
      select: { distributor_id: true },
    });
    return zone?.distributor_id ?? null;
  },
};

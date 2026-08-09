import type { Prisma } from "@prisma/client";
import { ActorType, AuditEventType, SourceApp } from "@xua/shared/enums";
import { normalizeNeighborhood } from "@xua/shared/utils/zip";
import type { CoverageInput, ZoneInput, ZoneUpdateInput } from "@xua/shared/schemas/zone";
import { getPrisma } from "../../../infra/prisma/client.js";
import { createLogger } from "../../../infra/logger/index.js";
import { auditRepository } from "../../audit/audit.repository.js";
import {
  zonesRepository,
  type ConflictRow,
  type CoverageEntry,
  type ZoneOpsFilters,
} from "../repository/zones.repository.js";

const log = createLogger("zones");

/** Quem executou a ação — `ops` ou o `distributor_admin` dono da zona. */
export type ZoneActor = { type: ActorType; id: string };

export class ZoneServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ZoneServiceError";
  }
}

export interface CoverageConflict {
  neighborhood?: string;
  zip_code?: string;
  zone_id: string;
  zone_name: string;
}

export interface CoverageOverlapWarning {
  neighborhood?: string;
  zip_code?: string;
  zone_name: string;
  distributor_id: string;
  distributor_name: string;
}

/** Chave de comparação: bairro sem acento/caixa, CEP já normalizado pelo schema. */
function entryKeys(entry: CoverageEntry): string[] {
  const keys: string[] = [];
  if (entry.neighborhood) keys.push(`n:${normalizeNeighborhood(entry.neighborhood)}`);
  if (entry.zip_code) keys.push(`z:${entry.zip_code}`);
  return keys;
}

/**
 * Conflito interno = mesma área já coberta por OUTRA zona ativa da MESMA
 * distribuidora. É o que torna `resolveCoveredZone` (LIMIT 1 sem ORDER BY)
 * não-determinístico e faz o pedido cair numa zona aleatória — por isso bloqueia.
 *
 * `candidates` já vem FILTRADO pelo repository (só linhas que colidem com
 * algum valor de `entries`, via SQL) — nunca a cobertura inteira da
 * distribuidora. Esta função só faz a correlação fina entry-a-entry.
 */
function detectInternalConflicts(
  candidates: ConflictRow[],
  entries: CoverageEntry[]
): CoverageConflict[] {
  const index = new Map<string, { id: string; name: string }>();
  for (const row of candidates) {
    for (const key of entryKeys({
      neighborhood: row.neighborhood ?? undefined,
      zip_code: row.zip_code ?? undefined,
    })) {
      if (!index.has(key)) index.set(key, { id: row.zone_id, name: row.zone_name });
    }
  }

  const conflicts: CoverageConflict[] = [];
  for (const entry of entries) {
    for (const key of entryKeys(entry)) {
      const owner = index.get(key);
      if (owner) {
        conflicts.push({
          neighborhood: entry.neighborhood,
          zip_code: entry.zip_code,
          zone_id: owner.id,
          zone_name: owner.name,
        });
        break;
      }
    }
  }
  return conflicts;
}

function toCoverageConflict(row: ConflictRow): CoverageConflict {
  return {
    neighborhood: row.neighborhood ?? undefined,
    zip_code: row.zip_code ?? undefined,
    zone_id: row.zone_id,
    zone_name: row.zone_name,
  };
}

/** Remove duplicatas dentro do próprio lote colado pela Ops. */
function dedupeEntries(entries: CoverageEntry[]): CoverageEntry[] {
  const seen = new Set<string>();
  const result: CoverageEntry[] = [];
  for (const entry of entries) {
    const signature = `${normalizeNeighborhood(entry.neighborhood ?? "")}|${entry.zip_code ?? ""}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(entry);
  }
  return result;
}

async function assertZoneExists(zoneId: string) {
  const zone = await zonesRepository.findById(zoneId);
  if (!zone) throw new ZoneServiceError("ZONE_NOT_FOUND", "Zona não encontrada");
  return zone;
}

export const zonesService = {
  /** Listagem do consumidor — só zonas ativas, shape legado (array puro). */
  async list() {
    return zonesRepository.findAllActive();
  },

  async listForOps(filters: ZoneOpsFilters) {
    const { zones, total } = await zonesRepository.findAllForOps(filters);
    return { zones, pagination: { limit: filters.limit, offset: filters.offset, total } };
  },

  async listCoverage(zoneId: string, filters: { q?: string; limit: number; offset: number }) {
    await assertZoneExists(zoneId);
    const { coverage, total } = await zonesRepository.findCoverageByZone(zoneId, filters);
    return { coverage, pagination: { limit: filters.limit, offset: filters.offset, total } };
  },

  async create(data: ZoneInput, actor: ZoneActor) {
    const distributor = await zonesRepository.findDistributor(data.distributor_id);
    if (!distributor) {
      throw new ZoneServiceError("DISTRIBUTOR_NOT_FOUND", "Distribuidora não encontrada");
    }
    if (!distributor.is_active) {
      throw new ZoneServiceError(
        "DISTRIBUTOR_INACTIVE",
        "Distribuidora inativa — reative-a antes de criar zonas"
      );
    }

    const duplicate = await zonesRepository.findByNameInDistributor(
      data.distributor_id,
      data.name
    );
    if (duplicate) {
      throw new ZoneServiceError(
        "DUPLICATE_ZONE_NAME",
        `A distribuidora já possui uma zona chamada "${duplicate.name}"`
      );
    }

    const prisma = getPrisma();
    const zone = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await zonesRepository.create(data, tx);
      await auditRepository.emit(
        {
          eventType: AuditEventType.ZONE_CREATED,
          actor,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: { zone_id: created.id, name: created.name, distributor_id: data.distributor_id },
        },
        tx
      );
      return created;
    });

    log.info({ zoneId: zone.id, distributorId: data.distributor_id }, "Zone created");
    return zone;
  },

  async update(id: string, data: ZoneUpdateInput, actor: ZoneActor) {
    const current = await assertZoneExists(id);

    if (data.name && data.name.toLowerCase() !== current.name.toLowerCase()) {
      const duplicate = await zonesRepository.findByNameInDistributor(
        current.distributor_id,
        data.name,
        id
      );
      if (duplicate) {
        throw new ZoneServiceError(
          "DUPLICATE_ZONE_NAME",
          `A distribuidora já possui uma zona chamada "${duplicate.name}"`
        );
      }
    }

    // Reativar não pode ressuscitar uma sobreposição: a zona volta a disputar o
    // roteamento com as demais zonas ativas da mesma distribuidora. Calculado
    // inteiramente no banco — nunca carregamos a cobertura da zona para o Node,
    // mesmo que ela tenha milhares de linhas.
    if (data.is_active === true && !current.is_active) {
      const conflicts = await zonesRepository.findSelfOverlapConflicts(id);
      if (conflicts.length > 0) {
        throw new ZoneServiceError(
          "COVERAGE_CONFLICT",
          "Não é possível reativar: a cobertura desta zona já é atendida por outra zona ativa da mesma distribuidora",
          { conflicts: conflicts.map(toCoverageConflict) }
        );
      }
    }

    const prisma = getPrisma();
    const zone = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await zonesRepository.update(id, data, tx);
      await auditRepository.emit(
        {
          eventType: AuditEventType.ZONE_UPDATED,
          actor,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: { zone_id: id, changes: data },
        },
        tx
      );
      return updated;
    });

    log.info({ zoneId: id, changes: data }, "Zone updated");

    // Desativar não quebra endereço existente, mas bloqueia novos pedidos na
    // área — a UI usa esta contagem para avisar antes de confirmar.
    const affectedAddresses =
      data.is_active === false ? await zonesRepository.countAddresses(id) : 0;

    return { zone, affected_addresses: affectedAddresses };
  },

  async remove(id: string, actor: ZoneActor) {
    await assertZoneExists(id);
    const prisma = getPrisma();
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await zonesRepository.softDelete(id, tx);
      await auditRepository.emit(
        {
          eventType: AuditEventType.ZONE_UPDATED,
          actor,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: { zone_id: id, changes: { is_active: false } },
        },
        tx
      );
    });
    log.info({ zoneId: id }, "Zone deactivated");
  },

  /**
   * Transferência de zona entre distribuidoras. Muda o roteamento de todos os
   * endereços já vinculados (`resolveDistributor` lê `zone.distributor_id`),
   * então só é permitida quando não há pedido em curso na zona.
   */
  async transfer(id: string, distributorId: string, actor: ZoneActor) {
    const current = await assertZoneExists(id);
    if (current.distributor_id === distributorId) {
      throw new ZoneServiceError(
        "SAME_DISTRIBUTOR",
        "A zona já pertence a esta distribuidora"
      );
    }

    const target = await zonesRepository.findDistributor(distributorId);
    if (!target) {
      throw new ZoneServiceError("DISTRIBUTOR_NOT_FOUND", "Distribuidora não encontrada");
    }
    if (!target.is_active) {
      throw new ZoneServiceError(
        "DISTRIBUTOR_INACTIVE",
        "Não é possível transferir para uma distribuidora inativa"
      );
    }

    const openOrders = await zonesRepository.countOpenOrders(id);
    if (openOrders > 0) {
      throw new ZoneServiceError(
        "ZONE_HAS_OPEN_ORDERS",
        `A zona tem ${openOrders} pedido(s) em andamento. Conclua-os antes de transferir.`,
        { open_orders: openOrders }
      );
    }

    const duplicate = await zonesRepository.findByNameInDistributor(
      distributorId,
      current.name,
      id
    );
    if (duplicate) {
      throw new ZoneServiceError(
        "DUPLICATE_ZONE_NAME",
        `A distribuidora de destino já possui uma zona chamada "${duplicate.name}"`
      );
    }

    // A zona chega na distribuidora de destino carregando toda a sua cobertura —
    // que não pode colidir com o que a destino já atende. Comparado no banco:
    // a cobertura da zona nunca é carregada para o Node, só o eventual conflito.
    const transferConflicts = await zonesRepository.findTransferConflicts(id, distributorId);
    if (transferConflicts.length > 0) {
      throw new ZoneServiceError(
        "COVERAGE_CONFLICT",
        "A distribuidora de destino já atende parte da cobertura desta zona",
        { conflicts: transferConflicts.map(toCoverageConflict) }
      );
    }

    const prisma = getPrisma();
    const zone = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await zonesRepository.transfer(id, distributorId, tx);
      await auditRepository.emit(
        {
          eventType: AuditEventType.ZONE_TRANSFERRED,
          actor,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: {
            zone_id: id,
            from_distributor_id: current.distributor_id,
            to_distributor_id: distributorId,
          },
        },
        tx
      );
      return updated;
    });

    log.info(
      { zoneId: id, from: current.distributor_id, to: distributorId },
      "Zone transferred"
    );
    return zone;
  },

  // ─── Cobertura ─────────────────────────────────────────────────────────────

  /** Checagem sem gravar — alimenta o preview do import em massa. */
  async previewConflicts(zoneId: string, entries: CoverageEntry[]) {
    const zone = await assertZoneExists(zoneId);
    const deduped = dedupeEntries(entries);

    const candidates = await zonesRepository.findConflictingCoverage(
      zone.distributor_id,
      deduped,
      zoneId
    );
    const conflicts = detectInternalConflicts(candidates, deduped);

    const conflictKeys = new Set(
      conflicts.flatMap((c) => entryKeys({ neighborhood: c.neighborhood, zip_code: c.zip_code }))
    );
    const accepted = deduped.filter(
      (entry) => !entryKeys(entry).some((key) => conflictKeys.has(key))
    );

    const overlaps = await zonesRepository.findExternalOverlaps(
      accepted,
      zone.distributor_id
    );
    const warnings: CoverageOverlapWarning[] = overlaps.map((row) => ({
      neighborhood: row.neighborhood ?? undefined,
      zip_code: row.zip_code ?? undefined,
      zone_name: row.zone.name,
      distributor_id: row.zone.distributor.id,
      distributor_name: row.zone.distributor.name,
    }));

    return {
      total: entries.length,
      duplicates_in_payload: entries.length - deduped.length,
      accepted_count: accepted.length,
      accepted,
      conflicts,
      warnings,
    };
  },

  async addCoverage(zoneId: string, data: CoverageInput, actor: ZoneActor) {
    const result = await this.addCoverageBulk(zoneId, [data], actor);
    if (result.created_count === 0) {
      throw new ZoneServiceError(
        "COVERAGE_CONFLICT",
        result.conflicts[0]
          ? `Já atendido pela zona "${result.conflicts[0].zone_name}" desta distribuidora`
          : "Cobertura já cadastrada",
        { conflicts: result.conflicts }
      );
    }
    return { coverage: result.coverage[0], warnings: result.warnings };
  },

  async addCoverageBulk(zoneId: string, entries: CoverageEntry[], actor: ZoneActor) {
    const zone = await assertZoneExists(zoneId);
    const preview = await this.previewConflicts(zoneId, entries);

    if (preview.accepted.length === 0) {
      return {
        created_count: 0,
        coverage: [],
        conflicts: preview.conflicts,
        warnings: preview.warnings,
        duplicates_in_payload: preview.duplicates_in_payload,
      };
    }

    const prisma = getPrisma();
    const coverage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = [];
      for (const entry of preview.accepted) {
        created.push(
          await zonesRepository.createCoverage(
            { zone_id: zoneId, distributor_id: zone.distributor_id, ...entry },
            tx
          )
        );
      }
      await auditRepository.emit(
        {
          eventType: AuditEventType.ZONE_COVERAGE_CHANGED,
          actor,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: {
            zone_id: zoneId,
            distributor_id: zone.distributor_id,
            action: "added",
            count: created.length,
          },
        },
        tx
      );
      return created;
    });

    log.info({ zoneId, count: coverage.length }, "Zone coverage added");

    return {
      created_count: coverage.length,
      coverage,
      conflicts: preview.conflicts,
      warnings: preview.warnings,
      duplicates_in_payload: preview.duplicates_in_payload,
    };
  },

  async removeCoverage(coverageId: string, zoneId: string, actor: ZoneActor) {
    const zone = await assertZoneExists(zoneId);
    const prisma = getPrisma();
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await zonesRepository.deleteCoverage(coverageId, zoneId, tx);
      await auditRepository.emit(
        {
          eventType: AuditEventType.ZONE_COVERAGE_CHANGED,
          actor,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: {
            zone_id: zoneId,
            distributor_id: zone.distributor_id,
            action: "removed",
            coverage_id: coverageId,
          },
        },
        tx
      );
    });
    log.info({ zoneId, coverageId }, "Zone coverage removed");
  },
};

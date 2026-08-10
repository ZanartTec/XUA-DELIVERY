import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectPrisma } from "../../../infra/prisma/client.js";
import { resetDatabase } from "../../../test-support/prisma-test-client.js";
import { createDistributor, createZone } from "../../../test-support/fixtures.js";
import { zonesRepository } from "./zones.repository.js";

// Testes de integração: batem no Postgres real (ver docs/doc_desenvolvimento/testes-e-ci.md
// para como subir o banco local). Cobrem exatamente o que os testes unitários com
// Prisma mockado NÃO conseguem: o trigger `trg_05_mst_zone_coverage_sync_distributor_id`
// e a query raw de detecção de conflito (`normalize_neighborhood`, unaccent).

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe("zonesRepository (integração — Postgres real)", () => {
  it("trigger do banco re-deriva distributor_id da cobertura a partir de zone_id, mesmo se o valor enviado estiver errado", async () => {
    const owner = await createDistributor();
    const impostor = await createDistributor();
    const zone = await createZone(owner.id);

    const coverage = await zonesRepository.createCoverage({
      zone_id: zone.id,
      distributor_id: impostor.id,
      neighborhood: "Centro",
    });

    expect(coverage.distributor_id).toBe(owner.id);
  });

  it("detecta conflito de cobertura por bairro normalizado (sem acento/caixa) entre zonas ativas da mesma distribuidora", async () => {
    const distributor = await createDistributor();
    const zoneA = await createZone(distributor.id, { name: "Zona A" });
    const zoneB = await createZone(distributor.id, { name: "Zona B" });

    await zonesRepository.createCoverage({
      zone_id: zoneA.id,
      distributor_id: distributor.id,
      neighborhood: "São Pedro",
    });

    const conflicts = await zonesRepository.findConflictingCoverage(
      distributor.id,
      [{ neighborhood: "sao pedro" }],
      zoneB.id
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].zone_id).toBe(zoneA.id);
  });

  it("não aponta conflito para bairros distintos", async () => {
    const distributor = await createDistributor();
    const zoneA = await createZone(distributor.id);
    const zoneB = await createZone(distributor.id);

    await zonesRepository.createCoverage({
      zone_id: zoneA.id,
      distributor_id: distributor.id,
      neighborhood: "Centro",
    });

    const conflicts = await zonesRepository.findConflictingCoverage(
      distributor.id,
      [{ neighborhood: "Bairro Novo" }],
      zoneB.id
    );

    expect(conflicts).toHaveLength(0);
  });

  it("ignora cobertura de zona INATIVA como conflito", async () => {
    const distributor = await createDistributor();
    const inactiveZone = await createZone(distributor.id, { is_active: false });
    const zoneB = await createZone(distributor.id);

    await zonesRepository.createCoverage({
      zone_id: inactiveZone.id,
      distributor_id: distributor.id,
      neighborhood: "Centro",
    });

    const conflicts = await zonesRepository.findConflictingCoverage(
      distributor.id,
      [{ neighborhood: "Centro" }],
      zoneB.id
    );

    expect(conflicts).toHaveLength(0);
  });

  it("exclui a própria zona da checagem de conflito", async () => {
    const distributor = await createDistributor();
    const zone = await createZone(distributor.id);

    await zonesRepository.createCoverage({
      zone_id: zone.id,
      distributor_id: distributor.id,
      neighborhood: "Centro",
    });

    const conflicts = await zonesRepository.findConflictingCoverage(
      distributor.id,
      [{ neighborhood: "Centro" }],
      zone.id
    );

    expect(conflicts).toHaveLength(0);
  });
});

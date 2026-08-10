import { randomUUID } from "crypto";
import type { Distributor, Zone } from "@prisma/client";
import { getPrisma } from "../infra/prisma/client.js";

function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 10);
  return out;
}

export async function createDistributor(
  overrides: Partial<{
    name: string;
    cnpj: string;
    phone: string;
    email: string;
    is_active: boolean;
  }> = {}
): Promise<Distributor> {
  const prisma = getPrisma();
  const suffix = randomUUID().slice(0, 8);
  return prisma.distributor.create({
    data: {
      name: overrides.name ?? `Distribuidora Teste ${suffix}`,
      cnpj: overrides.cnpj ?? randomDigits(14),
      phone: overrides.phone ?? "11999999999",
      email: overrides.email ?? `distribuidora-${suffix}@teste.local`,
      is_active: overrides.is_active ?? true,
    },
  });
}

export async function createZone(
  distributorId: string,
  overrides: Partial<{ name: string; is_active: boolean }> = {}
): Promise<Zone> {
  const prisma = getPrisma();
  const suffix = randomUUID().slice(0, 8);
  return prisma.zone.create({
    data: {
      distributor_id: distributorId,
      name: overrides.name ?? `Zona Teste ${suffix}`,
      is_active: overrides.is_active ?? true,
    },
  });
}

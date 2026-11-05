import type { Prisma, Consumer } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

// SEC-07: Colunas seguras para retorno (NUNCA incluir password_hash)
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  is_b2b: true,
  auto_assign_distributor: true,
  preferred_distributor_id: true,
  created_at: true,
  updated_at: true,
} as const;

export const consumerRepository = {
  async findById(id: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumer.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
  },

  async findByEmail(email: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumer.findUnique({
      where: { email },
      select: SAFE_SELECT,
    });
  },

  async update(
    id: string,
    data: Partial<Pick<Consumer, "name" | "email" | "phone" | "auto_assign_distributor" | "preferred_distributor_id">>,
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumer.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
  },

  // ─── Address methods ──────────────────────────────────────

  /**
   * Endereço restrito ao consumidor dono. O checkout usa isto para não
   * aceitar um address_id de outra pessoa vindo no payload.
   */
  async findAddressOwnedBy(addressId: string, consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).address.findFirst({
      where: { id: addressId, consumer_id: consumerId, archived_at: null },
    });
  },

  async findAddresses(consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).address.findMany({
      where: { consumer_id: consumerId, archived_at: null },
      orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
    });
  },

  async createAddress(
    data: {
      consumer_id: string;
      label: string | null;
      zip_code: string;
      street: string;
      number: string;
      complement: string | null;
      neighborhood: string;
      city: string;
      state: string;
      zone_id: string;
      is_default: boolean;
    },
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).address.create({ data });
  },

  async clearDefaultAddresses(consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).address.updateMany({
      where: { consumer_id: consumerId, is_default: true },
      data: { is_default: false },
    });
  },

  async countActiveAddresses(consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).address.count({
      where: { consumer_id: consumerId, archived_at: null },
    });
  },

  async updateAddress(
    addressId: string,
    data: Partial<{ label: string | null; number: string; complement: string | null; is_default: boolean }>,
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).address.update({ where: { id: addressId }, data });
  },

  async archiveAddress(addressId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).address.update({
      where: { id: addressId },
      data: { archived_at: new Date(), is_default: false },
    });
  },

  /** Endereço ativo mais recente: vira o principal quando o atual é excluído. */
  async findLatestActiveAddress(consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).address.findFirst({
      where: { consumer_id: consumerId, archived_at: null },
      orderBy: { created_at: "desc" },
    });
  },

  async findZoneCoverage(zipCodes: string[], tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zoneCoverage.findFirst({
      where: {
        zip_code: { in: zipCodes },
        zone: { is_active: true },
      },
      select: { zone_id: true },
    });
  },
};

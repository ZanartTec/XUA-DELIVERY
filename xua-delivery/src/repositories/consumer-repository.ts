import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import type { Consumer } from "@/src/types";

type TxClient = Prisma.TransactionClient;

// SEC-07: Colunas seguras para retorno (NUNCA incluir password_hash)
const SAFE_SELECT = {
  id: true, name: true, email: true, phone: true,
  role: true, is_b2b: true, created_at: true, updated_at: true,
} as const;

export const consumerRepository = {
  async findById(id: string, tx?: TxClient) {
    return (tx ?? prisma).consumer.findUnique({ where: { id }, select: SAFE_SELECT });
  },

  async findByEmail(email: string, tx?: TxClient) {
    return (tx ?? prisma).consumer.findUnique({ where: { email }, select: SAFE_SELECT });
  },

  async create(
    data: Pick<Consumer, "name" | "email" | "password_hash">,
    tx?: TxClient
  ) {
    return (tx ?? prisma).consumer.create({ data, select: SAFE_SELECT });
  },

  async update(
    id: string,
    data: Partial<Pick<Consumer, "name" | "email" | "phone">>,
    tx?: TxClient
  ) {
    return (tx ?? prisma).consumer.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
  },
};

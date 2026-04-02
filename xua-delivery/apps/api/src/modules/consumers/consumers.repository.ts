import type { Prisma, Consumer } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

// SEC-07: Colunas seguras para retorno (NUNCA incluir password_hash)
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  is_b2b: true,
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
    data: Partial<Pick<Consumer, "name" | "email" | "phone">>,
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumer.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
  },
};

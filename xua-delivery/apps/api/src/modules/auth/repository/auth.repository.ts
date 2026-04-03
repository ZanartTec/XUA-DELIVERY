import { prisma } from "../../../infra/prisma/client.js";

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

// Select que inclui password_hash apenas para validação interna de login
const AUTH_SELECT = {
  ...SAFE_SELECT,
  password_hash: true,
} as const;

export const authRepository = {
  /**
   * Busca consumer por email incluindo password_hash para validação de login.
   */
  async findByEmailForAuth(email: string) {
    return prisma.consumer.findUnique({
      where: { email },
      select: AUTH_SELECT,
    });
  },

  /**
   * Busca consumer por ID (retorno seguro, sem password_hash).
   */
  async findById(id: string) {
    return prisma.consumer.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
  },

  /**
   * Verifica se email já existe.
   */
  async emailExists(email: string): Promise<boolean> {
    const consumer = await prisma.consumer.findUnique({
      where: { email },
      select: { id: true },
    });
    return consumer !== null;
  },

  /**
   * Cria um novo consumer (retorno seguro, sem password_hash).
   */
  async create(data: { name: string; email: string; phone: string; password_hash: string }) {
    return prisma.consumer.create({
      data,
      select: SAFE_SELECT,
    });
  },
};

import { signToken } from "../../../infra/auth/jwt";
import { hashPassword, comparePassword } from "../../../infra/auth/password";
import { blacklistToken } from "../../../infra/auth/blacklist";
import { authRepository } from "../repository/auth.repository.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { createLogger } from "../../../infra/logger";
import { isUserRole } from "@xua/shared/constants/roles";
import type { UserRole } from "@xua/shared/constants/roles";
import type { LoginInput, RegisterInput } from "@xua/shared/schemas/auth";

const log = createLogger("auth");

// DUMMY_HASH para mitigar timing attacks (obrigatório vir do ambiente)
const DUMMY_HASH = process.env.DUMMY_HASH as string;

if (!DUMMY_HASH) {
  throw new Error("FATAL: A variável de ambiente DUMMY_HASH não está configurada.");
}

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

export const authService = {
  /**
   * Autentica usuário por email/senha.
   * Retorna token JWT e dados do usuário (sem password_hash).
   */
  async login(input: LoginInput) {
    const consumer = await authRepository.findByEmailForAuth(input.email);

    // Usa o hash do usuário se existir; caso contrário, usa o hash fictício
    const hashToCompare = consumer ? consumer.password_hash : DUMMY_HASH;
    
    // Compara a senha independentemente de o usuário existir ou não (Mitigação de Timing Attack)
    const valid = await comparePassword(input.password, hashToCompare);

    if (!consumer || !valid) {
      log.warn(
        { email: input.email, userId: consumer?.id },
        `Login attempt — ${!consumer ? "email not found" : "wrong password"}`
      );
      throw new AuthServiceError("Credenciais inválidas", 401);
    }

    if (!consumer.is_active) {
      log.warn({ userId: consumer.id }, "Login attempt — account deactivated");
      throw new AuthServiceError("Conta desativada", 403);
    }

    const role = (consumer.role ?? "consumer").toLowerCase() as UserRole;
    
    if (!isUserRole(role)) {
      log.error({ userId: consumer.id, role }, "Role inválida no DB");
      throw new AuthServiceError("Conta com role inválida. Contate o suporte.", 403);
    }

    // Resolve distributor_id para incluir no JWT (evita query DB no socket handshake)
    const needsDistributor = role === "distributor_admin" || role === "driver";
    const distributor_id = needsDistributor
      ? (await distributorRepository.resolveDistributorId(consumer.id)) ?? undefined
      : undefined;

    const token = await signToken({
      sub: consumer.id,
      role,
      name: consumer.name,
      distributor_id,
    });

    // Remove password_hash antes de retornar
    const { password_hash: _, ...user } = consumer;

    log.info({ userId: consumer.id }, "User logged in");
    return { token, user };
  },

  /**
   * Registra novo usuário.
   * Retorna token JWT e dados do usuário.
   */
  async register(input: RegisterInput) {
    // Mitigação de Race Condition (TOCTOU)
    // Removemos a verificação prévia 'emailExists' e delegamos ao BD a responsabilidade 
    // de garantir unicidade, capturando o erro de constraint UNIQUE diretamente.
    const password_hash = await hashPassword(input.password);

    let consumer;
    try {
      consumer = await authRepository.create({
        name: input.name,
        email: input.email,
        phone: input.phone,
        password_hash,
      });
    } catch (error: any) {
      // P2002 é o código de erro do Prisma para violação de constraint Unique
      if (error.code === "P2002") {
        throw new AuthServiceError("E-mail já cadastrado", 409);
      }
      throw error;
    }

    const rawRole = (consumer.role ?? "consumer").toLowerCase();
    if (!isUserRole(rawRole)) {
      log.error({ userId: consumer.id, role: rawRole }, "Role inválida no DB");
      throw new AuthServiceError("Conta com role inválida. Contate o suporte.", 403);
    }
    const role: UserRole = rawRole;

    const token = await signToken({
      sub: consumer.id,
      role,
      name: consumer.name,
    });

    // authRepository.create já usa SAFE_SELECT — password_hash nunca é retornado
    log.info({ userId: consumer.id }, "User registered");
    return { token, user: consumer };
  },

  /**
   * Invalida um token JWT adicionando seu JTI ao blacklist.
   */
  async logout(jti: string, exp: number) {
    await blacklistToken(jti, exp);
    log.info({ jti }, "User logged out");
  },

  /**
   * Busca dados do usuário autenticado por ID.
   */
  async me(userId: string) {
    const consumer = await authRepository.findById(userId);
    if (!consumer) {
      throw new AuthServiceError("Consumidor não encontrado", 404);
    }
    return consumer;
  },
};

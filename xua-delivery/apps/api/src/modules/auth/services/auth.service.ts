import { signToken } from "../../../infra/auth/jwt";
import { hashPassword, comparePassword } from "../../../infra/auth/password";
import { blacklistToken } from "../../../infra/auth/blacklist";
import { authRepository } from "../repository/auth.repository.js";
import type { LoginInput, RegisterInput } from "@xua/shared/schemas/auth";

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

    if (!consumer) {
      throw new AuthServiceError("Credenciais inválidas", 401);
    }

    const valid = await comparePassword(input.password, consumer.password_hash);
    if (!valid) {
      throw new AuthServiceError("Credenciais inválidas", 401);
    }

    const token = await signToken({
      sub: consumer.id,
      role: consumer.role === "operator" ? "driver" : (consumer.role ?? "consumer"),
      name: consumer.name,
    });

    // Remove password_hash antes de retornar
    const { password_hash: _, ...user } = consumer;

    return { token, user };
  },

  /**
   * Registra novo usuário.
   * Retorna token JWT e dados do usuário.
   */
  async register(input: RegisterInput) {
    const exists = await authRepository.emailExists(input.email);
    if (exists) {
      throw new AuthServiceError("E-mail já cadastrado", 409);
    }

    const password_hash = await hashPassword(input.password);

    const consumer = await authRepository.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password_hash,
    });

    const token = await signToken({
      sub: consumer.id,
      role: consumer.role === "operator" ? "driver" : (consumer.role ?? "consumer"),
      name: consumer.name,
    });

    return { token, user: consumer };
  },

  /**
   * Invalida um token JWT adicionando seu JTI ao blacklist.
   */
  async logout(jti: string, exp: number) {
    await blacklistToken(jti, exp);
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

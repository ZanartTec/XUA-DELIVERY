import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { EnvValidationError, validateEnv } from "@api/config/env";

const VALID_JWT_SECRET = "a".repeat(40);
const VALID_MASTER_KEY = randomBytes(32).toString("hex");

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/xua",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: VALID_JWT_SECRET,
    ...overrides,
  };
}

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseEnv({
    NODE_ENV: "production",
    ENCRYPTION_MASTER_KEY: VALID_MASTER_KEY,
    OTP_SECRET: "otp-secret",
    PASSWORD_RESET_SECRET: "reset-secret",
    INTERNAL_SECRET: "internal-secret",
    DUMMY_HASH: "$2b$10$abcdefghijklmnopqrstuv",
    APP_ORIGIN: "https://app.xua.com.br",
    RESEND_API_KEY: "re_test",
    VAPID_PUBLIC_KEY: "public",
    VAPID_PRIVATE_KEY: "private",
    ...overrides,
  });
}

function issuesOf(env: NodeJS.ProcessEnv): string[] {
  try {
    validateEnv(env);
    return [];
  } catch (err) {
    if (err instanceof EnvValidationError) return err.issues;
    throw err;
  }
}

describe("validateEnv", () => {
  it("aceita um ambiente de desenvolvimento mínimo", () => {
    const { env, warnings } = validateEnv(baseEnv());

    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/xua");
    // Avisos de produção não se aplicam fora de produção.
    expect(warnings).toEqual([]);
  });

  it("lista TODOS os problemas de uma vez, não apenas o primeiro", () => {
    const issues = issuesOf({ NODE_ENV: "development" });

    expect(issues).toHaveLength(3);
    expect(issues.some((i) => i.startsWith("DATABASE_URL"))).toBe(true);
    expect(issues.some((i) => i.startsWith("JWT_SECRET"))).toBe(true);
    expect(issues.some((i) => i.startsWith("REDIS_URL"))).toBe(true);
  });

  it("trata string vazia como variável ausente", () => {
    const issues = issuesOf(baseEnv({ DATABASE_URL: "   " }));

    expect(issues.some((i) => i.startsWith("DATABASE_URL"))).toBe(true);
  });

  describe("JWT_SECRET", () => {
    it("rejeita segredo com menos de 32 caracteres", () => {
      const issues = issuesOf(baseEnv({ JWT_SECRET: "curto" }));

      expect(issues.some((i) => i.includes("32 caracteres"))).toBe(true);
    });

    it("rejeita o placeholder do .env de exemplo", () => {
      const issues = issuesOf(
        baseEnv({ JWT_SECRET: "troque-por-uma-chave-segura-1234567890" })
      );

      expect(issues.some((i) => i.includes("placeholder"))).toBe(true);
    });
  });

  describe("Redis", () => {
    it("aceita overrides específicos no lugar de REDIS_URL", () => {
      const env = baseEnv({
        REDIS_URL: undefined,
        CACHE_REDIS_URL: "redis://cache:6379",
        QUEUE_REDIS_URL: "redis://queue:6379",
      });

      expect(() => validateEnv(env)).not.toThrow();
    });

    it("exige REDIS_URL quando só um dos overrides está definido", () => {
      const issues = issuesOf(
        baseEnv({ REDIS_URL: undefined, CACHE_REDIS_URL: "redis://cache:6379" })
      );

      expect(issues.some((i) => i.startsWith("REDIS_URL"))).toBe(true);
    });
  });

  describe("ENCRYPTION_MASTER_KEY", () => {
    it("aceita 32 bytes em hex", () => {
      expect(() =>
        validateEnv(baseEnv({ ENCRYPTION_MASTER_KEY: VALID_MASTER_KEY }))
      ).not.toThrow();
    });

    it("aceita 32 bytes em base64", () => {
      expect(() =>
        validateEnv(
          baseEnv({ ENCRYPTION_MASTER_KEY: randomBytes(32).toString("base64") })
        )
      ).not.toThrow();
    });

    it("rejeita chave com tamanho errado", () => {
      const issues = issuesOf(baseEnv({ ENCRYPTION_MASTER_KEY: "chave-curta-demais" }));

      expect(issues.some((i) => i.startsWith("ENCRYPTION_MASTER_KEY"))).toBe(true);
    });
  });

  describe("produção", () => {
    it("aceita um ambiente de produção completo, sem avisos", () => {
      const { warnings } = validateEnv(productionEnv());

      expect(warnings).toEqual([]);
    });

    it("exige os segredos que hoje só falhariam no primeiro request", () => {
      const issues = issuesOf({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db:5432/xua",
        REDIS_URL: "redis://redis:6379",
        JWT_SECRET: VALID_JWT_SECRET,
      });

      for (const key of [
        "ENCRYPTION_MASTER_KEY",
        "OTP_SECRET",
        "PASSWORD_RESET_SECRET",
        "INTERNAL_SECRET",
        "DUMMY_HASH",
        "APP_ORIGIN",
      ]) {
        expect(issues.some((i) => i.startsWith(key))).toBe(true);
      }
    });

    it("não exige esses segredos fora de produção", () => {
      expect(() => validateEnv(baseEnv({ NODE_ENV: "development" }))).not.toThrow();
    });

    it("avisa — sem derrubar o boot — sobre e-mail e push desabilitados", () => {
      const { warnings } = validateEnv(
        productionEnv({
          RESEND_API_KEY: undefined,
          VAPID_PUBLIC_KEY: undefined,
          VAPID_PRIVATE_KEY: undefined,
        })
      );

      expect(warnings).toHaveLength(3);
      expect(warnings.some((w) => w.startsWith("RESEND_API_KEY"))).toBe(true);
    });
  });

  describe("coerção de tipos", () => {
    it("converte números e booleanos vindos como string", () => {
      const { env } = validateEnv(
        baseEnv({
          PORT: "4000",
          PAYMENTS_WORKER_CONCURRENCY: "5",
          USE_BULLMQ_SUBSCRIPTION: "true",
          USE_BULLMQ_OTP_CLEANUP: "0",
        })
      );

      expect(env.PORT).toBe(4000);
      expect(env.PAYMENTS_WORKER_CONCURRENCY).toBe(5);
      expect(env.USE_BULLMQ_SUBSCRIPTION).toBe(true);
      expect(env.USE_BULLMQ_OTP_CLEANUP).toBe(false);
    });

    it("rejeita número inválido em vez de virar NaN silencioso", () => {
      const issues = issuesOf(baseEnv({ PAYMENTS_WORKER_CONCURRENCY: "muitos" }));

      expect(issues.some((i) => i.startsWith("PAYMENTS_WORKER_CONCURRENCY"))).toBe(true);
    });
  });

  it("a mensagem do erro lista cada problema em uma linha", () => {
    try {
      validateEnv({ NODE_ENV: "development" });
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const message = (err as EnvValidationError).message;
      expect(message).toContain("configuração de ambiente inválida");
      expect(message.split("\n").length).toBe(4); // cabeçalho + 3 problemas
    }
  });
});

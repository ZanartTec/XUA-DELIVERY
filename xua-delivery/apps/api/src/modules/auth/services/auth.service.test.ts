import { beforeEach, describe, expect, it, vi } from "vitest";

// authService lê DUMMY_HASH do ambiente no import do módulo (mitigação de
// timing attack) — precisa estar definido antes do `await import` abaixo.
process.env.DUMMY_HASH = "$2b$10$wXg1jNr2OCG.oa4U0Z3YXukHuIW/LnpTfPgFQVsudRT/Ddagqx0JW";

const mocks = vi.hoisted(() => ({
  authRepository: {
    findByEmailForAuth: vi.fn(),
  },
  distributorRepository: {
    resolveDistributorId: vi.fn(),
  },
  signToken: vi.fn(),
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
  blacklistToken: vi.fn(),
}));

vi.mock("../repository/auth.repository.js", () => ({
  authRepository: mocks.authRepository,
}));

vi.mock("../../distributor/repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));

vi.mock("../../../infra/auth/jwt", () => ({
  signToken: mocks.signToken,
}));

vi.mock("../../../infra/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  comparePassword: mocks.comparePassword,
}));

vi.mock("../../../infra/auth/blacklist", () => ({
  blacklistToken: mocks.blacklistToken,
}));

const { authService, AuthServiceError } = await import("./auth.service.js");

const consumerId = "7e1d7b55-3f52-4d10-aac3-74387c236901";

function driverConsumer(overrides: Record<string, unknown> = {}) {
  return {
    id: consumerId,
    name: "Motorista Teste",
    email: "motorista@xua.test",
    phone: "11988887777",
    role: "DRIVER",
    is_b2b: false,
    is_active: true,
    distributor_id: null,
    password_hash: "hash-real",
    created_at: new Date("2026-08-01T00:00:00.000Z"),
    updated_at: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.comparePassword.mockResolvedValue(true);
  mocks.signToken.mockResolvedValue("jwt-token");
  mocks.distributorRepository.resolveDistributorId.mockResolvedValue(null);
});

describe("authService.login", () => {
  it("bloqueia login de conta desativada mesmo com senha correta (SEC: is_active)", async () => {
    mocks.authRepository.findByEmailForAuth.mockResolvedValue(driverConsumer({ is_active: false }));

    await expect(
      authService.login({ email: "motorista@xua.test", password: "senha1234" })
    ).rejects.toMatchObject({ name: "AuthServiceError", status: 403, message: "Conta desativada" });

    expect(mocks.signToken).not.toHaveBeenCalled();
  });

  it("permite login normalmente quando a conta esta ativa", async () => {
    mocks.authRepository.findByEmailForAuth.mockResolvedValue(driverConsumer({ is_active: true }));

    const result = await authService.login({ email: "motorista@xua.test", password: "senha1234" });

    expect(mocks.signToken).toHaveBeenCalledTimes(1);
    expect(result.token).toBe("jwt-token");
    expect(result.user).not.toHaveProperty("password_hash");
  });

  it("rejeita senha incorreta com 401 antes de checar is_active", async () => {
    mocks.comparePassword.mockResolvedValue(false);
    mocks.authRepository.findByEmailForAuth.mockResolvedValue(driverConsumer({ is_active: false }));

    await expect(
      authService.login({ email: "motorista@xua.test", password: "senha-errada" })
    ).rejects.toMatchObject({ name: "AuthServiceError", status: 401, message: "Credenciais inválidas" });
  });

  it("rejeita e-mail inexistente com 401 (mitigacao de timing attack via DUMMY_HASH)", async () => {
    mocks.authRepository.findByEmailForAuth.mockResolvedValue(null);

    await expect(
      authService.login({ email: "ninguem@xua.test", password: "senha1234" })
    ).rejects.toMatchObject({ name: "AuthServiceError", status: 401 });

    expect(mocks.comparePassword).toHaveBeenCalledWith(
      "senha1234",
      "$2b$10$wXg1jNr2OCG.oa4U0Z3YXukHuIW/LnpTfPgFQVsudRT/Ddagqx0JW"
    );
  });
});

describe("AuthServiceError", () => {
  it("carrega status http junto da mensagem", () => {
    const error = new AuthServiceError("Conta desativada", 403);
    expect(error.status).toBe(403);
    expect(error.message).toBe("Conta desativada");
  });
});

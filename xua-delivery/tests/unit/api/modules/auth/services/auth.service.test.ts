import { beforeEach, describe, expect, it, vi } from "vitest";

// authService lê DUMMY_HASH do ambiente no import do módulo (mitigação de
// timing attack) — precisa estar definido antes do `await import` abaixo.
process.env.DUMMY_HASH = "$2b$10$wXg1jNr2OCG.oa4U0Z3YXukHuIW/LnpTfPgFQVsudRT/Ddagqx0JW";

const mocks = vi.hoisted(() => ({
  authRepository: {
    findByEmailForAuth: vi.fn(),
    findByIdForAuth: vi.fn(),
    updatePassword: vi.fn(),
  },
  distributorRepository: {
    resolveDistributorId: vi.fn(),
  },
  signToken: vi.fn(),
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
  blacklistToken: vi.fn(),
  markPasswordChanged: vi.fn(),
}));

vi.mock("@api/modules/auth/repository/auth.repository.js", () => ({
  authRepository: mocks.authRepository,
}));

vi.mock("@api/modules/distributor/repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));

vi.mock("@api/infra/auth/jwt", () => ({
  signToken: mocks.signToken,
}));

vi.mock("@api/infra/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  comparePassword: mocks.comparePassword,
}));

vi.mock("@api/infra/auth/blacklist", () => ({
  blacklistToken: mocks.blacklistToken,
}));

// password-change.js importa o cliente Redis, que lança no import quando
// REDIS_URL não está definida — mockar aqui mantém o teste sem infra externa.
vi.mock("@api/infra/auth/password-change.js", () => ({
  markPasswordChanged: mocks.markPasswordChanged,
}));

const { authService, AuthServiceError } = await import("@api/modules/auth/services/auth.service.js");

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

describe("authService.changePassword", () => {
  const userId = "8b1c0d20-3333-4c00-9000-000000000001";

  function givenUser() {
    mocks.authRepository.findByIdForAuth.mockResolvedValue({
      id: userId,
      password_hash: "$2b$10$hash-atual",
    });
  }

  it("troca a senha quando a atual confere", async () => {
    givenUser();
    mocks.comparePassword.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue("$2b$10$hash-novo");

    await authService.changePassword(userId, "senha-atual", "senha-nova-123");

    expect(mocks.comparePassword).toHaveBeenCalledWith("senha-atual", "$2b$10$hash-atual");
    expect(mocks.authRepository.updatePassword).toHaveBeenCalledWith(userId, "$2b$10$hash-novo");
  });

  it("recusa quando a senha atual está errada, sem gravar nada", async () => {
    givenUser();
    mocks.comparePassword.mockResolvedValue(false);

    await expect(
      authService.changePassword(userId, "senha-errada", "senha-nova-123")
    ).rejects.toMatchObject({ name: "AuthServiceError", status: 401 });

    expect(mocks.authRepository.updatePassword).not.toHaveBeenCalled();
    expect(mocks.markPasswordChanged).not.toHaveBeenCalled();
  });

  it("recusa usuário inexistente", async () => {
    mocks.authRepository.findByIdForAuth.mockResolvedValue(null);

    await expect(
      authService.changePassword(userId, "senha-atual", "senha-nova-123")
    ).rejects.toMatchObject({ name: "AuthServiceError", status: 404 });

    expect(mocks.authRepository.updatePassword).not.toHaveBeenCalled();
  });

  // Trocar a senha tem que expulsar quem já estava dentro: se a conta foi
  // comprometida, a sessão do atacante morre no request seguinte.
  it("invalida as sessões emitidas antes da troca", async () => {
    givenUser();
    mocks.comparePassword.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue("$2b$10$hash-novo");

    await authService.changePassword(userId, "senha-atual", "senha-nova-123");

    expect(mocks.markPasswordChanged).toHaveBeenCalledWith(userId, expect.any(Number));
  });
});

describe("AuthServiceError", () => {
  it("carrega status http junto da mensagem", () => {
    const error = new AuthServiceError("Conta desativada", 403);
    expect(error.status).toBe(403);
    expect(error.message).toBe("Conta desativada");
  });
});

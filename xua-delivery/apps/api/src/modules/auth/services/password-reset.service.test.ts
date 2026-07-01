import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authRepository: {
    findByEmailForAuth: vi.fn(),
  },
  passwordResetRepository: {
    create: vi.fn(),
    findByHash: vi.fn(),
    invalidateActiveForConsumer: vi.fn(),
    deleteExpired: vi.fn(),
  },
  sendMail: vi.fn(),
  hashPassword: vi.fn(),
  markPasswordChanged: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../repository/auth.repository.js", () => ({
  authRepository: mocks.authRepository,
}));
vi.mock("../repository/password-reset.repository.js", () => ({
  passwordResetRepository: mocks.passwordResetRepository,
}));
vi.mock("../../../infra/mail/mailer.js", () => ({ sendMail: mocks.sendMail }));
vi.mock("../../../infra/auth/password.js", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("../../../infra/auth/password-change.js", () => ({
  markPasswordChanged: mocks.markPasswordChanged,
}));
vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));
vi.mock("./auth.service.js", () => ({
  AuthServiceError: class AuthServiceError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
      this.name = "AuthServiceError";
    }
  },
}));

const { passwordResetService } = await import("./password-reset.service.js");

const consumerId = "7e1d7b55-3f52-4d10-aac3-74387c236801";
const email = "cliente@exemplo.com";

// tx client falso reutilizado pelo mock de $transaction.
const tx = {
  passwordResetToken: { updateMany: vi.fn() },
  consumer: { update: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendMail.mockResolvedValue(undefined);
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.markPasswordChanged.mockResolvedValue(undefined);
  mocks.passwordResetRepository.create.mockResolvedValue({});
  mocks.passwordResetRepository.invalidateActiveForConsumer.mockResolvedValue({ count: 0 });
  tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
  tx.consumer.update.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
});

describe("passwordResetService.requestReset", () => {
  it("não gera token nem envia e-mail para e-mail inexistente", async () => {
    mocks.authRepository.findByEmailForAuth.mockResolvedValue(null);

    await passwordResetService.requestReset(email);

    expect(mocks.passwordResetRepository.create).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("invalida tokens anteriores, cria novo token e dispara e-mail para e-mail existente", async () => {
    mocks.authRepository.findByEmailForAuth.mockResolvedValue({
      id: consumerId,
      email,
      name: "Cliente Teste",
    });

    await passwordResetService.requestReset(email);

    expect(mocks.passwordResetRepository.invalidateActiveForConsumer).toHaveBeenCalledWith(
      consumerId
    );
    expect(mocks.passwordResetRepository.create).toHaveBeenCalledTimes(1);
    const createArg = mocks.passwordResetRepository.create.mock.calls[0][0];
    expect(createArg.consumer_id).toBe(consumerId);
    expect(typeof createArg.token_hash).toBe("string");
    expect(createArg.expires_at).toBeInstanceOf(Date);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail.mock.calls[0][0].to).toBe(email);
  });
});

describe("passwordResetService.resetPassword", () => {
  it("rejeita token inexistente", async () => {
    mocks.passwordResetRepository.findByHash.mockResolvedValue(null);

    await expect(passwordResetService.resetPassword("tok", "novaSenha123")).rejects.toThrow(
      "Token inválido ou expirado"
    );
    expect(mocks.markPasswordChanged).not.toHaveBeenCalled();
  });

  it("rejeita token já usado", async () => {
    mocks.passwordResetRepository.findByHash.mockResolvedValue({
      id: "t1",
      consumer_id: consumerId,
      used_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
    });

    await expect(passwordResetService.resetPassword("tok", "novaSenha123")).rejects.toThrow(
      "Token inválido ou expirado"
    );
  });

  it("rejeita token expirado", async () => {
    mocks.passwordResetRepository.findByHash.mockResolvedValue({
      id: "t1",
      consumer_id: consumerId,
      used_at: null,
      expires_at: new Date(Date.now() - 60_000),
    });

    await expect(passwordResetService.resetPassword("tok", "novaSenha123")).rejects.toThrow(
      "Token inválido ou expirado"
    );
  });

  it("redefine a senha e invalida sessões antigas no caminho feliz", async () => {
    mocks.passwordResetRepository.findByHash.mockResolvedValue({
      id: "t1",
      consumer_id: consumerId,
      used_at: null,
      expires_at: new Date(Date.now() + 60_000),
    });

    await passwordResetService.resetPassword("tok", "novaSenha123");

    expect(mocks.hashPassword).toHaveBeenCalledWith("novaSenha123");
    expect(tx.consumer.update).toHaveBeenCalledWith({
      where: { id: consumerId },
      data: { password_hash: "hashed-password" },
    });
    expect(mocks.markPasswordChanged).toHaveBeenCalledTimes(1);
    expect(mocks.markPasswordChanged.mock.calls[0][0]).toBe(consumerId);
    expect(typeof mocks.markPasswordChanged.mock.calls[0][1]).toBe("number");
  });

  it("rejeita quando perde a corrida pelo token (updateMany count 0)", async () => {
    mocks.passwordResetRepository.findByHash.mockResolvedValue({
      id: "t1",
      consumer_id: consumerId,
      used_at: null,
      expires_at: new Date(Date.now() + 60_000),
    });
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(passwordResetService.resetPassword("tok", "novaSenha123")).rejects.toThrow(
      "Token inválido ou expirado"
    );
    expect(tx.consumer.update).not.toHaveBeenCalled();
    expect(mocks.markPasswordChanged).not.toHaveBeenCalled();
  });
});

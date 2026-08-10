import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OtpStatus } from "@xua/shared/enums";

process.env.OTP_SECRET = "test-otp-secret-do-not-use-in-production";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  otpRepository: {
    create: vi.fn(),
    findActive: vi.fn(),
    findActiveForUpdate: vi.fn(),
    incrementAttempts: vi.fn(),
    markUsed: vi.fn(),
    markLocked: vi.fn(),
  },
  auditRepository: {
    emit: vi.fn(),
  },
  redis: {
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../repository/otp.repository.js", () => ({
  otpRepository: mocks.otpRepository,
}));

vi.mock("../../audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));

vi.mock("../../../infra/redis/client.js", () => ({
  default: mocks.redis,
}));

const { otpService } = await import("./otp.service.js");

function hashFor(code: string): string {
  return createHmac("sha256", process.env.OTP_SECRET!).update(code).digest("hex");
}

function fakeTx() {
  return { orderOtp: { updateMany: vi.fn() } } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redis.set.mockResolvedValue("OK");
  mocks.redis.del.mockResolvedValue(1);
  mocks.transaction.mockImplementation((cb: any) => cb(fakeTx()));
});

describe("otpService.generateInTx", () => {
  it("gera código de 6 dígitos e persiste apenas o hash, nunca o texto claro", async () => {
    mocks.otpRepository.create.mockResolvedValue({ id: "otp-1" });
    mocks.auditRepository.emit.mockResolvedValue({});
    const tx = fakeTx();

    const code = await otpService.generateInTx("order-1", "distributor-user-1", tx);

    expect(code).toMatch(/^\d{6}$/);
    const createCall = mocks.otpRepository.create.mock.calls[0][0];
    expect(createCall.otp_hash).toBe(hashFor(code));
    expect(createCall.otp_hash).not.toContain(code);
    expect(createCall.order_id).toBe("order-1");
  });

  it("invalida OTPs ativos anteriores do mesmo pedido antes de criar um novo", async () => {
    mocks.otpRepository.create.mockResolvedValue({ id: "otp-1" });
    const tx = fakeTx();

    await otpService.generateInTx("order-1", "distributor-user-1", tx);

    expect(tx.orderOtp.updateMany).toHaveBeenCalledWith({
      where: { order_id: "order-1", status: OtpStatus.ACTIVE },
      data: { status: OtpStatus.EXPIRED },
    });
  });

  it("emite evento de auditoria OTP_GENERATED", async () => {
    mocks.otpRepository.create.mockResolvedValue({ id: "otp-1" });

    await otpService.generateInTx("order-1", "distributor-user-1", fakeTx());

    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "OTP_GENERATED", orderId: "order-1" }),
      expect.anything()
    );
  });
});

describe("otpService.cacheCode", () => {
  it("grava o código em claro no Redis com TTL de 90 minutos", async () => {
    await otpService.cacheCode("order-1", "123456");
    expect(mocks.redis.set).toHaveBeenCalledWith("otp:order-1", "123456", "EX", 90 * 60);
  });
});

describe("otpService.validate", () => {
  it("rejeita quando não há OTP ativo para o pedido", async () => {
    mocks.otpRepository.findActiveForUpdate.mockResolvedValue(null);

    await expect(otpService.validate("order-1", "123456", "driver-1")).rejects.toMatchObject({
      code: "OTP_NOT_FOUND",
    });
  });

  it("rejeita e marca como expirado quando o TTL passou", async () => {
    mocks.otpRepository.findActiveForUpdate.mockResolvedValue({
      id: "otp-1",
      otp_hash: hashFor("123456"),
      attempts: 0,
      expires_at: new Date(Date.now() - 1000),
    });

    await expect(otpService.validate("order-1", "123456", "driver-1")).rejects.toMatchObject({
      code: "OTP_EXPIRED",
    });
    expect(mocks.otpRepository.markUsed).toHaveBeenCalledWith("otp-1", expect.anything());
  });

  it("rejeita quando já esgotou as tentativas (bloqueado)", async () => {
    mocks.otpRepository.findActiveForUpdate.mockResolvedValue({
      id: "otp-1",
      otp_hash: hashFor("123456"),
      attempts: 5,
      expires_at: new Date(Date.now() + 60_000),
    });

    await expect(otpService.validate("order-1", "123456", "driver-1")).rejects.toMatchObject({
      code: "OTP_LOCKED",
    });
    expect(mocks.otpRepository.markLocked).toHaveBeenCalledWith("otp-1", expect.anything());
  });

  it("código correto: marca como usado e remove do Redis", async () => {
    mocks.otpRepository.findActiveForUpdate.mockResolvedValue({
      id: "otp-1",
      otp_hash: hashFor("123456"),
      attempts: 0,
      expires_at: new Date(Date.now() + 60_000),
    });

    const result = await otpService.validate("order-1", "123456", "driver-1");

    expect(result).toEqual({ isValid: true, attempts: 1, maxAttempts: 5, locked: false });
    expect(mocks.otpRepository.markUsed).toHaveBeenCalledWith("otp-1", expect.anything());
    expect(mocks.redis.del).toHaveBeenCalledWith("otp:order-1");
  });

  it("código incorreto: incrementa tentativas sem travar antes do limite", async () => {
    mocks.otpRepository.findActiveForUpdate.mockResolvedValue({
      id: "otp-1",
      otp_hash: hashFor("123456"),
      attempts: 2,
      expires_at: new Date(Date.now() + 60_000),
    });
    mocks.otpRepository.incrementAttempts.mockResolvedValue({ id: "otp-1", attempts: 3 });

    const result = await otpService.validate("order-1", "000000", "driver-1");

    expect(result).toEqual({ isValid: false, attempts: 3, maxAttempts: 5, locked: false });
    expect(mocks.otpRepository.markLocked).not.toHaveBeenCalled();
  });

  it("código incorreto na última tentativa disponível: trava o OTP", async () => {
    mocks.otpRepository.findActiveForUpdate.mockResolvedValue({
      id: "otp-1",
      otp_hash: hashFor("123456"),
      attempts: 4,
      expires_at: new Date(Date.now() + 60_000),
    });
    mocks.otpRepository.incrementAttempts.mockResolvedValue({ id: "otp-1", attempts: 5 });

    const result = await otpService.validate("order-1", "000000", "driver-1");

    expect(result).toEqual({ isValid: false, attempts: 5, maxAttempts: 5, locked: true });
    expect(mocks.otpRepository.markLocked).toHaveBeenCalledWith("otp-1", expect.anything());
  });
});

describe("otpService.override", () => {
  it("marca o OTP ativo como usado sem validar código e emite auditoria com motivo", async () => {
    mocks.otpRepository.findActive.mockResolvedValue({ id: "otp-1" });

    await otpService.override("order-1", "support-1", "cliente sem acesso ao app", "detalhe extra");

    expect(mocks.otpRepository.markUsed).toHaveBeenCalledWith("otp-1", expect.anything());
    expect(mocks.redis.del).toHaveBeenCalledWith("otp:order-1");
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "OTP_OVERRIDE",
        payload: expect.objectContaining({ reason: "cliente sem acesso ao app" }),
      }),
      expect.anything()
    );
  });

  it("não falha quando não há OTP ativo — ainda registra a auditoria", async () => {
    mocks.otpRepository.findActive.mockResolvedValue(null);

    await expect(
      otpService.override("order-1", "support-1", "motivo qualquer")
    ).resolves.toBeUndefined();
    expect(mocks.otpRepository.markUsed).not.toHaveBeenCalled();
    expect(mocks.auditRepository.emit).toHaveBeenCalled();
  });
});

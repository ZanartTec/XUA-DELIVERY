import { describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "unit-test-jwt-secret-with-32-chars-minimum";

const { signToken, verifyToken } = await import("./jwt.js");

describe("signToken / verifyToken", () => {
  it("roundtrip preserva sub, role, name e distributor_id", async () => {
    const token = await signToken({
      sub: "user-1",
      role: "distributor_admin",
      name: "Fulano",
      distributor_id: "dist-1",
    });

    const payload = await verifyToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.role).toBe("distributor_admin");
    expect(payload.name).toBe("Fulano");
    expect(payload.distributor_id).toBe("dist-1");
    expect(payload.jti).toBeDefined();
  });

  it("rejeita role inválida ao assinar", async () => {
    await expect(
      signToken({ sub: "user-1", role: "hacker" as any, name: "X" })
    ).rejects.toThrow(/role inválida/);
  });

  it("rejeita token assinado com segredo diferente", async () => {
    const { SignJWT } = await import("jose");
    const wrongToken = await new SignJWT({ sub: "user-1", role: "consumer", name: "X" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("xua-delivery")
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode("outro-segredo-com-32-caracteres-ok"));

    await expect(verifyToken(wrongToken)).rejects.toThrow();
  });

  it("rejeita token com issuer diferente", async () => {
    const { SignJWT } = await import("jose");
    const badIssuerToken = await new SignJWT({ sub: "user-1", role: "consumer", name: "X" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("outro-issuer")
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    await expect(verifyToken(badIssuerToken)).rejects.toThrow();
  });

  it("rejeita token com role inválida embutida diretamente (contorna o signToken)", async () => {
    const { SignJWT } = await import("jose");
    const invalidRoleToken = await new SignJWT({ sub: "user-1", role: "not-a-role", name: "X" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("xua-delivery")
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    await expect(verifyToken(invalidRoleToken)).rejects.toThrow(/role inválida/);
  });
});

describe("validação de JWT_SECRET no boot (module load)", () => {
  it("recusa subir sem JWT_SECRET definido", async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    vi.resetModules();
    await expect(import("./jwt.js")).rejects.toThrow(/JWT_SECRET não definido/);
    process.env.JWT_SECRET = original;
  });

  it("recusa segredo com menos de 32 caracteres", async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "curto";
    vi.resetModules();
    await expect(import("./jwt.js")).rejects.toThrow(/pelo menos 32 caracteres/);
    process.env.JWT_SECRET = original;
  });

  it("recusa valor placeholder do template de exemplo", async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "troque-por-uma-chave-segura-1234567890";
    vi.resetModules();
    await expect(import("./jwt.js")).rejects.toThrow(/placeholder/);
    process.env.JWT_SECRET = original;
  });
});

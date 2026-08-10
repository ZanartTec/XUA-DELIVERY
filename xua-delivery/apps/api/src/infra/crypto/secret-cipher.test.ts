import { randomBytes } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString("hex");
});

const { encryptSecret, decryptSecret, maskSecret } = await import("./secret-cipher.js");

describe("encryptSecret / decryptSecret", () => {
  it("roundtrip preserva o texto original", () => {
    const plaintext = "access-token-super-secreto-do-mercado-pago";
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("gera ciphertext diferente a cada chamada (IV aleatório)", () => {
    const a = encryptSecret("mesmo-segredo");
    const b = encryptSecret("mesmo-segredo");
    expect(a).not.toBe(b);
  });

  it("formato armazenado tem 3 partes separadas por ':'", () => {
    const encrypted = encryptSecret("qualquer-coisa");
    expect(encrypted.split(":")).toHaveLength(3);
  });

  it("rejeita payload malformado (não tem 3 partes)", () => {
    expect(() => decryptSecret("so-uma-parte")).toThrow("ENCRYPTED_SECRET_MALFORMED");
  });

  it("rejeita payload com authTag adulterado", () => {
    const encrypted = encryptSecret("valor-original");
    const [iv, , ciphertext] = encrypted.split(":");
    const tampered = [iv, Buffer.from("tag-invalida").toString("base64"), ciphertext].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("maskSecret", () => {
  it("mostra só os últimos 4 caracteres", () => {
    expect(maskSecret("APP_USR-1234567890")).toBe("****7890");
  });

  it("retorna null para valor vazio ou nulo", () => {
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret(undefined)).toBeNull();
    expect(maskSecret("")).toBeNull();
  });
});

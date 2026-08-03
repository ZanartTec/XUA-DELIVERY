import { describe, expect, it } from "vitest";
import { distributorCreateSchema, distributorUpdateSchema } from "./distributor";

const validCreatePayload = {
  name: "Distribuidora São Luiz",
  cnpj: "11.222.333/0001-81",
  phone: "11988887777",
  email: "contato@saoluiz.test",
  admin_name: "Admin São Luiz",
  admin_email: "admin@saoluiz.test",
  admin_phone: "11988886666",
  admin_password: "senha1234",
};

describe("distributorCreateSchema", () => {
  it("aceita payload valido, normalizando o CNPJ para somente digitos", () => {
    const parsed = distributorCreateSchema.parse(validCreatePayload);
    expect(parsed.cnpj).toBe("11222333000181");
  });

  it("rejeita CNPJ com digito verificador invalido", () => {
    const parsed = distributorCreateSchema.safeParse({
      ...validCreatePayload,
      cnpj: "11222333000180",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejeita senha do admin menor que 8 caracteres", () => {
    const parsed = distributorCreateSchema.safeParse({
      ...validCreatePayload,
      admin_password: "1234567",
    });
    expect(parsed.success).toBe(false);
  });

  it("nao aceita is_active na criacao (toda distribuidora nasce ativa)", () => {
    const parsed = distributorCreateSchema.parse({ ...validCreatePayload, is_active: false } as any);
    expect(parsed).not.toHaveProperty("is_active");
  });
});

describe("distributorUpdateSchema", () => {
  it("aceita atualizacao parcial contendo apenas is_active", () => {
    const parsed = distributorUpdateSchema.parse({ is_active: false });
    expect(parsed).toEqual({ is_active: false });
  });

  it("aceita objeto vazio (nenhum campo obrigatorio no PATCH)", () => {
    const parsed = distributorUpdateSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("rejeita CNPJ invalido mesmo em atualizacao parcial", () => {
    const parsed = distributorUpdateSchema.safeParse({ cnpj: "00000000000000" });
    expect(parsed.success).toBe(false);
  });
});

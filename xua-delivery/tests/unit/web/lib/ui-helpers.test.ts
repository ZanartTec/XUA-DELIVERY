import { describe, expect, it } from "vitest";
import { addDaysIso, currentHourInAppZone, isoDayToDate, todayIso } from "@/src/lib/datetime";
import { formatCep, formatPhone, phoneHref, plural, whatsappHref } from "@/src/lib/format";
import { consumerOrderProgress } from "@/src/lib/order-status";

describe("datetime (America/Sao_Paulo)", () => {
  it("às 21h29 de Brasília ainda é o mesmo dia (antes virava o dia seguinte em UTC — C-05)", () => {
    // 04/11/2026 21:29 em Brasília = 05/11/2026 00:29 UTC
    const instant = new Date("2026-11-05T00:29:00Z");
    expect(todayIso(instant)).toBe("2026-11-04");
    expect(currentHourInAppZone(instant)).toBe(21);
  });

  it("soma dias atravessando mês e ano", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("isoDayToDate não desloca o dia ao formatar", () => {
    expect(isoDayToDate("2026-11-05").toISOString().slice(0, 10)).toBe("2026-11-05");
  });
});

describe("format", () => {
  it("máscara de telefone fixo, celular e parcial", () => {
    expect(formatPhone("32990011001")).toBe("(32) 99001-1001");
    expect(formatPhone("3234567890")).toBe("(32) 3456-7890");
    expect(formatPhone("329")).toBe("(32) 9");
    expect(formatPhone("+55 (32) 99001-1001")).toBe("(32) 99001-1001");
  });

  it("máscara de CEP", () => {
    expect(formatCep("36010000")).toBe("36010-000");
    expect(formatCep("3601")).toBe("3601");
  });

  it("links de contato só com número completo", () => {
    expect(phoneHref("(32) 99001-1001")).toBe("tel:+5532990011001");
    expect(whatsappHref("(32) 99001-1001")).toBe("https://wa.me/5532990011001");
    expect(whatsappHref("123")).toBeNull();
  });

  it("plural", () => {
    expect(plural(1, "garrafão", "garrafões")).toBe("1 garrafão");
    expect(plural(2, "garrafão", "garrafões")).toBe("2 garrafões");
  });
});

describe("consumerOrderProgress (C-07)", () => {
  it("enviado à distribuidora ainda é a etapa Confirmado, não A caminho", () => {
    expect(consumerOrderProgress("SENT_TO_DISTRIBUTOR")).toEqual({ kind: "progress", current: 0 });
  });

  it("separação e pronto para sair contam como Aceito", () => {
    expect(consumerOrderProgress("PICKING")).toEqual({ kind: "progress", current: 1 });
    expect(consumerOrderProgress("READY_FOR_DISPATCH")).toEqual({ kind: "progress", current: 1 });
  });

  it("em rota e entregue", () => {
    expect(consumerOrderProgress("OUT_FOR_DELIVERY")).toEqual({ kind: "progress", current: 2 });
    expect(consumerOrderProgress("DELIVERED")).toEqual({ kind: "progress", current: 3 });
  });

  it("aguardando pagamento e estados de problema", () => {
    expect(consumerOrderProgress("PAYMENT_PENDING")).toEqual({ kind: "pending" });
    expect(consumerOrderProgress("CANCELLED")).toEqual({ kind: "issue" });
    expect(consumerOrderProgress("DELIVERY_FAILED")).toEqual({ kind: "issue" });
  });
});

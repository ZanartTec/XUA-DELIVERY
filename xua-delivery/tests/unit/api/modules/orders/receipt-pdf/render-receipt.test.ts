import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { PaymentStatus } from "@xua/shared/enums";
import {
  renderReceiptsPdf,
  type RenderableReceipt,
} from "@api/modules/orders/receipt-pdf/render-receipt.js";

function receipt(overrides: Partial<RenderableReceipt> = {}): RenderableReceipt {
  return {
    number: 1,
    issued_at: new Date("2026-10-30T12:00:00.000Z"),
    is_copy: false,
    is_cancelled: false,
    payment_status: PaymentStatus.CAPTURED,
    snapshot: {
      version: 1,
      issuer: {
        legal_name: "Distribuidora Teste Ltda",
        trade_name: null,
        cnpj: "11222333000181",
        state_registration: null,
        phone: "1133334444",
        email: "contato@teste.test",
        address: {
          street: null,
          number: null,
          complement: null,
          neighborhood: null,
          city: null,
          state: null,
          zip_code: null,
        },
      },
      customer: {
        name: "Cliente Teste",
        document: null,
        phone: null,
        address: {
          street: "Rua A",
          number: "1",
          complement: null,
          neighborhood: "Centro",
          city: "São Paulo",
          state: "SP",
          zip_code: "01001000",
        },
        delivery_instructions: null,
      },
      order: {
        id: "7e1d7b55-3f52-4d10-aac3-74387c236901",
        short_id: "7E1D7B55",
        created_at: "2026-10-30T10:00:00.000Z",
        delivery_date: "2026-10-30T00:00:00.000Z",
        delivery_window: "MORNING",
        scheduled_time_label: null,
        driver_name: null,
      },
      items: [{ product_name: "Água 20L", quantity: 2, unit_price_cents: 1200, subtotal_cents: 2400 }],
      totals: { subtotal_cents: 2400, total_cents: 2400 },
      payment: { method: "pix", cash_change_for_cents: null },
      bottles: { full_ordered: 0, empty_provided: 0, sold: 0, loaned: 0 },
    },
    ...overrides,
  };
}

async function render(receipts: RenderableReceipt[], format: "a4" | "thermal"): Promise<Buffer> {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve) => output.on("end", () => resolve()));
  await renderReceiptsPdf(receipts, format, output, (id) => `https://app.test/orders/${id}`);
  await finished;
  return Buffer.concat(chunks);
}

/** Objetos de página no PDF (o dicionário /Type /Page não é comprimido). */
function pageCount(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;
}

function mediaBoxes(pdf: Buffer): number[][] {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((match) =>
    match[1]!.trim().split(/\s+/).map(Number)
  );
}

describe("renderReceiptsPdf", () => {
  it("gera PDF A4 valido com uma pagina por comprovante", async () => {
    const pdf = await render([receipt(), receipt({ number: 2, is_copy: true, is_cancelled: true })], "a4");

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(2);
    expect(mediaBoxes(pdf)[0]).toEqual([0, 0, 595.28, 841.89]);
  });

  it("bobina termica tem 80mm de largura e altura proporcional ao conteudo", async () => {
    const manyItems = Array.from({ length: 15 }, (_, index) => ({
      product_name: `Produto ${index}`,
      quantity: 1,
      unit_price_cents: 100,
      subtotal_cents: 100,
    }));
    const short = receipt();
    const long = receipt({ number: 2, snapshot: { ...short.snapshot, items: manyItems } });

    const pdf = await render([short, long], "thermal");
    const [shortBox, longBox] = mediaBoxes(pdf);

    expect(pageCount(pdf)).toBe(2);
    expect(shortBox![2]).toBeCloseTo(226.77, 1);
    expect(longBox![3]).toBeGreaterThan(shortBox![3]!);
  });

  it("comprovante com muitos itens quebra pagina no A4 sem erro", async () => {
    const manyItems = Array.from({ length: 80 }, (_, index) => ({
      product_name: `Produto ${index}`,
      quantity: 1,
      unit_price_cents: 100,
      subtotal_cents: 100,
    }));
    const base = receipt();
    const pdf = await render([receipt({ snapshot: { ...base.snapshot, items: manyItems } })], "a4");

    expect(pageCount(pdf)).toBeGreaterThan(1);
  });
});

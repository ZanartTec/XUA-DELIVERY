import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Writable } from "node:stream";
import type { ReceiptFormat } from "@xua/shared/schemas/order";
import type { ReceiptSnapshot } from "./receipt-snapshot.js";
import {
  formatAddressLine,
  formatCents,
  formatDateOnly,
  formatDateTime,
  formatDeliveryWindow,
  formatDocument,
  formatPaymentLine,
  formatReceiptNumber,
} from "./receipt-format.js";

/** O que o renderer precisa de cada comprovante (ver receiptService.loadForPrint). */
export type RenderableReceipt = {
  number: number;
  snapshot: ReceiptSnapshot;
  issued_at: Date;
  is_copy: boolean;
  is_cancelled: boolean;
  payment_status: string | null;
};

type FormatSpec = {
  width: number;
  /** null = altura calculada por comprovante (bobina térmica). */
  height: number | null;
  margin: number;
  size: { title: number; heading: number; base: number; small: number; total: number };
  gap: number;
  qrSize: number;
  /** Itens em tabela de 4 colunas (A4) ou em 2 linhas por item (bobina). */
  wideItems: boolean;
};

const MM = 72 / 25.4;

const SPECS: Record<ReceiptFormat, FormatSpec> = {
  a4: {
    width: 595.28,
    height: 841.89,
    margin: 42,
    size: { title: 14, heading: 9, base: 9.5, small: 8, total: 12 },
    gap: 2.5,
    qrSize: 72,
    wideItems: true,
  },
  thermal: {
    width: 80 * MM,
    height: null,
    margin: 4 * MM,
    size: { title: 10.5, heading: 8, base: 8, small: 7, total: 10 },
    gap: 1.5,
    qrSize: 78,
    wideItems: false,
  },
};

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

type TextOptions = { size?: number; bold?: boolean; align?: "left" | "center" | "right"; gap?: number };
type Column = { text: string; width: number; align?: "left" | "center" | "right"; bold?: boolean };

/**
 * Escreve o layout em coluna única, avançando `y`. Com `draw=false` só mede:
 * é assim que a bobina térmica descobre a altura exata da página antes de
 * desenhar (pdfkit exige o tamanho da página no addPage).
 */
class ReceiptWriter {
  y: number;

  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly spec: FormatSpec,
    private readonly draw: boolean
  ) {
    this.y = spec.margin;
  }

  private get x() {
    return this.spec.margin;
  }

  get contentWidth() {
    return this.spec.width - this.spec.margin * 2;
  }

  /** Quebra de página só existe no A4; na bobina a página já tem a altura certa. */
  private ensure(height: number) {
    if (!this.draw || this.spec.height == null) return;
    if (this.y + height > this.spec.height - this.spec.margin) {
      this.doc.addPage({ size: [this.spec.width, this.spec.height], margin: 0 });
      this.y = this.spec.margin;
    }
  }

  private setFont(size: number, bold?: boolean) {
    this.doc.font(bold ? FONT_BOLD : FONT).fontSize(size);
  }

  text(value: string, options: TextOptions = {}) {
    const size = options.size ?? this.spec.size.base;
    this.setFont(size, options.bold);
    const height = this.doc.heightOfString(value, { width: this.contentWidth });
    this.ensure(height);
    if (this.draw) {
      this.doc.text(value, this.x, this.y, { width: this.contentWidth, align: options.align ?? "left" });
    }
    this.y += height + (options.gap ?? this.spec.gap);
  }

  columns(columns: Column[], size = this.spec.size.base) {
    const widths = columns.map((column) => column.width * this.contentWidth);
    const heights = columns.map((column, index) => {
      this.setFont(size, column.bold);
      return this.doc.heightOfString(column.text || " ", { width: widths[index] });
    });
    const height = Math.max(...heights);
    this.ensure(height);
    if (this.draw) {
      let x = this.x;
      columns.forEach((column, index) => {
        this.setFont(size, column.bold);
        this.doc.text(column.text, x, this.y, { width: widths[index], align: column.align ?? "left" });
        x += widths[index]!;
      });
    }
    this.y += height + this.spec.gap;
  }

  divider(dashed = false) {
    const spacing = this.spec.gap * 2 + 2;
    this.ensure(spacing * 2);
    this.y += spacing;
    if (this.draw) {
      this.doc.save().lineWidth(0.6);
      if (dashed) this.doc.dash(2, { space: 2 });
      this.doc
        .moveTo(this.x, this.y)
        .lineTo(this.x + this.contentWidth, this.y)
        .stroke()
        .undash()
        .restore();
    }
    this.y += spacing;
  }

  space(points: number) {
    this.y += points;
  }

  /** Tarja com borda e texto centralizado (ex.: "DOCUMENTO SEM VALOR FISCAL"). */
  banner(value: string, size = this.spec.size.heading) {
    const padding = 4;
    this.setFont(size, true);
    const textHeight = this.doc.heightOfString(value, { width: this.contentWidth - padding * 2 });
    const height = textHeight + padding * 2;
    this.ensure(height);
    if (this.draw) {
      this.doc.save().lineWidth(1).rect(this.x, this.y, this.contentWidth, height).stroke().restore();
      this.doc.text(value, this.x + padding, this.y + padding, {
        width: this.contentWidth - padding * 2,
        align: "center",
      });
    }
    this.y += height + this.spec.gap * 2;
  }

  heading(value: string) {
    this.space(this.spec.gap);
    this.text(value.toUpperCase(), { size: this.spec.size.heading, bold: true });
  }

  signatureLine(label: string) {
    const lineWidth = this.contentWidth * 0.8;
    this.ensure(34);
    this.y += 24;
    if (this.draw) {
      const start = this.x + (this.contentWidth - lineWidth) / 2;
      this.doc.save().lineWidth(0.6).moveTo(start, this.y).lineTo(start + lineWidth, this.y).stroke().restore();
    }
    this.y += 3;
    this.text(label, { size: this.spec.size.small, align: "center" });
  }

  image(buffer: Buffer, size: number) {
    this.ensure(size);
    if (this.draw) {
      this.doc.image(buffer, this.x + (this.contentWidth - size) / 2, this.y, { width: size, height: size });
    }
    this.y += size + this.spec.gap;
  }
}

/** Layout único dos dois formatos; o que muda é a `FormatSpec`. */
function writeReceipt(writer: ReceiptWriter, spec: FormatSpec, receipt: RenderableReceipt, qr: Buffer) {
  const { snapshot } = receipt;
  const { issuer, customer, order, items, totals, payment, bottles } = snapshot;
  const { size } = spec;

  // ── Emitente ─────────────────────────────────────────────
  writer.text(issuer.trade_name || issuer.legal_name, { size: size.title, bold: true, align: "center" });
  if (issuer.trade_name && issuer.trade_name !== issuer.legal_name) {
    writer.text(issuer.legal_name, { align: "center" });
  }
  const fiscalIds = [`CNPJ ${formatDocument(issuer.cnpj)}`];
  if (issuer.state_registration) fiscalIds.push(`IE ${issuer.state_registration}`);
  writer.text(fiscalIds.join("   "), { size: size.small, align: "center" });
  const issuerAddress = formatAddressLine(issuer.address);
  if (issuerAddress) writer.text(issuerAddress, { size: size.small, align: "center" });
  writer.text(`Tel ${issuer.phone}  •  ${issuer.email}`, { size: size.small, align: "center" });

  writer.divider();

  // ── Identificação do documento ───────────────────────────
  writer.text("COMPROVANTE DE VENDA E ENTREGA", { size: size.title, bold: true, align: "center" });
  writer.text(`Nº ${formatReceiptNumber(receipt.number)}${receipt.is_copy ? "  —  2ª VIA" : ""}`, {
    size: size.total,
    bold: true,
    align: "center",
    gap: spec.gap * 2,
  });
  writer.banner("DOCUMENTO SEM VALOR FISCAL");
  if (receipt.is_cancelled) writer.banner("PEDIDO CANCELADO", size.total);
  writer.columns(
    [
      { text: `Emissão: ${formatDateTime(receipt.issued_at)}`, width: 0.6 },
      { text: `Pedido #${order.short_id}`, width: 0.4, align: "right" },
    ],
    size.small
  );

  // ── Cliente e entrega ────────────────────────────────────
  writer.heading("Cliente");
  writer.text(customer.name, { bold: true });
  const customerDocument = formatDocument(customer.document);
  const contact = [customerDocument ? `CPF/CNPJ ${customerDocument}` : null, customer.phone ? `Tel ${customer.phone}` : null]
    .filter(Boolean)
    .join("   ");
  if (contact) writer.text(contact);
  const customerAddress = formatAddressLine(customer.address);
  if (customerAddress) writer.text(customerAddress);
  if (customer.delivery_instructions) {
    writer.text(`Obs.: ${customer.delivery_instructions}`, { size: size.small });
  }

  writer.heading("Entrega");
  const when = [formatDateOnly(order.delivery_date), formatDeliveryWindow(order.delivery_window), order.scheduled_time_label]
    .filter(Boolean)
    .join(" — ");
  writer.text(when);
  if (order.driver_name) writer.text(`Entregador: ${order.driver_name}`);

  // ── Itens ────────────────────────────────────────────────
  writer.heading("Itens");
  if (spec.wideItems) {
    writer.columns(
      [
        { text: "Produto", width: 0.52, bold: true },
        { text: "Qtd", width: 0.1, align: "right", bold: true },
        { text: "Unitário", width: 0.19, align: "right", bold: true },
        { text: "Subtotal", width: 0.19, align: "right", bold: true },
      ],
      size.small
    );
    for (const item of items) {
      writer.columns([
        { text: item.product_name, width: 0.52 },
        { text: String(item.quantity), width: 0.1, align: "right" },
        { text: formatCents(item.unit_price_cents), width: 0.19, align: "right" },
        { text: formatCents(item.subtotal_cents), width: 0.19, align: "right" },
      ]);
    }
  } else {
    for (const item of items) {
      writer.text(item.product_name, { gap: 0.5 });
      writer.columns([
        { text: `${item.quantity} x ${formatCents(item.unit_price_cents)}`, width: 0.55 },
        { text: formatCents(item.subtotal_cents), width: 0.45, align: "right" },
      ]);
    }
  }

  writer.divider(true);
  if (totals.subtotal_cents !== totals.total_cents) {
    writer.columns([
      { text: "Subtotal", width: 0.6 },
      { text: formatCents(totals.subtotal_cents), width: 0.4, align: "right" },
    ]);
  }
  writer.columns(
    [
      { text: "TOTAL", width: 0.5, bold: true },
      { text: formatCents(totals.total_cents), width: 0.5, align: "right", bold: true },
    ],
    size.total
  );

  // ── Pagamento ────────────────────────────────────────────
  writer.heading("Pagamento");
  writer.text(formatPaymentLine(payment.method, receipt.payment_status, payment.cash_change_for_cents), {
    bold: true,
  });

  // ── Vasilhames ───────────────────────────────────────────
  if (bottles.full_ordered > 0 || bottles.sold > 0 || bottles.loaned > 0) {
    writer.heading("Vasilhames");
    writer.text(
      `Cheios entregues: ${bottles.full_ordered}   Vazios devolvidos: ${bottles.empty_provided}\n` +
        `Vendidos: ${bottles.sold}   Em comodato: ${bottles.loaned}`
    );
    if (bottles.loaned > 0) {
      writer.text("Vasilhames em comodato continuam sendo propriedade da distribuidora.", { size: size.small });
    }
  }

  // ── Recebimento ──────────────────────────────────────────
  writer.divider();
  writer.text("Recebi os produtos acima descritos.", { size: size.small, align: "center" });
  writer.signatureLine("Assinatura do cliente");
  writer.signatureLine("Nome legível / Documento");
  writer.space(spec.gap * 4);
  writer.text("Data: ____/____/________", { size: size.small, align: "center" });

  writer.space(spec.gap * 3);
  writer.image(qr, spec.qrSize);
  writer.text("Acompanhe seu pedido no app", { size: size.small, align: "center" });
  writer.divider(true);
  writer.text("Documento sem valor fiscal. Não substitui a nota fiscal.", { size: size.small, align: "center" });
}

/** Altura exata do comprovante na bobina (medição sem desenhar). */
function measureThermalHeight(spec: FormatSpec, receipt: RenderableReceipt, qr: Buffer): number {
  const scratch = new PDFDocument({ size: [spec.width, 14400], margin: 0 });
  const writer = new ReceiptWriter(scratch, spec, false);
  writeReceipt(writer, spec, receipt, qr);
  // Folga de corte da bobina.
  return Math.ceil(writer.y + spec.margin + 12);
}

/**
 * Renderiza um ou mais comprovantes num único PDF, escrevendo direto no
 * `output` (stream) sem montar o arquivo inteiro em memória. Cada comprovante
 * começa em página nova; na bobina, cada página tem a altura do comprovante.
 */
export async function renderReceiptsPdf(
  receipts: RenderableReceipt[],
  format: ReceiptFormat,
  output: Writable,
  orderUrl: (orderId: string) => string
): Promise<void> {
  const spec = SPECS[format];
  // QR é gerado antes (assíncrono) para o layout ficar síncrono.
  const qrCodes = await Promise.all(
    receipts.map((receipt) =>
      QRCode.toBuffer(orderUrl(receipt.snapshot.order.id), { margin: 0, width: 240, errorCorrectionLevel: "M" })
    )
  );

  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 0,
    info: { Title: "Comprovante de venda e entrega", Producer: "Xuá Delivery" },
  });
  doc.pipe(output);

  receipts.forEach((receipt, index) => {
    const qr = qrCodes[index]!;
    const height = spec.height ?? measureThermalHeight(spec, receipt, qr);
    doc.addPage({ size: [spec.width, height], margin: 0 });
    writeReceipt(new ReceiptWriter(doc, spec, true), spec, receipt, qr);
  });

  doc.end();
}

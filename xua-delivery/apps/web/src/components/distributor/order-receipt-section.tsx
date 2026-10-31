"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ReceiptPrintButton } from "@/src/components/shared/receipt-print-button";
import { ApiError, api } from "@/src/lib/api-client";
import { formatReceiptNumber, orderReceiptUrl } from "@/src/lib/receipt";
import { formatDate } from "@/src/lib/utils";
import { OrderStatus } from "@/src/types/enums";
import type { OrderDetail } from "@/src/types/order-detail";

/** Espelha RECEIPT_ISSUABLE_STATUSES da API: emissão manual só depois do aceite. */
const ISSUABLE_STATUSES = new Set<string>([
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.PICKING,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.DELIVERY_FAILED,
  OrderStatus.REDELIVERY_SCHEDULED,
]);

/**
 * Comprovante de venda e entrega (sem valor fiscal). Nasce sozinho no
 * despacho; antes disso a distribuidora pode gerar manualmente para imprimir.
 */
export function OrderReceiptSection({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const receipt = order.receipt ?? null;

  const issueMutation = useMutation({
    mutationFn: () => api.post(`/api/orders/${order.id}/receipt`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["distributor-order-detail", order.id] });
    },
  });

  if (!receipt && !ISSUABLE_STATUSES.has(order.status)) return null;

  return (
    <section className="rounded-lg border border-[#dfe5ef] bg-white p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
        <FileText className="h-3.5 w-3.5" />
        Comprovante de venda
      </p>

      {receipt ? (
        <>
          <p className="mt-1.5 text-sm font-semibold text-[#0d1b2f]">Nº {formatReceiptNumber(receipt.number)}</p>
          <p className="text-xs text-[#64748b]">
            Emitido em {formatDate(receipt.issued_at)}
            {receipt.print_count > 0 ? ` • impresso ${receipt.print_count}x (próximas saem como 2ª via)` : ""}
          </p>
          <ReceiptPrintButton className="mt-3" buildUrl={(format) => orderReceiptUrl(order.id, format)} />
        </>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-[#4b5565]">
            O comprovante é gerado automaticamente no despacho. Gere agora se quiser imprimir antes.
          </p>
          {issueMutation.error ? (
            <p className="mt-2 text-xs text-red-700">
              {issueMutation.error instanceof ApiError ? issueMutation.error.message : "Erro ao gerar comprovante"}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9 w-full rounded-md"
            disabled={issueMutation.isPending}
            onClick={() => issueMutation.mutate()}
          >
            {issueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Gerar comprovante
          </Button>
        </>
      )}

      <p className="mt-2 text-[10px] text-[#94a3b8]">Documento sem valor fiscal.</p>
    </section>
  );
}

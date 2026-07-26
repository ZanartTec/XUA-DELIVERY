"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Route, X } from "lucide-react";
import {
  OrderCustomerSection,
  OrderDeliveryStepsSection,
  OrderInstructionsSection,
  OrderItemsSection,
  OrderPaymentSection,
  OrderStatusHeader,
  OrderSubscriptionSection,
  OrderTimelineSection,
} from "@/src/components/distributor/order-detail-sections";
import { useOrderDetail } from "@/src/hooks/distributor/use-order-detail";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { ApiError, api } from "@/src/lib/api-client";
import { cn } from "@/src/lib/utils";
import { OrderStatus } from "@/src/types/enums";
import { getOperationalMessage } from "@/src/lib/order-detail-format";
import { useState } from "react";

const REJECT_REASON_OPTIONS = [
  { value: "out_of_stock", label: "Falta de estoque" },
  { value: "delivery_area_issue", label: "Endereço fora da operação" },
  { value: "operational_capacity", label: "Capacidade operacional esgotada" },
  { value: "other", label: "Outro motivo" },
] as const;

function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Erro desconhecido";
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-14 animate-pulse rounded-lg bg-[#eef0f3]" />
      <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-lg bg-[#eef0f3]" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-[#eef0f3]" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DistributorOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const detailQuery = useOrderDetail(id);
  const order = detailQuery.order;

  const [rejectReason, setRejectReason] = useState<(typeof REJECT_REASON_OPTIONS)[number]["value"] | "">("");
  const [rejectDetails, setRejectDetails] = useState("");

  const actionMutation = useMutation({
    mutationFn: ({ action, payload }: { action: string; payload?: Record<string, unknown> }) =>
      api.patch(`/api/orders/${id}/${action}`, payload ?? {}),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["distributor-order-detail", id] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-queue"] });
      if (variables.action === "accept") {
        router.push(`/distributor/orders/${id}/checklist`);
        return;
      }
      if (variables.action === "reject") {
        router.push("/distributor/queue");
      }
    },
  });

  if (detailQuery.isLoading) return <DetailSkeleton />;
  if (detailQuery.isError || !order) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {detailQuery.error ? getApiErrorMessage(detailQuery.error) : "Pedido não encontrado."}
      </div>
    );
  }

  const canAccept = order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
  const canReject = order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
  const canProceedToChecklist = order.status === OrderStatus.ACCEPTED_BY_DISTRIBUTOR;
  const rejectNeedsDetails = rejectReason === "other";
  const rejectReady = rejectReason !== "" && (!rejectNeedsDetails || rejectDetails.trim().length >= 10);
  const hasAnyAction = canAccept || canReject || canProceedToChecklist;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[#d8e0eb] bg-white px-3 py-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
        <button
          type="button"
          onClick={() => router.push("/distributor/queue")}
          className="inline-flex items-center gap-2 rounded-md bg-[#f3f4f5] px-3 py-1.5 text-sm font-medium text-[#425066] transition-colors hover:bg-[#e7eaef]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para fila
        </button>
        <p className="text-sm text-[#64748b]">Pedido da operação • consulta completa</p>
      </div>

      {actionMutation.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {getApiErrorMessage(actionMutation.error)}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[1fr_340px] xl:items-start">
        <div className="space-y-3">
          <OrderStatusHeader order={order} />
          <OrderInstructionsSection order={order} />
          <OrderCustomerSection order={order} />
          <OrderItemsSection order={order} />
          <OrderTimelineSection order={order} />
        </div>

        <div className="space-y-3 xl:sticky xl:top-3">
          {hasAnyAction ? (
            <section className="rounded-lg border border-[#dfe5ef] bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">Ações operacionais</p>
              <p className="mt-1.5 text-sm text-[#4b5565]">{getOperationalMessage(order.status)}</p>

              <div className="mt-3 space-y-2">
                {canAccept ? (
                  <Button
                    className="h-9 w-full rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={actionMutation.isPending}
                    onClick={() => actionMutation.mutate({ action: "accept" })}
                  >
                    <Check className="h-4 w-4" />
                    Aceitar e seguir para checklist
                  </Button>
                ) : null}

                {canProceedToChecklist ? (
                  <Button
                    className="h-9 w-full rounded-md bg-[#0d1b2f] text-white hover:bg-[#17253c]"
                    onClick={() => router.push(`/distributor/orders/${id}/checklist`)}
                  >
                    <Route className="h-4 w-4" />
                    Ir para checklist de despacho
                  </Button>
                ) : null}

                {canReject ? (
                  <div className="space-y-2 rounded-md bg-[#fafbfc] p-2.5">
                    <p className="text-xs font-semibold text-[#0d1b2f]">Se recusar, informe o motivo</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {REJECT_REASON_OPTIONS.map((option) => {
                        const active = rejectReason === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setRejectReason(option.value)}
                            className={cn(
                              "rounded-md border px-2 py-1.5 text-left text-xs transition-all",
                              active
                                ? "border-[#5697E9] bg-[#5697E9]/10 text-[#0b2a59]"
                                : "border-[#e1e3e4] bg-white text-[#334155] hover:border-[#bfd2ff]"
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    {rejectNeedsDetails ? (
                      <Textarea
                        placeholder="Descreva o motivo da recusa"
                        value={rejectDetails}
                        onChange={(event) => setRejectDetails(event.target.value)}
                        className="min-h-20 rounded-md border-[#d9dde3] bg-white text-sm"
                      />
                    ) : null}

                    <Button
                      variant="destructive"
                      className="h-9 w-full rounded-md"
                      disabled={actionMutation.isPending || !rejectReady}
                      onClick={() =>
                        actionMutation.mutate({
                          action: "reject",
                          payload: {
                            reason: rejectReason,
                            details: rejectNeedsDetails ? rejectDetails.trim() : undefined,
                          },
                        })
                      }
                    >
                      {actionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      Recusar pedido
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <OrderDeliveryStepsSection order={order} />
          <OrderSubscriptionSection order={order} />
          <OrderPaymentSection order={order} />
        </div>
      </div>
    </div>
  );
}

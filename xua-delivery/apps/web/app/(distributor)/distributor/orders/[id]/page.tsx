"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, PackageCheck } from "lucide-react";
import {
  OrderCustomerSection,
  OrderInstructionsSection,
  OrderItemsSection,
  OrderPaymentSection,
  OrderStatusHeader,
  OrderSubscriptionSection,
  OrderTimelineSection,
} from "@/src/components/distributor/order-detail-sections";
import { OrderReceiptSection } from "@/src/components/distributor/order-receipt-section";
import { RejectOrderDialog } from "@/src/components/distributor/reject-order-dialog";
import { useOrderDetail } from "@/src/hooks/distributor/use-order-detail";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { EmptyState } from "@/src/components/shared/empty-state";
import { ApiError, api } from "@/src/lib/api-client";
import { formatShortOrderId } from "@/src/lib/order-detail-format";
import { OrderStatus } from "@/src/types/enums";

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Erro desconhecido";
}

export default function DistributorOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { order, isLoading, isError, error } = useOrderDetail(id);
  const [rejectOpen, setRejectOpen] = useState(false);

  const action = useMutation({
    mutationFn: ({ name, payload }: { name: "accept" | "reject"; payload?: Record<string, unknown> }) =>
      api.patch(`/api/orders/${id}/${name}`, payload ?? {}),
    onSuccess: (_data, { name }) => {
      void queryClient.invalidateQueries({ queryKey: ["distributor-order-detail", id] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-queue"] });
      if (name === "accept") {
        toast.success("Pedido aceito. Agora é separar e despachar.");
        router.push(`/distributor/orders/${id}/checklist`);
      } else {
        toast.success("Pedido recusado. O cliente foi avisado.");
        router.push("/distributor/queue");
      }
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 px-4 pt-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader back="/distributor/queue" title="Pedido" />
        <EmptyState icon={AlertTriangle} title={error ? errorMessage(error) : "Pedido não encontrado"} />
      </div>
    );
  }

  const isNew = order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
  const toPrepare =
    order.status === OrderStatus.ACCEPTED_BY_DISTRIBUTOR ||
    order.status === OrderStatus.PICKING ||
    order.status === OrderStatus.READY_FOR_DISPATCH;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader back="/distributor/queue" eyebrow={`Pedido #${formatShortOrderId(order.id)}`} title={order.consumer_name} />

      <div className="px-4 pb-4">
        {action.error ? (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{errorMessage(action.error)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="space-y-3">
            <OrderStatusHeader order={order} />
            <OrderInstructionsSection order={order} />
            <OrderCustomerSection order={order} />
            <OrderItemsSection order={order} />
            <div className="hidden lg:block">
              <OrderTimelineSection order={order} />
            </div>
          </div>
          <div className="space-y-3 lg:sticky lg:top-(--app-header-h)">
            <OrderPaymentSection order={order} />
            <OrderSubscriptionSection order={order} />
            <OrderReceiptSection order={order} />
          </div>
          <div className="lg:hidden">
            <OrderTimelineSection order={order} />
          </div>
        </div>
      </div>

      {isNew || toPrepare ? (
        <StickyActionBar>
          {isNew ? (
            <>
              <Button variant="outline" size="xl" className="flex-[0_0_auto] px-5" disabled={action.isPending} onClick={() => setRejectOpen(true)}>
                Recusar
              </Button>
              <Button variant="cta" size="xl" disabled={action.isPending} onClick={() => action.mutate({ name: "accept" })}>
                {action.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                Aceitar pedido
              </Button>
            </>
          ) : (
            <Button asChild variant="cta" size="xl">
              <Link href={`/distributor/orders/${id}/checklist`}>
                <PackageCheck aria-hidden /> Separar e despachar
              </Link>
            </Button>
          )}
        </StickyActionBar>
      ) : null}

      <RejectOrderDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        orderLabel={`#${formatShortOrderId(order.id)}`}
        loading={action.isPending}
        onConfirm={(payload) => action.mutate({ name: "reject", payload })}
      />
    </div>
  );
}

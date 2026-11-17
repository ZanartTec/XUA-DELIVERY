"use client";

import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/src/components/ui/sheet";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  OrderCustomerSection,
  OrderInstructionsSection,
  OrderItemsSection,
  OrderPaymentSection,
  OrderStatusHeader,
  OrderSubscriptionSection,
  OrderTimelineSection,
} from "@/src/components/distributor/order-detail-sections";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { useOrderDetail } from "@/src/hooks/distributor/use-order-detail";
import { formatShortOrderId } from "@/src/lib/order-detail-format";

/** Painel lateral do pedido (desktop). No celular o pedido abre na tela completa. */
export function OrderSidePanel({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { order, isLoading } = useOrderDetail(orderId);
  return (
    <Sheet open={Boolean(orderId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] gap-0 overflow-y-auto bg-background p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-hairline bg-card p-4">
          <SheetTitle className="font-heading text-xl">{order ? order.consumer_name : "Pedido"}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            {order ? (
              <>
                <span className="font-mono">#{formatShortOrderId(order.id)}</span>
                <StatusBadge status={order.status} audience="ops" />
              </>
            ) : (
              "Carregando…"
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 p-4">
          {isLoading || !order ? (
            <>
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
            </>
          ) : (
            <>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href={`/distributor/orders/${order.id}`}>Abrir pedido completo</Link>
              </Button>
              <OrderStatusHeader order={order} />
              <OrderInstructionsSection order={order} />
              <OrderCustomerSection order={order} />
              <OrderItemsSection order={order} />
              <OrderPaymentSection order={order} />
              <OrderSubscriptionSection order={order} />
              <OrderTimelineSection order={order} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

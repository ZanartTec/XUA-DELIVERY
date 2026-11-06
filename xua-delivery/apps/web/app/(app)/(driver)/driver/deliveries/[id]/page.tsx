"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Banknote,
  CreditCard,
  Droplets,
  FileText,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Navigation,
  Phone,
  Recycle,
} from "lucide-react";
import { useOrderDetail } from "@/src/hooks/consumer/use-order-detail";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { EmptyState } from "@/src/components/shared/empty-state";
import { describeDoorCharge, mapsHref } from "@/src/lib/driver";
import { formatPhone, phoneHref, plural, whatsappHref } from "@/src/lib/format";
import { formatScheduledTime, formatShortOrderId } from "@/src/lib/order-detail-format";
import { openReceipt, orderReceiptUrl, readReceiptFormat } from "@/src/lib/receipt";
import { cn, formatCurrency } from "@/src/lib/utils";

/** Detalhe da parada: tudo que o motorista precisa antes de tocar a campainha. */
export default function DriverDeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { order, isLoading } = useOrderDetail(id);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader back="/driver/deliveries" title="Entrega" />
        <EmptyState icon={Droplets} title="Entrega não encontrada" />
      </div>
    );
  }

  const payment = order.payments[0];
  const charge = describeDoorCharge({
    total_cents: order.total_cents,
    payment_method: payment?.payment_method,
    payment_status: payment?.status,
    cash_change_for_cents: payment?.cash_change_for_cents,
  });
  const tel = phoneHref(order.consumer_phone);
  const chat = whatsappHref(order.consumer_phone);
  const address = order.address_line ?? "";
  const canDeliver = order.status === "OUT_FOR_DELIVERY";
  const bottles = order.max_bottle_charge_cents > 0 ? order.bottles_full_ordered : 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        back="/driver/deliveries"
        eyebrow={`Pedido #${formatShortOrderId(order.id)}`}
        title={order.consumer_name}
        description={`${formatScheduledTime(order)}`}
      />

      <div className="space-y-4 px-4 pb-4">
        <StatusBadge status={order.status} />

        {/* Endereço + navegação */}
        <section className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
          <p className="flex items-start gap-2 text-base font-medium text-foreground">
            <MapPin className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              {order.address_details
                ? `${order.address_details.street}, ${order.address_details.number}`
                : address}
              {order.address_details?.complement ? (
                <span className="block text-sm text-muted-foreground">{order.address_details.complement}</span>
              ) : null}
              {order.address_details ? (
                <span className="block text-sm text-muted-foreground">
                  {order.address_details.neighborhood} · {order.address_details.city}/{order.address_details.state}
                </span>
              ) : null}
            </span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button asChild variant="soft" size="xl" className="h-14 flex-col gap-0.5 px-1 text-xs">
              <a href={mapsHref(address)} target="_blank" rel="noreferrer">
                <Navigation /> Mapa
              </a>
            </Button>
            <Button asChild={Boolean(tel)} variant="soft" size="xl" className="h-14 flex-col gap-0.5 px-1 text-xs" disabled={!tel}>
              {tel ? (
                <a href={tel}>
                  <Phone /> Ligar
                </a>
              ) : (
                <span>
                  <Phone /> Ligar
                </span>
              )}
            </Button>
            <Button asChild={Boolean(chat)} variant="soft" size="xl" className="h-14 flex-col gap-0.5 px-1 text-xs" disabled={!chat}>
              {chat ? (
                <a href={chat} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              ) : (
                <span>
                  <MessageCircle /> WhatsApp
                </span>
              )}
            </Button>
          </div>
          {order.consumer_phone ? <p className="text-xs text-muted-foreground">Cliente: {formatPhone(order.consumer_phone)}</p> : null}
        </section>

        {order.delivery_instructions ? (
          <Alert className="border-primary/20 bg-secondary/60">
            <MessageSquareText className="text-primary" aria-hidden />
            <AlertTitle>Recado do cliente</AlertTitle>
            <AlertDescription className="text-foreground">{order.delivery_instructions}</AlertDescription>
          </Alert>
        ) : null}

        {/* Receber na porta */}
        <section
          className={cn(
            "flex items-start gap-3 rounded-2xl p-4",
            charge.due ? "bg-warning-surface text-warning-foreground" : "bg-success-surface text-success-foreground",
          )}
        >
          {charge.method === "card" ? <CreditCard className="mt-0.5 size-5 shrink-0" aria-hidden /> : <Banknote className="mt-0.5 size-5 shrink-0" aria-hidden />}
          <div>
            <p className="font-semibold">{charge.label}</p>
            {charge.detail ? <p className="text-sm">{charge.detail}</p> : null}
          </div>
        </section>

        {bottles > 0 ? (
          <section className="flex items-start gap-3 rounded-2xl bg-sky/10 p-4 text-sm">
            <Recycle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-semibold text-foreground">Recolher {plural(bottles, "vasilhame vazio", "vasilhames vazios")}</p>
              <p className="text-muted-foreground">
                Sem eles, cobre o vasilhame (até {formatCurrency(order.max_bottle_charge_cents)}) ou entregue só o que tiver troca.
              </p>
            </div>
          </section>
        ) : null}

        {/* Itens a levar */}
        <section className="rounded-2xl border border-hairline bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Levar ({plural(order.total_items_qty, "item", "itens")})</h2>
          <ul className="divide-y divide-hairline">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-foreground">{item.product_name}</span>
                <span className="font-heading text-lg font-bold text-ink tabular-nums">×{item.qty}</span>
              </li>
            ))}
          </ul>
        </section>

        <Button variant="outline" size="xl" className="w-full" onClick={() => openReceipt(orderReceiptUrl(order.id, readReceiptFormat("thermal")))}>
          <FileText /> Comprovante de venda
        </Button>
      </div>

      {canDeliver ? (
        <StickyActionBar>
          <Button asChild variant="outline" size="xl" className="flex-[0_0_auto] px-4">
            <Link href={`/driver/deliveries/${order.id}/failure`}>Não entreguei</Link>
          </Button>
          <Button asChild variant="cta" size="xl">
            <Link href={`/driver/deliveries/${order.id}/otp`}>Concluir entrega</Link>
          </Button>
        </StickyActionBar>
      ) : null}
    </div>
  );
}

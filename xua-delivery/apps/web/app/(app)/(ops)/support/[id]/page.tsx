"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Building2, CalendarClock, KeyRound, Loader2, MessageCircle, Phone, Truck } from "lucide-react";
import {
  OrderCustomerSection,
  OrderInstructionsSection,
  OrderItemsSection,
  OrderPaymentSection,
  OrderStatusHeader,
  OrderTimelineSection,
  SectionCard,
} from "@/src/components/distributor/order-detail-sections";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { ApiError, api } from "@/src/lib/api-client";
import { addDaysIso, todayIso } from "@/src/lib/datetime";
import { formatPhone, phoneHref, whatsappHref } from "@/src/lib/format";
import { formatShortOrderId } from "@/src/lib/order-detail-format";
import type { OrderDetail } from "@/src/types/order-detail";

function ContactRow({ icon: Icon, role, name, phone }: { icon: typeof Phone; role: string; name?: string | null; phone?: string | null }) {
  const tel = phoneHref(phone);
  const chat = whatsappHref(phone);
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{role}</p>
        <p className="truncate text-sm font-medium text-foreground">{name ?? "—"}</p>
        {phone ? <p className="text-xs text-muted-foreground">{formatPhone(phone)}</p> : null}
      </div>
      {tel ? (
        <Button asChild variant="soft" size="icon-touch" aria-label={`Ligar para ${role.toLowerCase()}`}>
          <a href={tel}>
            <Phone />
          </a>
        </Button>
      ) : null}
      {chat ? (
        <Button asChild variant="soft" size="icon-touch" aria-label={`WhatsApp de ${role.toLowerCase()}`}>
          <a href={chat} target="_blank" rel="noreferrer">
            <MessageCircle />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

export default function SupportOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["support-order", id],
    queryFn: async () => (await api.get<{ order: OrderDetail }>(`/api/orders/${id}?scope=support`)).order,
  });
  const order = query.data;
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState(addDaysIso(todayIso(), 1));
  const [saving, setSaving] = useState(false);

  async function reschedule() {
    setSaving(true);
    try {
      await api.patch(`/api/orders/${id}/schedule-redelivery`, { new_date: newDate });
      toast.success("Reentrega agendada");
      setRescheduleOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["support-order", id] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível reagendar");
    } finally {
      setSaving(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 px-4 pt-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  }
  if (!order) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader back="/support" title="Pedido" />
        <EmptyState icon={AlertTriangle} title={query.error instanceof ApiError ? query.error.message : "Pedido não encontrado"} />
      </div>
    );
  }

  const failed = order.status === "DELIVERY_FAILED";
  const inRoute = order.status === "OUT_FOR_DELIVERY";

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader back="/support" eyebrow={`Pedido #${formatShortOrderId(order.id)}`} title={order.consumer_name} />
      <div className="grid gap-3 px-4 pb-4 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-3">
          <OrderStatusHeader order={order} />
          {order.cancellation_reason ? (
            <section className="flex items-start gap-3 rounded-2xl bg-danger-surface p-4 text-destructive">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p className="text-sm">
                <span className="font-semibold">Motivo registrado: </span>
                {order.cancellation_reason}
              </p>
            </section>
          ) : null}
          <OrderInstructionsSection order={order} />
          <OrderCustomerSection order={order} />
          <OrderItemsSection order={order} />
        </div>
        <div className="space-y-3 lg:sticky lg:top-(--app-header-h)">
          <SectionCard title="Quem atende">
            <div className="divide-y divide-hairline">
              <ContactRow icon={Building2} role="Distribuidora" name={order.distributor_name} phone={order.distributor_phone} />
              <ContactRow icon={Truck} role="Motorista" name={order.driver_name ?? "Ainda não definido"} phone={order.driver_phone} />
            </div>
          </SectionCard>
          <OrderPaymentSection order={order} />
          <OrderTimelineSection order={order} />
        </div>
      </div>

      {failed || inRoute ? (
        <StickyActionBar>
          {failed ? (
            <Button variant="cta" size="xl" onClick={() => setRescheduleOpen(true)}>
              <CalendarClock aria-hidden /> Reagendar entrega
            </Button>
          ) : (
            <Button asChild variant="outline" size="xl">
              <Link href={`/ops/otp-override?order=${order.id}`}>
                <KeyRound aria-hidden /> Liberar entrega sem código
              </Link>
            </Button>
          )}
        </StickyActionBar>
      ) : null}

      <ResponsiveDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        title="Reagendar entrega"
        description="A distribuidora recebe o pedido de novo para a data escolhida."
        footer={
          <Button variant="cta" size="xl" disabled={!newDate || saving} onClick={reschedule}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Confirmar nova data
          </Button>
        }
      >
        <div className="grid gap-1.5">
          <Label htmlFor="new-date">Nova data</Label>
          <Input id="new-date" type="date" min={todayIso()} value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-11" />
        </div>
      </ResponsiveDialog>
    </div>
  );
}

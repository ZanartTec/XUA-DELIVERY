"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  CreditCard,
  Droplets,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Progress } from "@/src/components/ui/progress";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { PageHeader } from "@/src/components/shared/page-header";
import { EmptyState } from "@/src/components/shared/empty-state";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { EditDeliveryDateSheet } from "@/src/components/consumer/edit-delivery-date-sheet";
import { useHasActivePlans } from "@/src/hooks/consumer/use-subscription-plans";
import { isoDayToDate, todayIso } from "@/src/lib/datetime";
import type { StatusTone } from "@/src/lib/order-status";
import { cn } from "@/src/lib/utils";
import type {
  DeliveryDateStatus,
  OnlinePaymentMethod,
  UserSubscriptionStatus,
} from "@xua/shared/enums";
import { DEFAULT_ONLINE_PAYMENT_METHOD, isOnlinePaymentMethod } from "@xua/shared/mappers/payment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeliveryDate {
  id: string;
  delivery_date: string;
  status: DeliveryDateStatus;
  order_id: string | null;
}

interface UserSubscription {
  id: string;
  status: UserSubscriptionStatus;
  total_quantity: number;
  remaining_quantity: number;
  plan: { name: string; valid_until?: string | null; product: { name: string } };
  distributor: { id: string; name: string };
  address: {
    zone_id: string | null;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
  };
  delivery_dates: DeliveryDate[];
  payments?: Array<{
    id: string;
    status: string;
    amount_cents: number;
    payment_method: OnlinePaymentMethod | null;
    provider: string | null;
    external_id: string | null;
    created_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUBSCRIPTION_STATUS: Record<UserSubscriptionStatus, { label: string; tone: StatusTone }> = {
  PENDING_PAYMENT: { label: "Aguardando pagamento", tone: "warning" },
  ACTIVE: { label: "Ativa", tone: "success" },
  PAUSED: { label: "Pausada", tone: "neutral" },
  CANCELLED: { label: "Cancelada", tone: "danger" },
  COMPLETED: { label: "Concluída", tone: "info" },
};

const DELIVERY_STATUS: Record<DeliveryDateStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: "Agendada", tone: "info" },
  ORDER_CREATED: { label: "Em andamento", tone: "progress" },
  DELIVERED: { label: "Entregue", tone: "success" },
  FAILED: { label: "Falha", tone: "danger" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
};

function formatIsoDate(iso: string): string {
  return isoDayToDate(iso).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

/** Entrega editável: assinatura ACTIVE/PAUSED, data PENDING, sem pedido e estritamente futura (fuso de SP). */
function canEditDelivery(dd: DeliveryDate, status: UserSubscriptionStatus): boolean {
  if (status !== "ACTIVE" && status !== "PAUSED") return false;
  if (dd.status !== "PENDING" || dd.order_id) return false;
  return dd.delivery_date.slice(0, 10) > todayIso();
}

function isValidRedirectUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeSubscriptionsPayload(data: unknown): UserSubscription[] {
  if (Array.isArray(data)) return data as UserSubscription[];
  if (data && typeof data === "object" && "subscriptions" in data) {
    const { subscriptions } = data as { subscriptions?: unknown };
    if (Array.isArray(subscriptions)) return subscriptions as UserSubscription[];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SubscriptionManagePage() {
  const { hasPlans } = useHasActivePlans();
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{
    subId: string;
    deliveryDateId: string;
    currentDate: string;
    zoneId: string;
    distributorId: string;
    maxDate?: string | null;
  } | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const loadSubscriptions = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await fetch("/api/user-subscriptions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar assinaturas");
      setSubscriptions(normalizeSubscriptionsPayload(data));
    } catch {
      setSubscriptions([]);
      toast.error("Erro ao carregar assinaturas");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  async function doAction(id: string, action: "pause" | "resume") {
    const prevStatus: UserSubscriptionStatus = action === "pause" ? "PAUSED" : "ACTIVE";
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: prevStatus } : s))
    );
    try {
      const res = await fetch(`/api/user-subscriptions/${id}/${action}`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Erro ao atualizar assinatura");
      void loadSubscriptions(false);
    }
  }

  async function resumePayment(id: string) {
    setPayingId(id);
    try {
      const subscription = subscriptions.find((item) => item.id === id);
      const storedPaymentMethod = subscription?.payments?.[0]?.payment_method;
      const paymentMethod = isOnlinePaymentMethod(storedPaymentMethod)
        ? storedPaymentMethod
        : DEFAULT_ONLINE_PAYMENT_METHOD;
      const res = await fetch(`/api/user-subscriptions/${id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method: paymentMethod }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro ao retomar pagamento");

      if (data.subscription && typeof data.subscription === "object") {
        setSubscriptions((prev) =>
          prev.map((sub) => (sub.id === id ? (data.subscription as UserSubscription) : sub))
        );
      }

      const redirectUrl = typeof data.redirectUrl === "string" ? data.redirectUrl : null;
      if (redirectUrl) {
        if (!isValidRedirectUrl(redirectUrl)) throw new Error("URL de pagamento inválida");
        toast.success("Redirecionando para o pagamento...");
        window.location.href = redirectUrl;
        return;
      }

      toast.success("Pagamento confirmado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao retomar pagamento");
    } finally {
      setPayingId(null);
    }
  }

  function openEdit(sub: UserSubscription, deliveryDateId: string, currentDate: string) {
    if (!sub.address.zone_id) {
      toast.error("Endereço sem zona de entrega vinculada");
      return;
    }
    setEditTarget({
      subId: sub.id,
      deliveryDateId,
      currentDate,
      zoneId: sub.address.zone_id,
      distributorId: sub.distributor.id,
      maxDate: sub.plan.valid_until ?? null,
    });
  }

  async function handleEditConfirm(input: { date: string; time_slot_id: string }) {
    if (!editTarget) return;
    setEditSubmitting(true);
    try {
      const res = await fetch(
        `/api/user-subscriptions/${editTarget.subId}/delivery-dates/${editTarget.deliveryDateId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro ao alterar a data");
      toast.success("Data de entrega atualizada");
      setEditTarget(null);
      await loadSubscriptions(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar a data");
    } finally {
      setEditSubmitting(false);
    }
  }

  // Pausada continua "em vigor" (pode ser retomada); só canceladas/concluídas vão ao histórico.
  const current = subscriptions.filter((s) => s.status !== "CANCELLED" && s.status !== "COMPLETED");
  const others = subscriptions.filter((s) => s.status === "CANCELLED" || s.status === "COMPLETED");

  const cardProps = (sub: UserSubscription) => ({
    sub,
    expanded: expandedId === sub.id,
    onToggleExpand: () => setExpandedId((id) => (id === sub.id ? null : sub.id)),
    onAction: doAction,
    onResumePayment: resumePayment,
    onEditDate: (deliveryDateId: string, currentDate: string) => openEdit(sub, deliveryDateId, currentDate),
    paying: payingId === sub.id,
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Assinaturas" description="Água no dia certo, sem precisar pedir." />

      <div className="space-y-6 px-4 pb-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : subscriptions.length === 0 ? (
          hasPlans ? (
            <EmptyState
              icon={Repeat}
              title="Você ainda não tem assinatura"
              description="Escolha um plano e receba água automaticamente nas datas que preferir."
            />
          ) : (
            // Sem plano disponível o fluxo de assinatura não tem saída (O-03): oferece o pedido avulso.
            <EmptyState
              icon={Repeat}
              title="Assinaturas em breve"
              description="Ainda não há planos de assinatura disponíveis. Enquanto isso, você pode fazer um pedido avulso."
              action={
                <Button asChild variant="cta" size="xl">
                  <Link href="/catalog">
                    <ShoppingBag /> Fazer pedido
                  </Link>
                </Button>
              }
            />
          )
        ) : null}

        {current.length > 0 ? (
          <section aria-labelledby="sec-vigor" className="space-y-3">
            <h2 id="sec-vigor" className="text-sm font-semibold text-foreground">
              Em vigor
            </h2>
            {current.map((sub) => (
              <SubscriptionCard key={sub.id} {...cardProps(sub)} />
            ))}
          </section>
        ) : null}

        {others.length > 0 ? (
          <section aria-labelledby="sec-hist" className="space-y-3">
            <h2 id="sec-hist" className="text-sm font-semibold text-foreground">
              Histórico
            </h2>
            {others.map((sub) => (
              <SubscriptionCard key={sub.id} {...cardProps(sub)} />
            ))}
          </section>
        ) : null}
      </div>

      {!loading && hasPlans ? (
        <StickyActionBar>
          <Button asChild variant="cta" size="xl">
            <Link href="/subscription/create">
              <Plus /> {subscriptions.length ? "Nova assinatura" : "Criar assinatura"}
            </Link>
          </Button>
        </StickyActionBar>
      ) : null}

      {editTarget ? (
        <EditDeliveryDateSheet
          open={!!editTarget}
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditTarget(null);
          }}
          zoneId={editTarget.zoneId}
          distributorId={editTarget.distributorId}
          currentDate={editTarget.currentDate}
          maxDate={editTarget.maxDate}
          submitting={editSubmitting}
          onConfirm={handleEditConfirm}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubscriptionCard
// ---------------------------------------------------------------------------

function SubscriptionCard({
  sub,
  expanded,
  onToggleExpand,
  onAction,
  onResumePayment,
  onEditDate,
  paying,
}: {
  sub: UserSubscription;
  expanded: boolean;
  onToggleExpand: () => void;
  onAction: (id: string, action: "pause" | "resume") => void;
  onResumePayment: (id: string) => void;
  onEditDate: (deliveryDateId: string, currentDate: string) => void;
  paying: boolean;
}) {
  const delivered = sub.total_quantity - sub.remaining_quantity;
  const progress = sub.total_quantity > 0 ? Math.round((delivered / sub.total_quantity) * 100) : 0;
  const isActive = sub.status === "ACTIVE";
  const isPaused = sub.status === "PAUSED";
  const isPending = sub.status === "PENDING_PAYMENT";
  const isTerminal = sub.status === "CANCELLED" || sub.status === "COMPLETED";
  const status = SUBSCRIPTION_STATUS[sub.status] ?? { label: sub.status, tone: "neutral" as const };
  const panelId = `sub-${sub.id}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-card">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10">
          <Droplets className="size-5 text-primary" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 space-y-2">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">{sub.plan.name}</span>
            <StatusBadge label={status.label} tone={status.tone} />
          </span>
          <span className="block text-xs text-muted-foreground">
            #{shortId(sub.id)} · {sub.plan.product.name}
          </span>
          <span className="block space-y-1">
            <span className="flex justify-between text-xs text-muted-foreground">
              <span>
                {delivered} de {sub.total_quantity} entregas
              </span>
              <span>{progress}%</span>
            </span>
            <Progress value={progress} className="h-1.5" aria-label="Entregas realizadas" />
          </span>
        </span>
        <ChevronDown
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div id={panelId} className="space-y-4 border-t border-hairline px-4 pt-3 pb-4">
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Truck className="size-4 shrink-0" aria-hidden />
              {sub.distributor.name}
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {sub.address.street}, {sub.address.number}
                {sub.address.complement ? ` — ${sub.address.complement}` : ""}, {sub.address.neighborhood}
              </span>
            </p>
          </div>

          {isPending ? (
            <Alert className="border-warning/30 bg-warning-surface">
              <CreditCard className="text-warning-foreground" aria-hidden />
              <AlertDescription className="text-warning-foreground">
                Pagamento pendente para ativar esta assinatura.
              </AlertDescription>
            </Alert>
          ) : null}

          {sub.delivery_dates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Datas de entrega</p>
              <ul className="divide-y divide-hairline rounded-xl border border-hairline">
                {[...sub.delivery_dates]
                  .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
                  .map((dd) => {
                    const ds = DELIVERY_STATUS[dd.status] ?? { label: dd.status, tone: "neutral" as const };
                    return (
                      <li key={dd.id} className="flex min-h-12 items-center justify-between gap-2 px-3 py-2">
                        <span className="flex items-center gap-2 text-sm text-foreground capitalize">
                          <CalendarDays className="size-4 text-primary" aria-hidden />
                          {formatIsoDate(dd.delivery_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <StatusBadge label={ds.label} tone={ds.tone} className="h-5 px-2 text-[11px]" />
                          {canEditDelivery(dd, sub.status) ? (
                            <Button
                              variant="ghost"
                              size="icon-touch"
                              aria-label={`Alterar a entrega de ${formatIsoDate(dd.delivery_date)}`}
                              onClick={() => onEditDate(dd.id, dd.delivery_date)}
                            >
                              <Pencil />
                            </Button>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}

          {!isTerminal ? (
            <div className="flex gap-2 [&>*]:flex-1">
              {isPending ? (
                <Button variant="cta" size="xl" disabled={paying} onClick={() => onResumePayment(sub.id)}>
                  <CreditCard /> {paying ? "Abrindo…" : "Retomar pagamento"}
                </Button>
              ) : null}
              {isActive ? (
                <Button variant="outline" size="xl" onClick={() => onAction(sub.id, "pause")}>
                  <Pause /> Pausar
                </Button>
              ) : null}
              {isPaused ? (
                <Button variant="cta" size="xl" onClick={() => onAction(sub.id, "resume")}>
                  <Play /> Retomar
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

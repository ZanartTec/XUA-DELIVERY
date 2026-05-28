"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Repeat,
  Plus,
  Pause,
  Play,
  XCircle,
  Droplets,
  CalendarDays,
  ChevronRight,
  CreditCard,
  MapPin,
  Truck,
  Loader2,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import type {
  DeliveryDateStatus,
  OnlinePaymentMethod,
  UserSubscriptionStatus,
} from "@xua/shared/enums";

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
  plan: { name: string; product: { name: string } };
  distributor: { name: string };
  address: {
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

function statusLabel(s: UserSubscriptionStatus): string {
  const map: Record<UserSubscriptionStatus, string> = {
    PENDING_PAYMENT: "Aguardando pagamento",
    ACTIVE: "Ativa",
    PAUSED: "Pausada",
    CANCELLED: "Cancelada",
    COMPLETED: "Concluída",
  };
  return map[s] ?? s;
}

function statusBadgeClass(s: UserSubscriptionStatus): string {
  const map: Record<UserSubscriptionStatus, string> = {
    PENDING_PAYMENT: "bg-blue-50 text-blue-700",
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PAUSED: "bg-amber-50 text-amber-700",
    CANCELLED: "bg-red-50 text-red-700",
    COMPLETED: "bg-gray-100 text-gray-600",
  };
  return map[s] ?? "bg-gray-100 text-gray-600";
}

function deliveryDateStatusLabel(s: DeliveryDateStatus): string {
  const map: Record<DeliveryDateStatus, string> = {
    PENDING: "Agendada",
    DELIVERED: "Entregue",
    CANCELLED: "Cancelada",
  };
  return map[s] ?? s;
}

function deliveryDateStatusClass(s: DeliveryDateStatus): string {
  const map: Record<DeliveryDateStatus, string> = {
    PENDING: "bg-blue-50 text-blue-700",
    DELIVERED: "bg-emerald-50 text-emerald-700",
    CANCELLED: "bg-gray-100 text-gray-500",
  };
  return map[s] ?? "bg-gray-100 text-gray-500";
}

function formatIsoDate(iso: string): string {
  const datePart = iso.slice(0, 10); // "YYYY-MM-DD"
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
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
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

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

  async function doAction(
    id: string,
    action: "pause" | "resume" | "cancel"
  ) {
    const prevStatus: UserSubscriptionStatus =
      action === "pause"
        ? "PAUSED"
        : action === "resume"
        ? "ACTIVE"
        : "CANCELLED";
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
      const paymentMethod = subscription?.payments?.[0]?.payment_method === "credit"
        ? "credit"
        : "pix";
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

  const active = subscriptions.filter(
    (s) => s.status === "ACTIVE" || s.status === "PENDING_PAYMENT"
  );
  const others = subscriptions.filter(
    (s) => s.status !== "ACTIVE" && s.status !== "PENDING_PAYMENT"
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <div className="px-4 pt-6 pb-28 max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
              Recorrência
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#191c1d] font-heading">
              Assinaturas
            </h1>
          </div>
          <Link href="/subscription/create">
            <Button size="sm" className="rounded-xl gap-1.5">
              <Plus className="h-4 w-4" />
              Nova
            </Button>
          </Link>
        </div>

        {/* Empty state */}
        {subscriptions.length === 0 && (
          <div className="flex flex-col items-center text-center py-16 bg-white rounded-2xl border border-[#d9dde3]">
            <Repeat className="h-12 w-12 text-primary/30 mb-4" />
            <h2 className="font-bold text-[#191c1d] mb-1">
              Sem assinaturas
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Crie sua primeira assinatura e receba água pura sem precisar
              pedir.
            </p>
            <Link href="/subscription/create">
              <Button className="rounded-xl gap-1.5">
                <Plus className="h-4 w-4" />
                Criar assinatura
              </Button>
            </Link>
          </div>
        )}

        {/* Active / pending */}
        {active.length > 0 && (
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">
              Ativas
            </p>
            <div className="space-y-3">
              {active.map((sub) => (
                <SubscriptionCard
                  key={sub.id}
                  sub={sub}
                  expanded={expandedId === sub.id}
                  onToggleExpand={() =>
                    setExpandedId((id) => (id === sub.id ? null : sub.id))
                  }
                  onAction={doAction}
                  onResumePayment={resumePayment}
                  paying={payingId === sub.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* Others */}
        {others.length > 0 && (
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">
              Histórico
            </p>
            <div className="space-y-3">
              {others.map((sub) => (
                <SubscriptionCard
                  key={sub.id}
                  sub={sub}
                  expanded={expandedId === sub.id}
                  onToggleExpand={() =>
                    setExpandedId((id) => (id === sub.id ? null : sub.id))
                  }
                  onAction={doAction}
                  onResumePayment={resumePayment}
                  paying={payingId === sub.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>
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
  paying,
}: {
  sub: UserSubscription;
  expanded: boolean;
  onToggleExpand: () => void;
  onAction: (id: string, action: "pause" | "resume" | "cancel") => void;
  onResumePayment: (id: string) => void;
  paying: boolean;
}) {
  const progress =
    sub.total_quantity > 0
      ? Math.round(
          ((sub.total_quantity - sub.remaining_quantity) / sub.total_quantity) *
            100
        )
      : 0;

  const isActive = sub.status === "ACTIVE";
  const isPaused = sub.status === "PAUSED";
  const isPending = sub.status === "PENDING_PAYMENT";
  const isTerminal =
    sub.status === "CANCELLED" || sub.status === "COMPLETED";

  return (
    <div className="bg-white rounded-2xl border border-[#d9dde3] overflow-hidden">
      {/* Card header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-start justify-between p-4 text-left"
      >
        <div className="flex items-start gap-3 flex-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8eef8]">
            <Droplets className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-[#191c1d] text-sm">
                {sub.plan.name}
              </p>
              <span
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  statusBadgeClass(sub.status)
                )}
              >
                {statusLabel(sub.status)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              #{shortId(sub.id)} · {sub.plan.product.name}
            </p>

            {/* Progress bar */}
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>
                  {sub.total_quantity - sub.remaining_quantity}/
                  {sub.total_quantity} entregas
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#e8eef8]">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform",
            expanded && "rotate-90"
          )}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#d9dde3] px-4 pb-4 pt-3 space-y-4">
          {/* Meta */}
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Truck className="h-3.5 w-3.5 shrink-0" />
              <span>{sub.distributor.name}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>
                {sub.address.street}, {sub.address.number}
                {sub.address.complement ? ` — ${sub.address.complement}` : ""},{" "}
                {sub.address.neighborhood}
              </span>
            </div>
          </div>

          {isPending && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Pagamento pendente para ativar esta assinatura.</span>
            </div>
          )}

          {/* Delivery dates */}
          {sub.delivery_dates.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Datas de entrega
              </p>
              <div className="space-y-1.5">
                {[...sub.delivery_dates]
                  .sort((a, b) =>
                    a.delivery_date.localeCompare(b.delivery_date)
                  )
                  .map((dd) => (
                    <div
                      key={dd.id}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1.5 text-sm text-[#191c1d]">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        {formatIsoDate(dd.delivery_date)}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          deliveryDateStatusClass(dd.status)
                        )}
                      >
                        {deliveryDateStatusLabel(dd.status)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {!isTerminal && (
            <div className="flex gap-2 pt-1">
              {isPending && (
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => onResumePayment(sub.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#00E0FF] text-[#001735] text-sm font-semibold active:scale-[0.97] transition-all disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
                >
                  {paying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CreditCard className="h-3.5 w-3.5" />
                  )}
                  Retomar pagamento
                </button>
              )}
              {isActive && (
                <button
                  type="button"
                  onClick={() => onAction(sub.id, "pause")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#f3f4f5] text-[#4a5e87] text-sm font-semibold hover:bg-[#e8e9ea] active:scale-[0.97] transition-all"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pausar
                </button>
              )}
              {isPaused && (
                <button
                  type="button"
                  onClick={() => onAction(sub.id, "resume")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#00E0FF] text-[#001735] text-sm font-semibold active:scale-[0.97] transition-all"
                >
                  <Play className="h-3.5 w-3.5" />
                  Retomar
                </button>
              )}
              {(isActive || isPaused || isPending) && (
                <button
                  type="button"
                  onClick={() => onAction(sub.id, "cancel")}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-red-500 text-sm font-semibold hover:bg-red-50 active:scale-[0.97] transition-all"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

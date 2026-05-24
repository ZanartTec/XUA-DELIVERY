/* --------------------------------------------------------------------------
   REPLACED: wizard de assinatura por planos predefinidos (v2)
   -------------------------------------------------------------------------- */
"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn, formatCurrency } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CalendarDays,
  Truck,
  Droplets,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/src/store/auth";
import { useSubscriptionStore } from "@/src/store/subscription";
import { DeliveryDateCalendar } from "@/src/components/consumer/delivery-date-calendar";
import { DeliveryAddressCard } from "@/src/components/consumer/delivery-address-card";
import {
  TimeSlotOptions,
  type DeliveryTimeSlot,
} from "@/src/components/consumer/time-slot-picker";
import { useAvailableDeliveryDates } from "@/src/hooks/use-available-delivery-dates";
import { PaymentMethodSelector } from "@/src/components/consumer/payment-method-selector";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import type { Address } from "@/src/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  discount_percentage: number;
  unit_price_with_discount_cents: number;
  valid_from: string;
  valid_until: string | null;
  product: { id: string; name: string; image_url: string | null };
  distributors: {
    distributor_id: string;
    distributor: { id: string; name: string };
  }[];
}

function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

const DEFAULT_AVAILABILITY_DAYS = 30;
const MAX_AVAILABILITY_DAYS = 180;

function getAvailabilityDays(validUntil?: string | null): number {
  if (!validUntil) return DEFAULT_AVAILABILITY_DAYS;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const until = new Date(validUntil.slice(0, 10) + "T00:00:00");
  const diff = Math.ceil((until.getTime() - today.getTime()) / 86400000) + 1;
  return Math.max(1, Math.min(MAX_AVAILABILITY_DAYS, diff));
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Step indicators
// ---------------------------------------------------------------------------

const STEPS = ["Plano", "Distribuidor", "Endereço", "Datas", "Pagamento"];

function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 pb-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === current
              ? "w-6 bg-primary"
              : i < current
              ? "w-3 bg-primary/40"
              : "w-3 bg-[#d9dde3]"
          )}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard page
// ---------------------------------------------------------------------------

export default function SubscriptionCreatePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const {
    selectedPlanId,
    selectedDistributorId,
    selectedAddressId,
    selectedDates,
    timeSlotsByDate,
    quantitiesByDate,
    paymentMethod,
    setPlan,
    setDistributor,
    setAddress,
    toggleDate,
    setDates,
    setTimeSlotForDate,
    setQuantityForDate,
    setPaymentMethod,
    reset,
  } = useSubscriptionStore();

  const [step, setStep] = useState(0);

  // Data
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [timeSlots, setTimeSlots] = useState<DeliveryTimeSlot[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);

  // UI
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [addressLoading, setAddressLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  const planDistributors = useMemo(
    () => selectedPlan?.distributors ?? [],
    [selectedPlan]
  );

  const zoneId = selectedAddress?.zone_id ?? null;
  const availabilityDays = useMemo(
    () => getAvailabilityDays(selectedPlan?.valid_until),
    [selectedPlan?.valid_until],
  );
  const {
    availableDates,
    loading: availableDatesLoading,
    error: availableDatesError,
  } = useAvailableDeliveryDates({
    zoneId,
    distributorId: selectedDistributorId,
    days: availabilityDays,
    enabled: Boolean(zoneId && selectedDistributorId && selectedPlan),
  });

  const availableDateByIso = useMemo(() => {
    if (!availableDates) return new Map<string, NonNullable<typeof availableDates>[number]>();
    return new Map(availableDates.map((date) => [date.date, date]));
  }, [availableDates]);

  const getAvailableTimeSlotsForDate = useCallback(
    (date: string) => {
      const availability = availableDateByIso.get(date);
      if (!availability) return [];
      return timeSlots.filter((slot) => {
        const slotWindow = slot.window.toLowerCase();
        if (slotWindow === "morning") return availability.morning_available;
        if (slotWindow === "afternoon") return availability.afternoon_available;
        return availability.morning_available || availability.afternoon_available;
      });
    },
    [availableDateByIso, timeSlots],
  );

  const allDatesHaveSlot = useMemo(() => {
    if (selectedDates.length === 0) return false;
    return selectedDates.every((date) => {
      const selectedSlot = timeSlotsByDate[date];
      if (!selectedSlot) return false;
      return getAvailableTimeSlotsForDate(date).some((slot) => slot.id === selectedSlot);
    });
  }, [getAvailableTimeSlotsForDate, selectedDates, timeSlotsByDate]);

  const totalAssigned = useMemo(
    () => selectedDates.reduce((sum, d) => sum + (quantitiesByDate[d] ?? 1), 0),
    [selectedDates, quantitiesByDate]
  );

  const totalCents = useMemo(
    () =>
      selectedPlan
        ? selectedPlan.unit_price_with_discount_cents * selectedPlan.quantity
        : 0,
    [selectedPlan]
  );

  // ---------------------------------------------------------------------------
  // Load plans
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetch("/api/subscription-plans?activeOnly=true")
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
      .catch(() => toast.error("Erro ao carregar planos"))
      .finally(() => setLoadingPlans(false));
  }, []);

  const loadDefaultAddress = useCallback(async () => {
    if (!user?.id) {
      setAddressLoading(false);
      return;
    }

    setAddressLoading(true);
    try {
      const res = await fetch(`/api/consumers/${user.id}/addresses`);
      const data = await res.json();
      const list: Address[] = data.addresses ?? [];
      const fromStore = selectedAddressId
        ? list.find((address) => address.id === selectedAddressId)
        : null;
      const address = fromStore ?? list.find((item) => item.is_default) ?? list[0] ?? null;

      setSelectedAddress(address);
      if (address && address.id !== selectedAddressId) setAddress(address.id);
    } catch {
      toast.error("Erro ao carregar endereço");
    } finally {
      setAddressLoading(false);
    }
  }, [selectedAddressId, setAddress, user?.id]);

  useEffect(() => {
    void loadDefaultAddress();
  }, [loadDefaultAddress]);

  useEffect(() => {
    if ((paymentMethod as string) === "cash") setPaymentMethod("pix");
  }, [paymentMethod, setPaymentMethod]);

  // ---------------------------------------------------------------------------
  // Load time slots when address + distributor are set
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedDistributorId) {
      setTimeSlots([]);
      return;
    }
    setLoadingSlots(true);
    fetch(`/api/distributors/${selectedDistributorId}/public-schedule`)
      .then((r) => r.json())
      .then((d) => {
        const slots: DeliveryTimeSlot[] = d.time_slots ?? [];
        setTimeSlots(slots);
      })
      .catch(() => toast.error("Erro ao carregar horários"))
      .finally(() => setLoadingSlots(false));
  }, [selectedDistributorId]);

  useEffect(() => {
    if (!availableDates) return;
    const validDates = new Set(
      availableDates
        .filter((date) => date.morning_available || date.afternoon_available)
        .map((date) => date.date),
    );
    const nextDates = selectedDates.filter((date) => validDates.has(date));
    if (nextDates.length !== selectedDates.length) setDates(nextDates);
  }, [availableDates, selectedDates, setDates]);

  useEffect(() => {
    selectedDates.forEach((date) => {
      const slotsForDate = getAvailableTimeSlotsForDate(date);
      if (slotsForDate.length === 1 && timeSlotsByDate[date] !== slotsForDate[0].id) {
        setTimeSlotForDate(date, slotsForDate[0].id);
      }
    });
  }, [getAvailableTimeSlotsForDate, selectedDates, setTimeSlotForDate, timeSlotsByDate]);

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------
  async function handleSubmit() {
    const assignedTotal = selectedDates.reduce((sum, d) => sum + (quantitiesByDate[d] ?? 1), 0);
    if (
      !selectedPlanId ||
      !selectedDistributorId ||
      !selectedAddressId ||
      assignedTotal !== selectedPlan?.quantity ||
      !allDatesHaveSlot
    ) {
      toast.error("Preencha todas as etapas antes de confirmar");
      return;
    }

    const subscriptionPaymentMethod = paymentMethod === "credit" ? "credit" : "pix";
    setSubmitting(true);
    try {
      const delivery_dates = selectedDates.map((date) => ({
        date,
        time_slot_id: timeSlotsByDate[date],
        quantity: quantitiesByDate[date] ?? 1,
      }));
      const res = await fetch("/api/user-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: selectedPlanId,
          distributor_id: selectedDistributorId,
          address_id: selectedAddressId,
          delivery_dates,
          payment_method: subscriptionPaymentMethod,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Erro ao criar assinatura");
      }

      const redirectUrl = typeof data.redirectUrl === "string" ? data.redirectUrl : null;
      if (redirectUrl && !isValidRedirectUrl(redirectUrl)) {
        throw new Error("URL de pagamento inválida");
      }

      reset();
      toast.success(redirectUrl ? "Redirecionando para o pagamento..." : "Assinatura criada com sucesso!");
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      router.push("/subscription/manage");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar assinatura");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  function canAdvance(): boolean {
    if (step === 0) return !!selectedPlanId;
    if (step === 1) return !!selectedDistributorId;
    if (step === 2) return !!selectedAddressId;
    if (step === 3)
      return totalAssigned === (selectedPlan?.quantity ?? 0) && allDatesHaveSlot;
    return true;
  }

  function advance() {
    if (canAdvance()) setStep((s) => s + 1);
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderHeader() {
    return (
      <div className="sticky top-0 z-10 bg-[#f4f6f8] pb-2 pt-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => (step > 0 ? back() : router.back())}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 text-[#191c1d]" />
          </button>
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {STEPS[step]}
            </p>
            <h1 className="font-heading font-bold text-xl text-[#191c1d] leading-tight">
              {stepTitle()}
            </h1>
          </div>
        </div>
        <StepIndicator current={step} total={STEPS.length} />
      </div>
    );
  }

  function stepTitle(): string {
    const titles = [
      "Escolha um plano",
      "Selecione o distribuidor",
      "Endereço de entrega",
      "Escolha as datas",
      "Forma de pagamento",
    ];
    return titles[step];
  }

  // ---------------------------------------------------------------------------
  // Step 0 — Plan selection
  // ---------------------------------------------------------------------------
  function renderPlanStep() {
    if (loadingPlans) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }
    if (plans.length === 0) {
      return (
        <p className="text-center text-sm text-muted-foreground py-16">
          Nenhum plano disponível no momento.
        </p>
      );
    }
    return (
      <div className="space-y-3">
        {plans.map((plan) => {
          const selected = selectedPlanId === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setPlan(plan.id)}
              className={cn(
                "relative w-full rounded-2xl border p-4 text-left transition-all active:scale-[0.98]",
                selected
                  ? "border-2 border-primary bg-white shadow-[0_2px_12px_rgba(27,74,154,0.1)]"
                  : "border border-[#d9dde3] bg-white hover:border-primary/40"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-bold text-[#191c1d]">{plan.name}</p>
                    {plan.discount_percentage > 0 && (
                      <Badge className="bg-[#00E0FF] text-[#001735] text-[10px] font-bold">
                        {plan.discount_percentage}% OFF
                      </Badge>
                    )}
                  </div>
                  {plan.description && (
                    <p className="text-xs text-muted-foreground mb-2">
                      {plan.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Droplets className="h-3 w-3 text-primary" />
                      {plan.product.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3 text-primary" />
                      {plan.quantity}× {plan.product.name}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">por unidade</p>
                  <p className="font-bold text-primary text-lg">
                    {formatCurrency(plan.unit_price_with_discount_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total: {formatCurrency(plan.unit_price_with_discount_cents * plan.quantity)}
                  </p>
                </div>
              </div>
              {selected && (
                <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Distributor selection
  // ---------------------------------------------------------------------------
  function renderDistributorStep() {
    if (planDistributors.length === 0) {
      return (
        <p className="text-center text-sm text-muted-foreground py-16">
          Nenhum distribuidor vinculado a este plano.
        </p>
      );
    }
    return (
      <div className="space-y-3">
        {planDistributors.map(({ distributor_id, distributor }) => {
          const selected = selectedDistributorId === distributor_id;
          return (
            <button
              key={distributor_id}
              type="button"
              onClick={() => setDistributor(distributor_id)}
              className={cn(
                "relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all active:scale-[0.98]",
                selected
                  ? "border-2 border-primary bg-white shadow-[0_2px_12px_rgba(27,74,154,0.1)]"
                  : "border border-[#d9dde3] bg-white hover:border-primary/40"
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8eef8]">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <p className="flex-1 font-semibold text-[#191c1d]">
                {distributor.name}
              </p>
              {selected && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Address selection
  // ---------------------------------------------------------------------------
  function renderAddressStep() {
    return (
      <div className="space-y-4">
        <DeliveryAddressCard
          address={selectedAddress}
          loading={addressLoading}
          label="Endereço de entrega"
          emptyTitle="Selecionar ou adicionar endereço"
          onClick={() => setAddressSheetOpen(true)}
        />

        <AddressSheet
          open={addressSheetOpen}
          onOpenChange={setAddressSheetOpen}
          selectedAddressId={selectedAddressId}
          onSelect={(addr) => {
            setAddress(addr.id);
            setSelectedAddress(addr);
            setAddressSheetOpen(false);
          }}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3 — Calendar + time slots
  // ---------------------------------------------------------------------------
  function renderCalendarStep() {
    if (!selectedPlan) return null;
    if (!zoneId) {
      return (
        <p className="text-center text-sm text-muted-foreground py-16">
          Selecione um endereço válido antes de escolher as datas.
        </p>
      );
    }
    const remaining = selectedPlan.quantity - totalAssigned;
    const progressPct = Math.min(100, (totalAssigned / selectedPlan.quantity) * 100);

    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground text-center">
          Distribua{" "}
          <strong className="text-foreground">
            {selectedPlan.quantity}× {selectedPlan.product.name}
          </strong>{" "}
          entre as datas de entrega.
        </p>

        {/* Progress indicator */}
        <div className="rounded-2xl bg-white border border-[#d9dde3] p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Produtos distribuídos</span>
            <span
              className={cn(
                "font-semibold",
                totalAssigned === selectedPlan.quantity
                  ? "text-green-600"
                  : remaining > 0
                  ? "text-primary"
                  : "text-destructive"
              )}
            >
              {totalAssigned} / {selectedPlan.quantity}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[#e8eef8] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                totalAssigned === selectedPlan.quantity
                  ? "bg-green-500"
                  : totalAssigned > selectedPlan.quantity
                  ? "bg-destructive"
                  : "bg-primary"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {remaining > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Faltam <strong>{remaining}</strong> produto{remaining !== 1 ? "s" : ""} para alocar.
            </p>
          )}
          {totalAssigned > selectedPlan.quantity && (
            <p className="text-[11px] text-destructive">
              Excedeu em {totalAssigned - selectedPlan.quantity} produto{totalAssigned - selectedPlan.quantity !== 1 ? "s" : ""}.
            </p>
          )}
        </div>

        <DeliveryDateCalendar
          selectedDates={selectedDates}
          maxDates={selectedPlan.quantity}
          fromDate={selectedPlan.valid_from}
          toDate={selectedPlan.valid_until ?? undefined}
          availableDates={availableDates}
          loading={availableDatesLoading}
          error={availableDatesError}
          onToggleDate={toggleDate}
        />

        {selectedDates.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Detalhes por data
            </p>
            {loadingSlots ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : timeSlots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                Nenhum horário disponível para este distribuidor.
              </p>
            ) : (
              [...selectedDates]
                .sort()
                .map((date) => {
                  const slotsForDate = getAvailableTimeSlotsForDate(date);
                  const selectedSlotId = slotsForDate.some(
                    (slot) => slot.id === timeSlotsByDate[date],
                  )
                    ? timeSlotsByDate[date]
                    : null;

                  return (
                    <div
                      key={date}
                      className="rounded-xl border border-[#d9dde3] bg-white p-3 space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                        <p className="flex-1 text-sm font-medium text-[#191c1d]">
                          {formatIsoDate(date)}
                        </p>
                      </div>

                      <TimeSlotOptions
                        slots={slotsForDate}
                        selectedSlotId={selectedSlotId}
                        label="Horário desta entrega"
                        emptyMessage="Nenhum horário disponível para esta data."
                        onSelectSlot={(slotId) => setTimeSlotForDate(date, slotId)}
                      />

                      <div className="flex items-center gap-2 pl-7">
                        <span className="text-xs text-muted-foreground shrink-0">
                          Qtd. nesta entrega:
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={selectedPlan.quantity}
                          value={quantitiesByDate[date] ?? 1}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setQuantityForDate(date, val);
                          }}
                          className="w-16 rounded-lg border border-[#d9dde3] bg-white px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span className="text-xs text-muted-foreground">
                          {selectedPlan.product.name}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 4 — Payment
  // ---------------------------------------------------------------------------
  function renderPaymentStep() {
    return (
      <div className="space-y-5">
        {selectedPlan && (
          <div className="rounded-2xl bg-white border border-[#d9dde3] p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Resumo
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-medium text-[#191c1d]">{selectedPlan.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Produtos</span>
              <span className="font-medium text-[#191c1d]">
                {selectedPlan.quantity}× {selectedPlan.product.name}
              </span>
            </div>
            {selectedAddress && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Endereço</span>
                <span className="font-medium text-[#191c1d] truncate max-w-[180px] text-right">
                  {selectedAddress.street}, {selectedAddress.number}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-[#d9dde3] pt-2 mt-2">
              <span className="font-semibold text-[#191c1d]">Total</span>
              <span className="font-bold text-primary text-base">
                {formatCurrency(totalCents)}
              </span>
            </div>
          </div>
        )}

        <PaymentMethodSelector
          value={paymentMethod}
          onChange={(method) => {
            if (method !== "cash") setPaymentMethod(method);
          }}
          disabledMethods={["cash"]}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <div className="mx-auto max-w-lg px-4">
        {renderHeader()}
        <div className="pb-48 pt-2">
          {step === 0 && renderPlanStep()}
          {step === 1 && renderDistributorStep()}
          {step === 2 && renderAddressStep()}
          {step === 3 && renderCalendarStep()}
          {step === 4 && renderPaymentStep()}
        </div>
      </div>

      {/* Bottom CTA — sits above the app nav bar (~56px) */}
      <div className="fixed bottom-14 left-0 right-0 z-30 border-t border-[#e1e3e4] bg-white px-4 py-3">
        <div className="mx-auto max-w-lg">
          {step < 4 ? (
            <Button
              className="w-full rounded-2xl h-12 text-base font-bold gap-2"
              disabled={!canAdvance()}
              onClick={advance}
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              className="w-full rounded-2xl h-12 text-base font-bold gap-2"
              disabled={submitting || !canAdvance()}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando…
                </>
              ) : (
                <>
                  Confirmar e Pagar
                  <Check className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

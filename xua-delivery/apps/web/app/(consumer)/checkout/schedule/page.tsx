"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, CloudSun, Sun } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { PageHeader } from "@/src/components/shared/page-header";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import { CheckoutProgress } from "@/src/components/consumer/checkout-progress";
import { DeliveryAddressCard } from "@/src/components/consumer/delivery-address-card";
import { DistributorSelector } from "@/src/components/consumer/distributor-selector";
import { TimeSlotPicker } from "@/src/components/consumer/time-slot-picker";
import { useCartStore } from "@/src/store/cart";
import { useCheckoutStore } from "@/src/store/checkout";
import { useIsClient } from "@/src/hooks/use-is-client";
import { useSelectedAddress } from "@/src/hooks/consumer/use-addresses";
import { useAvailableDeliveryDates } from "@/src/hooks/use-available-delivery-dates";
import { isoDayToDate, todayIso, addDaysIso } from "@/src/lib/datetime";
import { cn, formatCurrency } from "@/src/lib/utils";
import type { DeliveryWindowInput } from "@xua/shared/enums";

type TimeWindow = DeliveryWindowInput;

const WINDOWS: { value: TimeWindow; label: string; hours: string; icon: typeof Sun }[] = [
  { value: "morning", label: "Manhã", hours: "08h às 12h", icon: Sun },
  { value: "afternoon", label: "Tarde", hours: "13h às 18h", icon: CloudSun },
];

const DAYS_AHEAD = 14;

function dayParts(iso: string) {
  const d = isoDayToDate(iso);
  const fmt = (opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("pt-BR", { ...opts, timeZone: "UTC" });
  return {
    weekday: fmt({ weekday: "short" }).replace(".", ""),
    day: fmt({ day: "numeric" }),
    month: fmt({ month: "short" }).replace(".", ""),
    long: fmt({ weekday: "long", day: "numeric", month: "long" }),
  };
}

export default function CheckoutDeliveryPage() {
  const router = useRouter();
  const isClient = useIsClient();

  const items = useCartStore((s) => s.items);
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);
  const setCartDistributorId = useCartStore((s) => s.setSelectedDistributorId);

  const selectedDate = useCheckoutStore((s) => s.selectedDate);
  const selectedWindow = useCheckoutStore((s) => s.selectedWindow);
  const selectedSlotId = useCheckoutStore((s) => s.selectedSlotId);
  const selectedDistributorId = useCheckoutStore((s) => s.selectedDistributorId);
  const instructions = useCheckoutStore((s) => s.instructions);
  const setSelectedDate = useCheckoutStore((s) => s.setSelectedDate);
  const setSelectedWindow = useCheckoutStore((s) => s.setSelectedWindow);
  const setSelectedSlotId = useCheckoutStore((s) => s.setSelectedSlotId);
  const setSelectedDistributorId = useCheckoutStore((s) => s.setSelectedDistributorId);
  const setInstructions = useCheckoutStore((s) => s.setInstructions);

  const { address, isLoading: addressLoading } = useSelectedAddress();
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const zoneId = address?.zone_id ?? null;

  // Carrinho vazio não tem o que agendar.
  useEffect(() => {
    if (isClient && items.length === 0) router.replace("/cart");
  }, [isClient, items.length, router]);

  // Trocou o endereço (aqui ou no header): a distribuidora precisa ser revista.
  const lastAddressId = useRef<string | null>(null);
  useEffect(() => {
    if (!address) return;
    if (lastAddressId.current && lastAddressId.current !== address.id) {
      setSelectedDistributorId(null);
      setCartDistributorId(null);
    }
    lastAddressId.current = address.id;
  }, [address, setSelectedDistributorId, setCartDistributorId]);

  function chooseDistributor(id: string | null) {
    setSelectedDistributorId(id);
    setCartDistributorId(id);
  }

  const { availableDates, loading: datesLoading, error: datesError } = useAvailableDeliveryDates({
    zoneId,
    distributorId: selectedDistributorId,
    days: DAYS_AHEAD,
    enabled: Boolean(selectedDistributorId),
  });

  const hasTimeSlots = availableDates?.[0]?.has_time_slots === true;
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);

  const days = useMemo(
    () =>
      (availableDates ?? []).map((d) => ({
        iso: d.date,
        morning: d.morning_available,
        afternoon: d.afternoon_available,
        any: d.morning_available || d.afternoon_available,
      })),
    [availableDates],
  );

  // Data inválida/ausente → primeira data disponível.
  useEffect(() => {
    if (days.length === 0) return;
    const current = days.find((d) => d.iso === selectedDate);
    if (!current || !current.any) {
      const first = days.find((d) => d.any);
      if (first) setSelectedDate(first.iso);
    }
  }, [days, selectedDate, setSelectedDate]);

  const selectedDay = days.find((d) => d.iso === selectedDate);

  // Janela que deixou de existir no dia escolhido é limpa.
  useEffect(() => {
    if (!selectedDay || !selectedWindow || hasTimeSlots) return;
    if (selectedWindow === "morning" && !selectedDay.morning) setSelectedWindow(null);
    if (selectedWindow === "afternoon" && !selectedDay.afternoon) setSelectedWindow(null);
  }, [selectedDay, selectedWindow, setSelectedWindow, hasTimeSlots]);

  // Com horários configurados, trocar o dia exige escolher o horário de novo.
  const lastDate = useRef(selectedDate);
  useEffect(() => {
    if (hasTimeSlots && lastDate.current !== selectedDate) {
      setSelectedSlotId(null);
      setSelectedWindow(null);
    }
    lastDate.current = selectedDate;
  }, [selectedDate, hasTimeSlots, setSelectedSlotId, setSelectedWindow]);

  // Sem horários configurados nunca pode sobrar slot de um checkout anterior
  // (violaria a FK de time_slot_id ao criar o pedido).
  useEffect(() => {
    if (availableDates && !hasTimeSlots && selectedSlotId) setSelectedSlotId(null);
  }, [availableDates, hasTimeSlots, selectedSlotId, setSelectedSlotId]);

  const totalCents = isClient ? getSubtotalCents() : 0;
  const ready =
    Boolean(address && selectedDistributorId && selectedDate && selectedWindow) && (!hasTimeSlots || Boolean(selectedSlotId));

  const summary =
    selectedDay && selectedWindow
      ? `${dayParts(selectedDay.iso).long} · ${WINDOWS.find((w) => w.value === selectedWindow)?.label ?? ""}`
      : "Escolha o dia e o período";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader back="/cart" title="Entrega" description="Onde, quem entrega e quando.">
        <CheckoutProgress current={0} />
      </PageHeader>

      <div className="space-y-6 px-4 pt-2">
        <section aria-labelledby="sec-onde" className="space-y-2">
          <h2 id="sec-onde" className="text-sm font-semibold text-foreground">
            Onde
          </h2>
          <DeliveryAddressCard address={address} loading={addressLoading} onClick={() => setAddressSheetOpen(true)} />
        </section>

        {address ? (
          <section aria-labelledby="sec-quem" className="space-y-2">
            <h2 id="sec-quem" className="text-sm font-semibold text-foreground">
              Quem entrega
            </h2>
            {zoneId ? (
              <DistributorSelector zoneId={zoneId} selectedId={selectedDistributorId} onSelect={chooseDistributor} />
            ) : (
              <Alert className="border-warning/30 bg-warning-surface">
                <AlertDescription className="text-warning-foreground">
                  Este endereço ainda não está numa área de entrega. Escolha outro endereço.
                </AlertDescription>
              </Alert>
            )}
          </section>
        ) : null}

        {selectedDistributorId ? (
          <section aria-labelledby="sec-quando" className="space-y-3">
            <h2 id="sec-quando" className="text-sm font-semibold text-foreground">
              Quando
            </h2>

            {datesError ? (
              <Alert variant="destructive">
                <AlertDescription>Não foi possível carregar as datas. Tente novamente.</AlertDescription>
              </Alert>
            ) : (
              <div
                role="radiogroup"
                aria-label="Dia da entrega"
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
              >
                {datesLoading
                  ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-16 shrink-0 rounded-2xl" />)
                  : days.map((d) => {
                      const parts = dayParts(d.iso);
                      const top = d.iso === today ? "Hoje" : d.iso === tomorrow ? "Amanhã" : parts.weekday;
                      const selected = d.iso === selectedDate;
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={`${parts.long}${d.any ? "" : " (sem entrega)"}`}
                          disabled={!d.any}
                          onClick={() => setSelectedDate(d.iso)}
                          className={cn(
                            "flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition-colors",
                            selected
                              ? "border-cta bg-cta text-cta-foreground"
                              : "border-hairline bg-card text-foreground hover:border-primary/40",
                            !d.any && "cursor-not-allowed border-transparent bg-surface-low text-muted-foreground opacity-50",
                          )}
                        >
                          <span className="text-[11px] font-semibold capitalize">{top}</span>
                          <span className="text-xl leading-tight font-bold">{parts.day}</span>
                          <span className="text-[11px] capitalize opacity-80">{parts.month}</span>
                        </button>
                      );
                    })}
              </div>
            )}

            {hasTimeSlots && zoneId && selectedDate ? (
              <TimeSlotPicker
                zoneId={zoneId}
                date={selectedDate}
                distributorId={selectedDistributorId}
                selectedSlotId={selectedSlotId}
                onSelectSlot={(_, slot) => {
                  setSelectedSlotId(slot.id);
                  setSelectedWindow(slot.window.toLowerCase() as TimeWindow);
                }}
              />
            ) : (
              <RadioGroup
                value={selectedWindow ?? ""}
                onValueChange={(v) => setSelectedWindow(v as TimeWindow)}
                aria-label="Período"
                className="grid-cols-2"
              >
                {WINDOWS.map((w) => {
                  const available = selectedDay ? (w.value === "morning" ? selectedDay.morning : selectedDay.afternoon) : false;
                  const checked = selectedWindow === w.value;
                  const Icon = w.icon;
                  return (
                    <Label
                      key={w.value}
                      htmlFor={`win-${w.value}`}
                      className={cn(
                        "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 font-normal transition-colors",
                        checked ? "border-primary ring-1 ring-primary" : "border-hairline hover:border-primary/40",
                        !available && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Icon className={cn("size-5 shrink-0", checked ? "text-primary" : "text-muted-foreground")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{w.label}</span>
                        <span className="block text-xs text-muted-foreground">{available ? w.hours : "Indisponível"}</span>
                      </span>
                      <RadioGroupItem id={`win-${w.value}`} value={w.value} disabled={!available} aria-label={w.label} />
                    </Label>
                  );
                })}
              </RadioGroup>
            )}
          </section>
        ) : null}

        {selectedDistributorId ? (
          <section className="space-y-2">
            <Label htmlFor="instructions" className="text-sm font-semibold text-foreground">
              Instruções para o entregador <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ex.: deixar na portaria, interfone 12…"
              rows={3}
              maxLength={280}
              className="resize-none rounded-xl text-base md:text-sm"
            />
          </section>
        ) : null}
      </div>

      <StickyActionBar
        summary={
          <span className="flex items-center justify-between gap-2">
            <span className="truncate first-letter:uppercase">{summary}</span>
            <span className="shrink-0 font-semibold text-foreground tabular-nums">{isClient ? formatCurrency(totalCents) : "—"}</span>
          </span>
        }
      >
        <Button variant="cta" size="xl" disabled={!ready} onClick={() => router.push("/checkout/payment")}>
          Ir para pagamento
          <ChevronRight />
        </Button>
      </StickyActionBar>

      <AddressSheet open={addressSheetOpen} onOpenChange={setAddressSheetOpen} />
    </div>
  );
}

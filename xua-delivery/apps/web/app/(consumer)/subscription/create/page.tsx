"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/src/lib/utils";
import {
  Droplets,
  Clock,
  Minus,
  Plus,
  ArrowRight,
  ArrowLeft,
  Check,
  CalendarDays,
  Loader2,
  Truck,
} from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Seg", full: "Segunda" },
  { value: 2, label: "Ter", full: "Terça" },
  { value: 3, label: "Qua", full: "Quarta" },
  { value: 4, label: "Qui", full: "Quinta" },
  { value: 5, label: "Sex", full: "Sexta" },
  { value: 6, label: "Sáb", full: "Sábado" },
  { value: 0, label: "Dom", full: "Domingo" },
];

type Product = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
};

type Distributor = {
  id: string;
  name: string;
};

type TimeSlot = {
  id: string;
  label: string;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatSlot(slot: TimeSlot): string {
  return `${pad(slot.start_hour)}:${pad(slot.start_minute)} às ${pad(slot.end_hour)}:${pad(slot.end_minute)}`;
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STEP_TITLES = ["Produto", "Distribuidora", "Dias da semana", "Horário", "Quantidade"];
const TOTAL_STEPS = 5;

export default function SubscriptionCreatePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedDistributorId, setSelectedDistributorId] = useState<string | null>(null);
  const [selectedDistributorName, setSelectedDistributorName] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const [addressId, setAddressId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);

  const [productsLoading, setProductsLoading] = useState(true);
  const [distributorsLoading, setDistributorsLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [productsRes, meRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/auth/me"),
        ]);
        if (!productsRes.ok || !meRes.ok) throw new Error("fetch");
        const [productsData, me] = await Promise.all([
          productsRes.json(),
          meRes.json(),
        ]);
        if (cancelled) return;
        setProducts(productsData.products ?? productsData ?? []);

        const userId = me.sub ?? me.id;
        if (userId) {
          const addrRes = await fetch(`/api/consumers/${userId}/addresses`);
          if (!addrRes.ok) return;
          const addrs = await addrRes.json();
          if (cancelled) return;
          const addr = (addrs as any[]).find((a) => a.is_default) ?? addrs[0];
          if (addr) {
            setAddressId(addr.id);
            setZoneId(addr.zone_id ?? null);
            if (!addr.zone_id) {
              setZoneError(
                "Seu endereço ainda não está vinculado a uma zona de entrega. Fale com o suporte."
              );
            }
          }
        }
      } catch {
        // non-blocking
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (step !== 1 || !zoneId) return;
    let cancelled = false;
    setDistributorsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/distributors?zone_id=${zoneId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setDistributors(data ?? []);
      } catch {
        if (!cancelled) setDistributors([]);
      } finally {
        if (!cancelled) setDistributorsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, zoneId]);

  useEffect(() => {
    if (step !== 2 || !selectedDistributorId) return;
    let cancelled = false;
    setScheduleLoading(true);
    setSelectedDays([]);
    setSelectedTimeSlotId(null);
    (async () => {
      try {
        const res = await fetch(`/api/distributors/${selectedDistributorId}/public-schedule`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setActiveWeekdays(data.active_weekdays ?? []);
          setTimeSlots(data.time_slots ?? []);
        }
      } catch {
        if (!cancelled) { setActiveWeekdays([]); setTimeSlots([]); }
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, selectedDistributorId]);

  const canAdvance =
    step === 0 ? !!selectedProduct :
    step === 1 ? !!selectedDistributorId :
    step === 2 ? selectedDays.length > 0 :
    step === 3 ? !!selectedTimeSlotId :
    qty >= 1;

  function next() {
    if (step < TOTAL_STEPS - 1) { setError(null); setStep(step + 1); }
  }

  function back() {
    if (step > 0) { setError(null); setStep(step - 1); }
  }

  function toggleDay(value: number) {
    setSelectedDays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  }

  async function handleCreate() {
    if (!selectedProduct || !selectedDistributorId || selectedDays.length === 0 || !selectedTimeSlotId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qty_20l: qty,
          weekdays: selectedDays,
          time_slot_id: selectedTimeSlotId,
          product_id: selectedProduct.id,
          address_id: addressId,
          zone_id: zoneId,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao criar assinatura");
        return;
      }
      router.push("/subscription/manage");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  const selectedSlot = timeSlots.find((s) => s.id === selectedTimeSlotId);
  const sortedSelectedDays = [...selectedDays].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.indexOf(a) - order.indexOf(b);
  });
  const selectedDaysLabel = sortedSelectedDays
    .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="pb-6 min-h-[calc(100dvh-80px)] flex flex-col">
      <section className="px-6 pt-6 pb-4">
        <button
          onClick={() => (step > 0 ? back() : router.back())}
          className="flex items-center gap-1 text-sm font-semibold text-[#4a5e87] mb-4 hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688]">
          Nova assinatura
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#191c1d] font-heading mt-1">
          {STEP_TITLES[step]}
        </h1>
        <div className="flex items-center gap-2 mt-4">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-8 bg-[#C8F708]" : i < step ? "w-4 bg-[#C8F708]" : "w-4 bg-[#e1e3e4]"
              )}
            />
          ))}
        </div>
      </section>

      <section className="flex-1 px-6">
        {/* STEP 0 — Product */}
        {step === 0 && (
          <div className="space-y-2.5">
            {productsLoading && (
              <div className="flex items-center justify-center py-10 text-[#737688]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Carregando produtos...
              </div>
            )}
            {!productsLoading && products.length === 0 && (
              <div className="bg-amber-50 rounded-3xl p-5 text-sm text-amber-800">
                Nenhum produto disponível no momento.
              </div>
            )}
            {!productsLoading &&
              products.map((product) => {
                const sel = selectedProduct?.id === product.id;
                return (
                  <button
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className={cn(
                      "w-full rounded-3xl p-5 flex items-center gap-4 transition-all text-left",
                      sel ? "bg-white ring-2 ring-primary" : "bg-[#f3f4f5] hover:bg-[#edeef0]"
                    )}
                  >
                    <div
                      className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors",
                        sel ? "bg-primary/20 text-primary" : "bg-white text-[#4a5e87]"
                      )}
                    >
                      <Droplets className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#191c1d] font-heading truncate">{product.name}</p>
                      {product.description && (
                        <p className="text-xs text-[#737688] truncate">{product.description}</p>
                      )}
                      <p className="text-sm font-semibold text-primary mt-0.5">
                        {formatPrice(product.price_cents)}/entrega
                      </p>
                    </div>
                    {sel && (
                      <div className="w-7 h-7 rounded-full bg-[#C8F708] flex items-center justify-center flex-shrink-0">
                        <Check className="h-4 w-4 text-[#1a2600]" />
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
        )}

        {/* STEP 1 — Distributor */}
        {step === 1 && (
          <div className="space-y-2.5">
            {zoneError && (
              <div className="bg-amber-50 rounded-3xl p-5 text-sm text-amber-800">
                {zoneError}
              </div>
            )}
            {!zoneError && distributorsLoading && (
              <div className="flex items-center justify-center py-10 text-[#737688]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Buscando distribuidoras...
              </div>
            )}
            {!zoneError && !distributorsLoading && distributors.length === 0 && (
              <div className="bg-amber-50 rounded-3xl p-5 text-sm text-amber-800">
                Nenhuma distribuidora disponível para o seu endereço.
              </div>
            )}
            {!zoneError &&
              !distributorsLoading &&
              distributors.map((dist) => {
                const sel = selectedDistributorId === dist.id;
                return (
                  <button
                    key={dist.id}
                    onClick={() => {
                      setSelectedDistributorId(dist.id);
                      setSelectedDistributorName(dist.name);
                    }}
                    className={cn(
                      "w-full rounded-3xl p-5 flex items-center gap-4 transition-all text-left",
                      sel ? "bg-white ring-2 ring-primary" : "bg-[#f3f4f5] hover:bg-[#edeef0]"
                    )}
                  >
                    <div
                      className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors",
                        sel ? "bg-primary/20 text-primary" : "bg-white text-[#4a5e87]"
                      )}
                    >
                      <Truck className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#191c1d] font-heading truncate">{dist.name}</p>
                    </div>
                    {sel && (
                      <div className="w-7 h-7 rounded-full bg-[#C8F708] flex items-center justify-center flex-shrink-0">
                        <Check className="h-4 w-4 text-[#1a2600]" />
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
        )}

        {/* STEP 2 — Weekdays */}
        {step === 2 && (
          <div className="space-y-4">
            {scheduleLoading ? (
              <div className="flex items-center justify-center py-10 text-[#737688]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Carregando agenda...
              </div>
            ) : (
              <>
                <p className="text-sm text-[#737688]">
                  Marque um ou mais dias. Os dias em cinza não estão disponíveis nesta distribuidora.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {WEEKDAYS.map((d) => {
                    const available = activeWeekdays.includes(d.value);
                    const sel = selectedDays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        disabled={!available}
                        onClick={() => available && toggleDay(d.value)}
                        className={cn(
                          "rounded-2xl py-4 flex flex-col items-center gap-1 transition-all",
                          !available
                            ? "bg-[#f3f4f5] text-[#c3c5d9] opacity-50 cursor-not-allowed"
                            : sel
                              ? "bg-[#C8F708] text-[#1a2600]"
                              : "bg-[#f3f4f5] text-[#4a5e87] hover:bg-[#e8e9ea]"
                        )}
                      >
                        <CalendarDays className="h-5 w-5" />
                        <span className="text-sm font-bold">{d.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 3 — Time slot */}
        {step === 3 && (
          <div className="space-y-2.5">
            {timeSlots.length === 0 ? (
              <div className="bg-amber-50 rounded-3xl p-5 text-sm text-amber-800">
                Esta distribuidora ainda não configurou horários disponíveis.
              </div>
            ) : (
              timeSlots.map((slot) => {
                const sel = selectedTimeSlotId === slot.id;
                return (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedTimeSlotId(slot.id)}
                    className={cn(
                      "w-full rounded-3xl p-5 flex items-center gap-4 transition-all text-left",
                      sel ? "bg-white ring-2 ring-primary" : "bg-[#f3f4f5] hover:bg-[#edeef0]"
                    )}
                  >
                    <div
                      className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                        sel ? "bg-primary text-white" : "bg-white text-[#4a5e87]"
                      )}
                    >
                      <Clock className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-[#191c1d] font-heading">{slot.label}</p>
                      <p className="text-sm text-[#737688]">{formatSlot(slot)}</p>
                    </div>
                    {sel && (
                      <div className="w-7 h-7 rounded-full bg-[#C8F708] flex items-center justify-center">
                        <Check className="h-4 w-4 text-[#1a2600]" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* STEP 4 — Quantity + Summary */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#5697E9]/15 flex items-center justify-center">
                  <Droplets className="h-6 w-6 text-[#5697E9]" />
                </div>
                <div>
                  <p className="font-bold text-[#191c1d] font-heading">{selectedProduct?.name}</p>
                  <p className="text-xs text-[#737688]">{selectedProduct?.description ?? ""}</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-5">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="w-12 h-12 rounded-2xl bg-[#f3f4f5] flex items-center justify-center text-[#4a5e87] hover:bg-[#e8e9ea] active:scale-95 transition-all"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <div className="text-center min-w-16">
                  <span className="text-5xl font-extrabold text-[#191c1d] font-heading">{qty}</span>
                </div>
                <button
                  onClick={() => setQty(qty + 1)}
                  className="w-12 h-12 rounded-2xl bg-[#f3f4f5] flex items-center justify-center text-[#4a5e87] hover:bg-[#e8e9ea] active:scale-95 transition-all"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-[#737688] text-center mt-4">
                {qty === 1 ? "unidade por entrega" : "unidades por entrega"}
              </p>
            </div>

            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setQty(n)}
                  className={cn(
                    "flex-1 py-3 rounded-2xl text-sm font-semibold transition-all",
                    qty === n
                      ? "bg-[#C8F708] text-[#1a2600]"
                      : "bg-[#f3f4f5] text-[#4a5e87] hover:bg-[#e8e9ea]"
                  )}
                >
                  {n}x
                </button>
              ))}
            </div>

            <div className="bg-white rounded-3xl p-5">
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688] mb-3">
                Resumo
              </p>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#737688]">Produto</span>
                  <span className="font-bold text-[#191c1d]">{selectedProduct?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737688]">Distribuidora</span>
                  <span className="font-bold text-[#191c1d]">{selectedDistributorName ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737688]">Dias</span>
                  <span className="font-bold text-[#191c1d]">{selectedDaysLabel || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737688]">Horário</span>
                  <span className="font-bold text-[#191c1d]">
                    {selectedSlot ? formatSlot(selectedSlot) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737688]">Quantidade</span>
                  <span className="font-bold text-[#191c1d]">{qty}x por entrega</span>
                </div>
                <div className="h-px bg-[#e1e3e4] my-1" />
                <div className="flex justify-between">
                  <span className="text-[#737688]">Frequência</span>
                  <span className="font-bold text-primary">Semanal</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="mx-6 mt-3 rounded-2xl bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600 font-medium">{error}</p>
        </div>
      )}

      <div className="px-6 mt-6">
        {step < TOTAL_STEPS - 1 ? (
          <button
            disabled={!canAdvance}
            onClick={next}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all",
              canAdvance
                ? "bg-[#C8F708] text-[#1a2600] hover:opacity-90 active:scale-[0.97]"
                : "bg-[#e1e3e4] text-[#737688] cursor-not-allowed"
            )}
          >
            Continuar
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            disabled={loading || !canAdvance}
            onClick={handleCreate}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all",
              canAdvance && !loading
                ? "bg-[#C8F708] text-[#1a2600] hover:opacity-90 active:scale-[0.97]"
                : "bg-[#e1e3e4] text-[#737688] cursor-not-allowed"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Check className="h-5 w-5" />
                Confirmar assinatura
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/auth";
import { useCheckoutStore } from "@/src/store/checkout";
import { useCartStore } from "@/src/store/cart";
import { DistributorSelector } from "@/src/components/consumer/distributor-selector";
import { Button } from "@/src/components/ui/button";
import { ArrowLeft, Zap, Droplets, Building2 } from "lucide-react";
import type { Address } from "@/src/types";

export default function CheckoutDistributorPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const selectedDate = useCheckoutStore((s) => s.selectedDate);
  const selectedWindow = useCheckoutStore((s) => s.selectedWindow);
  const storedAddressId = useCheckoutStore((s) => s.selectedAddressId);
  const selectedDistributorId = useCheckoutStore((s) => s.selectedDistributorId);
  const setSelectedDistributorId = useCheckoutStore((s) => s.setSelectedDistributorId);

  const setCartDistributorId = useCartStore((s) => s.setSelectedDistributorId);

  const [zoneId, setZoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load zone_id from address
  useEffect(() => {
    let cancelled = false;

    async function loadZone() {
      if (!user?.id || !storedAddressId) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/consumers/${user.id}/addresses`);
        const data = await res.json();
        const addresses: Address[] = data.addresses ?? [];
        const addr = addresses.find((a) => a.id === storedAddressId);
        if (!cancelled && addr?.zone_id) {
          setZoneId(addr.zone_id);
        }
      } catch {
        // silently fail — will redirect on missing data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadZone();
    return () => { cancelled = true; };
  }, [user?.id, storedAddressId]);

  // If no schedule data, redirect to schedule
  useEffect(() => {
    if (!storedAddressId || !selectedDate || !selectedWindow) {
      router.replace("/checkout/schedule");
    }
  }, [storedAddressId, selectedDate, selectedWindow, router]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedDistributorId(id);
      setCartDistributorId(id);
    },
    [setSelectedDistributorId, setCartDistributorId],
  );

  const handleSkip = useCallback(() => {
    setSelectedDistributorId(null);
    setCartDistributorId(null);
    router.push("/checkout/payment");
  }, [setSelectedDistributorId, setCartDistributorId, router]);

  function handleContinue() {
    router.push("/checkout/payment");
  }

  if (!storedAddressId || !selectedDate || !selectedWindow) return null;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f0f2f4] transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-[#191c1d]" />
        </button>
        <span className="text-lg font-bold font-heading text-[#191c1d]">Xuá</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#191c1d]">
          <Zap className="h-4 w-4 text-white" />
        </div>
      </div>

      {/* Hero Banner */}
      <div className="mx-4 rounded-2xl bg-linear-to-br from-primary to-primary-hover p-5 relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 opacity-15">
          <Building2 className="h-32 w-32 text-white" />
        </div>
        <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">
          Etapa 02/04
        </p>
        <h1 className="text-2xl font-bold text-white font-heading mt-1 leading-tight">
          Escolha sua
          <br />
          Distribuidora
        </h1>
        <p className="text-sm text-white/70 mt-2">
          Selecione a distribuidora que vai preparar seu pedido.
        </p>
      </div>

      {/* Distributor Selector */}
      <div className="mx-4 mt-5 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Droplets className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : zoneId ? (
          <DistributorSelector
            zoneId={zoneId}
            date={selectedDate}
            window={selectedWindow}
            selectedId={selectedDistributorId}
            onSelect={handleSelect}
            onSkip={handleSkip}
          />
        ) : (
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-sm text-amber-700">
              Seu endereço ainda não está vinculado a uma zona de entrega.
            </p>
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      {selectedDistributorId && (
        <div className="sticky bottom-0 mx-4 mt-5 mb-4">
          <Button
            onClick={handleContinue}
            className="w-full h-12 rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] font-semibold text-sm shadow-none hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Continuar para Pagamento
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/auth";
import { useCheckoutStore } from "@/src/store/checkout";
import { useCartStore } from "@/src/store/cart";
import { DistributorSelector } from "@/src/components/consumer/distributor-selector";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import { DeliveryAddressCard } from "@/src/components/consumer/delivery-address-card";
import { Button } from "@/src/components/ui/button";
import { ArrowLeft, Zap, Droplets, Building2 } from "lucide-react";
import type { Address } from "@/src/types";

export default function CheckoutDistributorPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const setSelectedAddressId = useCheckoutStore((s) => s.setSelectedAddressId);
  const selectedDistributorId = useCheckoutStore((s) => s.selectedDistributorId);
  const setSelectedDistributorId = useCheckoutStore((s) => s.setSelectedDistributorId);

  const setCartDistributorId = useCartStore((s) => s.setSelectedDistributorId);

  const [selectedAddress, setSelectedAddressLocal] = useState<Address | null>(null);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressError, setAddressError] = useState(false);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);

  // Guard: impede que o fetch seja disparado mais de uma vez na montagem
  const hasFetched = useRef(false);

  const zoneId = selectedAddress?.zone_id ?? null;

  // When user selects an address, persist its ID and reset distributor
  const handleAddressSelect = useCallback((addr: Address) => {
    setSelectedAddressLocal(addr);
    setSelectedAddressId(addr.id);
    // Trocar endereço invalida distribuidora selecionada
    setSelectedDistributorId(null);
    setCartDistributorId(null);
  }, [setSelectedAddressId, setSelectedDistributorId, setCartDistributorId]);

  // Load default address — dispara UMA única vez ao montar o componente
  useEffect(() => {
    if (!user?.id || hasFetched.current) return;
    hasFetched.current = true;

    async function loadDefaultAddress() {
      setAddressLoading(true);
      setAddressError(false);
      try {
        const res = await fetch(`/api/consumers/${user!.id}/addresses`);
        if (!res.ok) {
          setAddressError(true);
          return;
        }
        const data = await res.json();
        const list: Address[] = data.addresses ?? [];
        if (list.length > 0) {
          // Lê o estado do Zustand de forma imperativa para não criar dependência reativa
          const storedId = useCheckoutStore.getState().selectedAddressId;
          const fromStore = storedId ? list.find((a) => a.id === storedId) : null;
          const def = fromStore ?? list.find((a) => a.is_default) ?? list[0];
          setSelectedAddressLocal(def);
          setSelectedAddressId(def.id);
        }
      } catch {
        setAddressError(true);
      } finally {
        setAddressLoading(false);
      }
    }

    void loadDefaultAddress();
  }, [user?.id, setSelectedAddressId]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedDistributorId(id);
      setCartDistributorId(id);
    },
    [setSelectedDistributorId, setCartDistributorId],
  );

  function handleContinue() {
    router.push("/checkout/schedule");
  }

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

      <DeliveryAddressCard
        className="mx-4 mt-5"
        address={selectedAddress}
        loading={addressLoading}
        onClick={() => setAddressSheetOpen(true)}
      />

      {/* Distributor Selector */}
      <div className="mx-4 mt-5 flex-1">
        {addressLoading ? (
          <div className="flex items-center justify-center py-12">
            <Droplets className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : addressError ? (
          <div className="rounded-2xl bg-red-50 p-4">
            <p className="text-sm text-red-600">
              Não foi possível carregar seus endereços. Verifique sua conexão e tente novamente.
            </p>
          </div>
        ) : zoneId ? (
          <DistributorSelector
            zoneId={zoneId}
            selectedId={selectedDistributorId}
            onSelect={handleSelect}
          />
        ) : selectedAddress ? (
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-sm text-amber-700">
              Seu endereço ainda não está vinculado a uma zona de entrega.
            </p>
          </div>
        ) : null}
      </div>

      {/* Sticky Footer */}
      {selectedDistributorId && (
        <div className="sticky bottom-0 mx-4 mt-5 mb-4">
          <Button
            onClick={handleContinue}
            className="w-full h-12 rounded-xl bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] font-semibold text-sm shadow-none hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Continuar para Agendamento
          </Button>
        </div>
      )}

      {/* Address Selection Sheet */}
      <AddressSheet
        open={addressSheetOpen}
        onOpenChange={setAddressSheetOpen}
        selectedAddressId={selectedAddress?.id ?? null}
        onSelect={handleAddressSelect}
      />
    </div>
  );
}

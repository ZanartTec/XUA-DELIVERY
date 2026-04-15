"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  User,
  MapPin,
  ChevronRight,
  LogOut,
  CreditCard,
  HelpCircle,
  Info,
  Truck,
  Droplets,
  Building2,
} from "lucide-react";
import { useAuthStore } from "@/src/store/auth";
import { LogoutButton } from "@/src/components/shared/logout-button";
import type { Consumer, Address } from "@/src/types";

export default function ProfilePage() {
  const setUser = useAuthStore((s) => s.setUser);
  const [consumer, setConsumer] = useState<Consumer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignToggleLoading, setAssignToggleLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const meRes = await fetch("/api/auth/me");
        const meData = await meRes.json();

        if (!meRes.ok || !meData.consumer) {
          throw new Error(meData.error || "Não foi possível carregar seu perfil.");
        }

        if (cancelled) return;

        setConsumer(meData.consumer);
        setUser({
          id: meData.consumer.id,
          name: meData.consumer.name,
          role: meData.consumer.role,
        });

        const addrRes = await fetch(`/api/consumers/${meData.consumer.id}/addresses`);
        const addrData = await addrRes.json();

        if (!addrRes.ok) {
          throw new Error(addrData.error || "Não foi possível carregar seus endereços.");
        }

        if (!cancelled) {
          setAddresses(addrData.addresses ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar seu perfil.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (loading) {
    return (
      <div className="space-y-4 px-6 pt-6">
        <div className="flex flex-col items-center">
          <div className="w-28 h-28 animate-pulse rounded-3xl bg-[#e1e3e4]" />
          <div className="mt-5 h-7 w-48 animate-pulse rounded-lg bg-[#e1e3e4]" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded-lg bg-[#e1e3e4]" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white shadow-sm">
            <div className="p-5">
              <div className="h-5 w-36 rounded-lg bg-[#e1e3e4]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* -- User Header -- */}
      <section className="px-6 pt-6 pb-8 text-center">
        {/* Avatar */}
        <div className="relative inline-block mb-5">
          <div className="w-28 h-28 mx-auto rounded-3xl overflow-hidden shadow-2xl bg-linear-to-br from-primary to-primary-hover flex items-center justify-center transform -rotate-3 hover:rotate-0 transition-transform duration-500">
            <User className="h-14 w-14 text-white" />
          </div>
        </div>

        {consumer && (
          <div className="mt-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-[#191c1d] font-heading">
              {consumer.name}
            </h1>
            <p className="text-[#4a5e87] font-medium mt-1">{consumer.email}</p>
            {consumer.phone && (
              <p className="text-[#737688] text-sm mt-0.5">{consumer.phone}</p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl bg-red-50 p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </section>

      {/* -- Quick Access: Next Delivery Card -- */}
      <section className="px-6 mb-8">
        <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688] mb-3">
          Acesso Rápido
        </h2>

        {/* Next delivery placeholder */}
        <Link href="/orders">
          <div className="bg-[#f3f4f5] rounded-3xl p-5 relative overflow-hidden">
            <Truck className="h-5 w-5 text-primary mb-3" />
            <h3 className="text-lg font-bold text-[#191c1d] font-heading mb-0.5">
              Próxima Entrega
            </h3>
            <p className="text-sm text-[#4a5e87]">Ver meus pedidos ativos</p>
          </div>
        </Link>
      </section>

      {/* -- Account Settings -- */}
      <section className="px-6 mb-8">
        <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688] mb-4">
          Configurações da Conta
        </h2>

        <div className="space-y-2">
          {/* Addresses */}
          <Link
            href="/profile/addresses"
            className="flex items-center justify-between p-4 bg-white rounded-2xl hover:bg-[#f3f4f5] transition-all duration-300 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#5697E9]/15 text-primary group-hover:scale-110 transition-transform">
                <MapPin className="h-5 w-5" />
              </div>
              <span className="font-semibold text-[#191c1d]">Endereços Salvos</span>
            </div>
            <ChevronRight className="h-5 w-5 text-[#c3c5d9]" />
          </Link>

          {/* Edit profile */}
          <Link
            href="/profile/edit"
            className="flex items-center justify-between p-4 bg-white rounded-2xl hover:bg-[#f3f4f5] transition-all duration-300 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#5697E9]/15 text-primary group-hover:scale-110 transition-transform">
                <User className="h-5 w-5" />
              </div>
              <span className="font-semibold text-[#191c1d]">Editar Perfil</span>
            </div>
            <ChevronRight className="h-5 w-5 text-[#c3c5d9]" />
          </Link>

          {/* Auto-assign distributor toggle */}
          {consumer && (
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#5697E9]/15 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <span className="font-semibold text-[#191c1d] block text-sm">
                    Distribuidora automática
                  </span>
                  <span className="text-xs text-[#737688]">
                    {consumer.auto_assign_distributor
                      ? "Sistema escolhe a melhor"
                      : "Você escolhe manualmente"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={assignToggleLoading}
                onClick={async () => {
                  if (!consumer) return;
                  setAssignToggleLoading(true);
                  try {
                    const res = await fetch(
                      `/api/consumers/${consumer.id}/assign-mode`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          auto_assign_distributor:
                            !consumer.auto_assign_distributor,
                        }),
                      },
                    );
                    if (res.ok) {
                      const updated = await res.json();
                      setConsumer((prev) =>
                        prev
                          ? {
                              ...prev,
                              auto_assign_distributor:
                                updated.auto_assign_distributor,
                            }
                          : prev,
                      );
                    }
                  } catch {
                    // silently fail
                  } finally {
                    setAssignToggleLoading(false);
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  consumer.auto_assign_distributor
                    ? "bg-[#C8F708]"
                    : "bg-[#c4c6cf]"
                } ${assignToggleLoading ? "opacity-50" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    consumer.auto_assign_distributor
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Help */}
          <div className="flex items-center justify-between p-4 bg-white rounded-2xl hover:bg-[#f3f4f5] transition-all duration-300 group cursor-default">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#5697E9]/15 text-primary group-hover:scale-110 transition-transform">
                <HelpCircle className="h-5 w-5" />
              </div>
              <span className="font-semibold text-[#191c1d]">Ajuda e Suporte</span>
            </div>
            <ChevronRight className="h-5 w-5 text-[#c3c5d9]" />
          </div>

          {/* About */}
          <div className="flex items-center justify-between p-4 bg-white rounded-2xl hover:bg-[#f3f4f5] transition-all duration-300 group cursor-default">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#5697E9]/15 text-primary group-hover:scale-110 transition-transform">
                <Info className="h-5 w-5" />
              </div>
              <span className="font-semibold text-[#191c1d]">Sobre Nós</span>
            </div>
            <ChevronRight className="h-5 w-5 text-[#c3c5d9]" />
          </div>

          {/* Logout */}
          <div className="pt-4">
            <LogoutButton
              variant="full"
              className="w-full flex items-center justify-center gap-3 p-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition-colors"
            />
          </div>
        </div>
      </section>

      {/* -- Addresses Preview -- */}
      {addresses.length > 0 && (
        <section className="px-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688]">
              Endereços
            </h2>
            <Link
              href="/profile/addresses"
              className="text-primary text-xs font-bold uppercase tracking-widest hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="space-y-2">
            {addresses.slice(0, 2).map((addr) => (
              <div
                key={addr.id}
                className="bg-white rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="h-4 w-4 text-[#5697E9]" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-[#191c1d]">
                      {addr.street}, {addr.number}
                    </p>
                    <p className="text-xs text-[#737688]">
                      {addr.neighborhood} — {addr.city}/{addr.state} — CEP{" "}
                      {addr.zip_code}
                    </p>
                    {addr.is_default && (
                      <span className="inline-block mt-1 px-2.5 py-0.5 bg-[#C8F708]/20 text-[#1a2600] text-[10px] font-bold uppercase tracking-wider rounded-full">
                        Principal
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* -- Footer -- */}
      <div className="text-center pb-6 px-6">
        <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-[#c3c5d9]">
          XUA Delivery v1.0.0
        </p>
        <p className="text-[10px] text-[#737688] mt-1 italic">
          Água pura, entrega certa.
        </p>
      </div>
    </div>
  );
}

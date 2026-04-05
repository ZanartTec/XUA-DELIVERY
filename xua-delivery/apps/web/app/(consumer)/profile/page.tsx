"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { User, MapPin, Pencil, ChevronRight, LogOut } from "lucide-react";
import { useAuthStore } from "@/src/store/auth";
import { LogoutButton } from "@/src/components/shared/logout-button";
import type { Consumer, Address } from "@/src/types";

export default function ProfilePage() {
  const setUser = useAuthStore((s) => s.setUser);
  const [consumer, setConsumer] = useState<Consumer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        if (cancelled) {
          return;
        }

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
      <div className="space-y-3 px-4 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white/80 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
            <div className="px-4 py-4"><div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" /></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between px-4 pt-4">
        <h1 className="text-lg font-bold font-heading text-foreground">Meu perfil</h1>
        <Link href="/profile/edit">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl border-0 bg-[#e1e3e4] hover:bg-[#d1d3d4]"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        </Link>
      </div>

      {error && (
        <div className="mx-4 rounded-2xl bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {consumer && (
        <div className="mx-4 flex items-center gap-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#0041c8] to-[#0055ff]">
            <User className="h-7 w-7 text-white" />
          </div>
          <div className="space-y-0.5">
            <p className="font-semibold">{consumer.name}</p>
            <p className="text-sm text-muted-foreground">{consumer.email}</p>
            <p className="text-sm text-muted-foreground">{consumer.phone}</p>
          </div>
        </div>
      )}

      {/* Endereços */}
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold font-heading">
            <MapPin className="h-4 w-4 text-[#0041c8]" />
            Endereços
          </span>
          <Link href="/profile/addresses">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 rounded-xl border-0 bg-[#e1e3e4] hover:bg-[#d1d3d4]"
            >
              Gerenciar <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
        {addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {addresses.map((addr) => (
              <li key={addr.id} className="rounded-xl bg-[#e1e3e4]/50 p-3">
                <p className="font-medium">{addr.street}, {addr.number}</p>
                <p className="text-xs text-muted-foreground">
                  {addr.neighborhood} — {addr.city}/{addr.state} — CEP {addr.zip_code}
                </p>
                {addr.is_default && (
                  <span className="text-xs font-medium text-[#0041c8]">Principal</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sair */}
      <div className="mx-4">
        <LogoutButton variant="full" className="w-full justify-center rounded-2xl bg-white/95 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm text-destructive hover:bg-destructive/10 hover:text-destructive" />
      </div>
    </div>
  );
}

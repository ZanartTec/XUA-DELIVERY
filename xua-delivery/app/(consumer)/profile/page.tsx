"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { User, MapPin, Pencil, ChevronRight } from "lucide-react";
import { useAuthStore } from "@/src/store/auth";
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
      <div className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="py-4"><div className="h-4 w-48 rounded bg-muted" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Meu perfil</h1>
        <Link href="/profile/edit">
          <Button size="sm" variant="outline" className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        </Link>
      </div>

      {error && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {consumer && (
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-14 w-14 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <User className="h-7 w-7 text-accent" />
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold">{consumer.name}</p>
              <p className="text-sm text-muted-foreground">{consumer.email}</p>
              <p className="text-sm text-muted-foreground">{consumer.phone}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-accent" />
              Endereços
            </span>
            <Link href="/profile/addresses">
              <Button size="sm" variant="outline" className="gap-1">
                Gerenciar <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {addresses.map((addr) => (
                <li key={addr.id} className="border rounded-lg p-3">
                  <p className="font-medium">{addr.street}, {addr.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {addr.neighborhood} — {addr.city}/{addr.state} — CEP {addr.zip_code}
                  </p>
                  {addr.is_default && (
                    <span className="text-xs text-accent font-medium">Principal</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

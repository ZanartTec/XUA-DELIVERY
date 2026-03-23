"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import type { Consumer, Address } from "@/src/types";

export default function ProfilePage() {
  const [consumer, setConsumer] = useState<Consumer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/consumers/me/addresses").then((r) => r.json()),
    ])
      .then(([userData, addrData]) => {
        setConsumer(userData.consumer ?? null);
        setAddresses(addrData.addresses ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-4 text-gray-500">Carregando...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Meu perfil</h1>
        <Link href="/profile/edit">
          <Button size="sm" variant="outline">Editar</Button>
        </Link>
      </div>

      {consumer && (
        <Card>
          <CardContent className="py-4 space-y-2 text-sm">
            <p><span className="font-medium">Nome:</span> {consumer.name}</p>
            <p><span className="font-medium">E-mail:</span> {consumer.email}</p>
            <p><span className="font-medium">Telefone:</span> {consumer.phone}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Endereços</span>
            <Link href="/profile/addresses">
              <Button size="sm" variant="outline">Gerenciar</Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum endereço cadastrado.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {addresses.map((addr) => (
                <li key={addr.id} className="border rounded-md p-2">
                  <p>{addr.street}, {addr.number}</p>
                  <p className="text-xs text-gray-500">
                    {addr.neighborhood} — {addr.city}/{addr.state} — CEP {addr.zip_code}
                  </p>
                  {addr.is_default && (
                    <span className="text-xs text-blue-600 font-medium">Principal</span>
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

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { toast } from "sonner";
import type { Address } from "@/src/types";

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [cep, setCep] = useState("");
  const [cepData, setCepData] = useState<{
    street: string;
    neighborhood: string;
    city: string;
    state: string;
  } | null>(null);
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => {
    fetch("/api/consumers/me/addresses")
      .then((r) => r.json())
      .then((data) => setAddresses(data.addresses ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function lookupCep() {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      setError("CEP deve ter 8 dígitos.");
      return;
    }
    setCepLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/consumers/me/addresses?action=cep&cep=${clean}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setCepData(null);
      } else {
        setCepData({
          street: data.street,
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
        });
      }
    } catch {
      setError("Erro ao buscar CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  async function handleAdd() {
    if (!cepData || !number) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/consumers/me/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip_code: cep.replace(/\D/g, ""),
          street: cepData.street,
          number,
          complement,
          neighborhood: cepData.neighborhood,
          city: cepData.city,
          state: cepData.state,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        if (body.code === "NO_COVERAGE") {
          toast.error("Ainda não atendemos sua região");
        }
        setError(body.error || "Erro ao salvar endereço");
        return;
      }
      const { address } = await res.json();
      setAddresses((prev) => [...prev, address]);
      setCep("");
      setCepData(null);
      setNumber("");
      setComplement("");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Endereços</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Novo endereço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="CEP (ex: 01001-000)"
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={lookupCep} disabled={cepLoading}>
              {cepLoading ? "..." : "Buscar"}
            </Button>
          </div>

          {cepData && (
            <>
              <p className="text-sm text-muted-foreground">
                {cepData.street}, {cepData.neighborhood} — {cepData.city}/{cepData.state}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Número"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                />
                <Input
                  placeholder="Complemento"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={saving || !number}>
                {saving ? "Salvando..." : "Adicionar endereço"}
              </Button>
            </>
          )}

          {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Meus endereços</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
          ) : (
            <ul className="space-y-2">
              {addresses.map((addr) => (
                <li key={addr.id} className="border rounded-md p-3 text-sm">
                  <p>
                    {addr.street}, {addr.number}
                    {addr.complement ? ` — ${addr.complement}` : ""}
                  </p>
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

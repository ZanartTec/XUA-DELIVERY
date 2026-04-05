"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/src/store/auth";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import type { Address } from "@/src/types";

export default function AddressesPage() {
  const user = useAuthStore((s) => s.user);
  const [consumerId, setConsumerId] = useState<string | null>(user?.id ?? null);
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
    async function load() {
      try {
        let uid = consumerId;
        if (!uid) {
          const meRes = await fetch("/api/auth/me");
          const meData = await meRes.json();
          uid = meData.consumer?.id ?? null;
          if (uid) setConsumerId(uid);
        }
        if (!uid) return;
        const res = await fetch(`/api/consumers/${uid}/addresses`);
        const data = await res.json();
        setAddresses(data.addresses ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [consumerId]);

  async function lookupCep() {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      setError("CEP deve ter 8 dígitos.");
      return;
    }
    setCepLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/consumers/cep/${clean}`);
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
    if (!cepData || !number || !consumerId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/consumers/${consumerId}/addresses`, {
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
    <div className="space-y-4 pb-4">
      <div className="px-4 pt-4">
        <h1 className="text-lg font-bold font-heading">Endereços</h1>
      </div>

      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3">
        <p className="text-sm font-semibold font-heading">Novo endereço</p>
        <div className="flex gap-2">
          <Input
            placeholder="CEP (ex: 01001-000)"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            className="flex-1 rounded-xl border-0 bg-[#e1e3e4]"
          />
          <Button variant="outline" onClick={lookupCep} disabled={cepLoading} className="rounded-xl border-0 bg-[#e1e3e4] hover:bg-[#d1d3d4]">
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
                className="rounded-xl border-0 bg-[#e1e3e4]"
              />
              <Input
                placeholder="Complemento"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                className="rounded-xl border-0 bg-[#e1e3e4]"
              />
            </div>
            <Button className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]" onClick={handleAdd} disabled={saving || !number}>
              {saving ? "Salvando..." : "Adicionar endereço"}
            </Button>
          </>
        )}

        {error && <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      </div>

      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Meus endereços</p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : addresses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0041c8]/10">
              <MapPin className="h-8 w-8 text-[#0041c8]/40" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {addresses.map((addr) => (
              <li key={addr.id} className="rounded-xl bg-[#e1e3e4]/50 p-3 text-sm">
                <p>
                  {addr.street}, {addr.number}
                  {addr.complement ? ` — ${addr.complement}` : ""}
                </p>
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
    </div>
  );
}

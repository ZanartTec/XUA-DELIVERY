"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/src/components/ui/sheet";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useAuthStore } from "@/src/store/auth";
import { toast } from "sonner";
import { Home, Plus, MapPin, Check } from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { Address } from "@/src/types";

interface AddressSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAddressId: string | null;
  onSelect: (address: Address) => void;
}

export function AddressSheet({
  open,
  onOpenChange,
  selectedAddressId,
  onSelect,
}: AddressSheetProps) {
  const user = useAuthStore((s) => s.user);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [cep, setCep] = useState("");
  const [cepData, setCepData] = useState<{
    street: string;
    neighborhood: string;
    city: string;
    state: string;
  } | null>(null);
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/consumers/${user.id}/addresses`);
      const data = await res.json();
      setAddresses(data.addresses ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (open) {
      void loadAddresses();
      setShowForm(false);
      resetForm();
    }
  }, [open, loadAddresses]);

  function resetForm() {
    setCep("");
    setCepData(null);
    setNumber("");
    setComplement("");
    setLabel("");
    setError(null);
  }

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
    if (!cepData || !number || !user?.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/consumers/${user.id}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || undefined,
          zip_code: cep.replace(/\D/g, ""),
          street: cepData.street,
          number,
          complement: complement || undefined,
          neighborhood: cepData.neighborhood,
          city: cepData.city,
          state: cepData.state,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        if (body.code === "NO_COVERAGE") {
          toast.error("Ainda não atendemos sua região");
          setError("Região sem cobertura de entrega.");
          return;
        }
        setError(body.error || "Erro ao salvar endereço.");
        return;
      }
      const { address } = await res.json();
      setAddresses((prev) => [...prev, address]);
      setShowForm(false);
      resetForm();
      onSelect(address);
      onOpenChange(false);
      toast.success("Endereço adicionado!");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  function handleSelect(addr: Address) {
    onSelect(addr);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="text-lg font-bold font-heading text-[#191c1d]">
            Endereço de Entrega
          </SheetTitle>
          <SheetDescription className="text-xs text-[#737688]">
            Selecione ou adicione um endereço para receber sua entrega.
          </SheetDescription>
        </SheetHeader>

        {/* Address list */}
        <div className="px-5 space-y-2">
          {loading ? (
            <>
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-[#e1e3e4] bg-[#f8f9fa] p-4 animate-pulse"
                >
                  <div className="h-11 w-11 rounded-xl bg-[#e1e3e4]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-[#e1e3e4]" />
                    <div className="h-2.5 w-40 rounded bg-[#e1e3e4]" />
                  </div>
                </div>
              ))}
            </>
          ) : addresses.length === 0 && !showForm ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0041c8]/10">
                <MapPin className="h-8 w-8 text-[#0041c8]/40" />
              </div>
              <p className="text-sm text-[#737688]">Nenhum endereço cadastrado.</p>
            </div>
          ) : (
            addresses.map((addr) => {
              const isSelected = addr.id === selectedAddressId;
              return (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => handleSelect(addr)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-all active:scale-[0.98]",
                    isSelected
                      ? "border-2 border-[#0041c8] bg-white shadow-[0_2px_12px_rgba(0,65,200,0.1)]"
                      : "border border-[#e1e3e4] bg-white hover:border-[#0041c8]/30",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      isSelected ? "bg-[#0041c8]/10" : "bg-[#e8eeff]",
                    )}
                  >
                    <Home
                      className={cn(
                        "h-5 w-5",
                        isSelected ? "text-[#0041c8]" : "text-[#0041c8]/60",
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#191c1d]">
                      {addr.label || "Endereço"}
                      {addr.is_default && (
                        <span className="ml-1.5 text-[10px] font-medium text-[#0041c8]">
                          Principal
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#737688] truncate">
                      {addr.street}, {addr.number}
                      {addr.complement ? ` — ${addr.complement}` : ""}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0041c8]">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* New address form */}
        {showForm ? (
          <div className="mx-5 mt-4 rounded-2xl border border-[#e1e3e4] bg-[#f8f9fa] p-4 space-y-3">
            <p className="text-sm font-semibold font-heading text-[#191c1d]">
              Novo endereço
            </p>

            <Input
              placeholder="Apelido (ex: Casa, Trabalho)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-xl border-0 bg-white"
            />

            <div className="flex gap-2">
              <Input
                placeholder="CEP (ex: 01001-000)"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                className="flex-1 rounded-xl border-0 bg-white"
              />
              <Button
                variant="outline"
                onClick={lookupCep}
                disabled={cepLoading}
                className="rounded-xl border-0 bg-white hover:bg-[#e1e3e4]"
              >
                {cepLoading ? "..." : "Buscar"}
              </Button>
            </div>

            {cepData && (
              <>
                <p className="text-xs text-[#737688]">
                  {cepData.street}, {cepData.neighborhood} — {cepData.city}/{cepData.state}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Número"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    required
                    className="rounded-xl border-0 bg-white"
                  />
                  <Input
                    placeholder="Complemento"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    className="rounded-xl border-0 bg-white"
                  />
                </div>
                <Button
                  className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold text-white shadow-none hover:opacity-90 active:scale-[0.98]"
                  onClick={handleAdd}
                  disabled={saving || !number}
                >
                  {saving ? "Salvando..." : "Salvar endereço"}
                </Button>
              </>
            )}

            {error && (
              <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="text-xs font-medium text-[#737688] hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="px-5 mt-3 pb-5">
            <Button
              variant="outline"
              className="w-full h-12 rounded-2xl border-dashed border-[#0041c8]/30 text-[#0041c8] font-semibold hover:bg-[#e8eeff]/50 active:scale-[0.98]"
              onClick={() => setShowForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar novo endereço
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

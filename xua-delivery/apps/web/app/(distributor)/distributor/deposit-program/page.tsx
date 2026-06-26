"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Recycle, UserPlus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { api, ApiError } from "@/src/lib/api-client";

type LookupResult = {
  consumer: { id: string; name: string; document: string | null; email: string };
  already_linked: boolean;
  is_enabled: boolean;
  max_bottles: number;
};

type Program = {
  id: string;
  consumer_id: string;
  consumer_document_snapshot: string;
  is_enabled: boolean;
  max_bottles: number;
  consumer: { id: string; name: string; document: string | null; email: string };
};

type Balance = {
  consumer: { id: string; name: string; document: string | null };
  inventory_item: { id: string; code: string; name: string };
  bottles_on_loan: number;
};

function maskDocument(doc: string | null): string {
  if (!doc) return "—";
  if (doc.length === 11) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (doc.length === 14) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

export default function DepositProgramPage() {
  const [document, setDocument] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [maxBottles, setMaxBottles] = useState("0");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, b] = await Promise.all([
        api.get<{ programs: Program[] }>("/api/distributor/deposit-program"),
        api.get<{ balances: Balance[] }>("/api/distributor/deposit/balances"),
      ]);
      setPrograms(p.programs);
      setBalances(b.balances);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleLookup() {
    setSearching(true);
    setLookupError(null);
    setLookup(null);
    try {
      const result = await api.get<LookupResult>(
        `/api/distributor/deposit-program/lookup?document=${encodeURIComponent(document)}`,
      );
      setLookup(result);
      setMaxBottles(String(result.max_bottles || 0));
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : "Erro ao buscar");
    } finally {
      setSearching(false);
    }
  }

  async function handleEnroll() {
    if (!lookup) return;
    setSaving(true);
    try {
      await api.post("/api/distributor/deposit-program", {
        consumer_id: lookup.consumer.id,
        max_bottles: Number(maxBottles) || 0,
      });
      setLookup(null);
      setDocument("");
      await reload();
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : "Erro ao habilitar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleProgram(program: Program) {
    await api.patch(`/api/distributor/deposit-program/${program.consumer_id}`, {
      is_enabled: !program.is_enabled,
    });
    await reload();
  }

  async function updateLimit(program: Program, value: number) {
    await api.patch(`/api/distributor/deposit-program/${program.consumer_id}`, {
      max_bottles: value,
    });
    await reload();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5697E9]/15">
          <Recycle className="h-5 w-5 text-[#5697E9]" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-bold text-[#191c1d]">Programa de Caução</h1>
          <p className="text-sm text-[#737688]">
            Empréstimo de vasilhames a consumidores selecionados.
          </p>
        </div>
      </header>

      {/* Busca por CPF/CNPJ */}
      <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-[#191c1d]">Habilitar consumidor</h2>
        <div className="flex gap-2">
          <input
            value={document}
            onChange={(e) => setDocument(e.target.value)}
            placeholder="CPF ou CNPJ"
            className="flex-1 rounded-xl border border-[#e1e3e4] px-3 py-2 text-sm"
          />
          <Button onClick={handleLookup} disabled={searching || document.trim().length < 11}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {lookupError && <p className="mt-2 text-sm text-destructive">{lookupError}</p>}

        {lookup && (
          <div className="mt-3 rounded-xl bg-[#f8f9fa] p-3">
            <p className="font-semibold text-[#191c1d]">{lookup.consumer.name}</p>
            <p className="text-xs text-[#737688]">{maskDocument(lookup.consumer.document)}</p>
            {lookup.already_linked && (
              <p className="mt-1 text-xs text-amber-600">
                Já vinculado ({lookup.is_enabled ? "ativo" : "inativo"}). Salvar irá reabilitar.
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs text-[#737688]">Limite de vasilhames</label>
              <input
                type="number"
                min={0}
                value={maxBottles}
                onChange={(e) => setMaxBottles(e.target.value)}
                className="w-20 rounded-lg border border-[#e1e3e4] px-2 py-1 text-sm"
              />
              <Button onClick={handleEnroll} disabled={saving} className="ml-auto">
                <UserPlus className="mr-1 h-4 w-4" />
                Habilitar
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-[#737688]">
              Limite 0 bloqueia a caução (todo vasilhame faltante será vendido).
            </p>
          </div>
        )}
      </section>

      {/* Programas */}
      <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-[#191c1d]">Consumidores habilitados</h2>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#737688]" />
        ) : programs.length === 0 ? (
          <p className="text-sm text-[#737688]">Nenhum consumidor no programa.</p>
        ) : (
          <ul className="divide-y divide-[#e1e3e4]">
            {programs.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[#191c1d]">{p.consumer.name}</p>
                  <p className="text-xs text-[#737688]">
                    {maskDocument(p.consumer.document ?? p.consumer_document_snapshot)}
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  defaultValue={p.max_bottles}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0;
                    if (v !== p.max_bottles) void updateLimit(p, v);
                  }}
                  className="w-16 rounded-lg border border-[#e1e3e4] px-2 py-1 text-sm"
                  title="Limite de vasilhames"
                />
                <button
                  onClick={() => void toggleProgram(p)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    p.is_enabled
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-[#e1e3e4] text-[#737688]"
                  }`}
                >
                  {p.is_enabled ? "Ativo" : "Inativo"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Saldos */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-[#191c1d]">Vasilhames em caução (em aberto)</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-[#737688]">Nenhum vasilhame caucionado em aberto.</p>
        ) : (
          <ul className="divide-y divide-[#e1e3e4]">
            {balances.map((b, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-[#191c1d]">{b.consumer.name}</span>
                <span className="text-[#737688]">
                  {b.bottles_on_loan} × {b.inventory_item.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

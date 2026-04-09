"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

const CHECKLIST_ITEMS = [
  { key: "products_ok", label: "Produtos conferidos e corretos" },
  { key: "packaging_ok", label: "Embalagem lacrada e íntegra" },
  { key: "label_ok", label: "Etiqueta de rota colada" },
];

type Driver = { id: string; name: string };

export default function ChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState("");

  useEffect(() => {
    fetch("/api/distributor/drivers")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `Erro ${r.status}`);
        setDrivers(data.drivers ?? []);
      })
      .catch((err) => {
        setError(`Não foi possível carregar motoristas: ${err.message}`);
      });
  }, []);

  function toggle(key: string) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const allChecked = CHECKLIST_ITEMS.every((item) => checks[item.key]);
  const progress = CHECKLIST_ITEMS.filter((item) => checks[item.key]).length;
  const canDispatch = allChecked && selectedDriver !== "";

  async function handleDispatch() {
    setLoading(true);
    setError(null);
    try {
      // Checklist + dispatch atômico em uma única chamada
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch_with_checklist", driver_id: selectedDriver }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }

      router.push("/distributor/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading">Checklist — Pedido #{id}</h1>

      <div className="w-full bg-[#e1e3e4] rounded-full h-2">
        <div
          className="bg-linear-to-r from-[#0041c8] to-[#0055ff] h-2 rounded-full transition-all"
          style={{ width: `${(progress / CHECKLIST_ITEMS.length) * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">
        {progress}/{CHECKLIST_ITEMS.length} itens
      </p>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3">
        <p className="text-sm font-semibold font-heading">Verificações</p>
        {CHECKLIST_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => toggle(item.key)}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl p-3 text-sm text-left transition-all",
              checks[item.key]
                ? "bg-green-50 shadow-[0_2px_8px_rgba(34,197,94,0.15)]"
                : "bg-[#e1e3e4]/50 hover:bg-[#e1e3e4]"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded text-xs font-bold",
                checks[item.key]
                  ? "bg-green-600 text-white"
                  : "bg-white text-muted-foreground/30"
              )}
            >
              {checks[item.key] ? "✓" : ""}
            </span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-2">
        <p className="text-sm font-semibold font-heading">Motorista</p>
        <select
          value={selectedDriver}
          onChange={(e) => setSelectedDriver(e.target.value)}
          className="w-full rounded-xl border border-[#e1e3e4] bg-[#f5f6f7] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0041c8]"
        >
          <option value="">Selecione o motorista...</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600 rounded-xl bg-red-50 px-3 py-2">{error}</p>
      )}

      <Button
        className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]"
        disabled={!canDispatch || loading}
        onClick={handleDispatch}
      >
        {loading ? "Despachando..." : "Despachar pedido"}
      </Button>
    </div>
  );
}


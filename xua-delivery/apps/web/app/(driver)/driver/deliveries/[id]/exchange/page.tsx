"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/auth";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

export default function BottleExchangePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [returnedQty, setReturnedQty] = useState(0);
  const [condition, setCondition] = useState<"ok" | "damaged" | "dirty">("ok");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!user?.id) {
      setError("Usuário não identificado.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}/bottle-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: user.id,
          returned_empty_qty: returnedQty,
          bottle_condition: condition,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao registrar troca");
        return;
      }
      router.push("/driver/deliveries");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm rounded-2xl bg-white/95 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
        <h2 className="text-center text-lg font-bold font-heading">Troca de Vasilhame</h2>
        <p className="text-sm text-muted-foreground text-center">
          Pedido #{id} — Registre os garrafões coletados.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantidade coletada</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setReturnedQty(Math.max(0, returnedQty - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e1e3e4] text-lg font-semibold hover:bg-[#d1d3d4] active:scale-95">−</button>
            <Input type="number" min={0} value={returnedQty} onChange={(e) => setReturnedQty(Math.max(0, parseInt(e.target.value) || 0))} className="w-20 text-center rounded-xl border-0 bg-[#e1e3e4] font-semibold" />
            <button onClick={() => setReturnedQty(returnedQty + 1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e1e3e4] text-lg font-semibold hover:bg-[#d1d3d4] active:scale-95">+</button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</label>
          <div className="flex gap-2">
            <button
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${condition === "ok" ? "bg-[#0041c8] text-white shadow-[0_2px_8px_rgba(0,65,200,0.3)]" : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"}`}
              onClick={() => setCondition("ok")}
            >
              Bom estado
            </button>
            <button
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${condition === "damaged" ? "bg-[#0041c8] text-white shadow-[0_2px_8px_rgba(0,65,200,0.3)]" : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"}`}
              onClick={() => setCondition("damaged")}
            >
              Danificado
            </button>
            <button
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${condition === "dirty" ? "bg-[#0041c8] text-white shadow-[0_2px_8px_rgba(0,65,200,0.3)]" : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"}`}
              onClick={() => setCondition("dirty")}
            >
              Sujo
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <Button className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]" disabled={loading} onClick={handleSubmit}>
          {loading ? "Registrando..." : "Confirmar troca"}
        </Button>
      </div>
    </div>
  );
}

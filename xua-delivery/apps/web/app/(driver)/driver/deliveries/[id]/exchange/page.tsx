"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOfflineSync } from "@/src/hooks/use-offline-sync";
import { Button } from "@/src/components/ui/button";

const QUANTITY_OPTIONS = [0, 1, 2, 3, 4, 5];

export default function BottleExchangePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isOnline, enqueue } = useOfflineSync();
  const [returnedQty, setReturnedQty] = useState(0);
  const [condition, setCondition] = useState<"ok" | "damaged" | "dirty">("ok");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (returnedQty === 0) {
      router.push(`/driver/deliveries/${id}/non-collection`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (!isOnline) {
        await enqueue({
          type: "bottle_exchange",
          url: `/api/orders/${id}/bottle-exchange`,
          method: "POST",
          body: {
            returned_empty_qty: returnedQty,
            bottle_condition: condition,
          },
        });
        router.push("/driver/deliveries");
        return;
      }

      const res = await fetch(`/api/orders/${id}/bottle-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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

        <div className="rounded-xl bg-[#edf4ff] px-3 py-2 text-xs text-[#0b2a59]">
          Passo 1 de 2: quantidade coletada{returnedQty > 0 ? " • Passo 2: condição" : ""}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantidade coletada</label>
          <div className="grid grid-cols-3 gap-2">
            {QUANTITY_OPTIONS.map((qty) => (
              <button
                key={qty}
                type="button"
                onClick={() => setReturnedQty(qty)}
                className={`rounded-xl px-3 py-3 text-sm font-semibold transition-all ${returnedQty === qty ? "bg-primary text-white shadow-[0_2px_8px_rgba(27,74,154,0.3)]" : "bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"}`}
              >
                {qty === 5 ? "5+" : qty}
              </button>
            ))}
          </div>
        </div>

        {returnedQty > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</label>
            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${condition === "ok" ? "bg-primary text-white shadow-[0_2px_8px_rgba(27,74,154,0.3)]" : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"}`}
                onClick={() => setCondition("ok")}
              >
                OK
              </button>
              <button
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${condition === "damaged" ? "bg-primary text-white shadow-[0_2px_8px_rgba(27,74,154,0.3)]" : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"}`}
                onClick={() => setCondition("damaged")}
              >
                Danificado
              </button>
              <button
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${condition === "dirty" ? "bg-primary text-white shadow-[0_2px_8px_rgba(27,74,154,0.3)]" : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"}`}
                onClick={() => setCondition("dirty")}
              >
                Sujo
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <Button className="w-full rounded-xl bg-primary hover:bg-primary-hover font-semibold shadow-none hover:opacity-90 active:scale-[0.98]" disabled={loading} onClick={handleSubmit}>
          {loading ? "Registrando..." : returnedQty === 0 ? "Continuar para não coleta" : "Confirmar troca"}
        </Button>
      </div>
    </div>
  );
}

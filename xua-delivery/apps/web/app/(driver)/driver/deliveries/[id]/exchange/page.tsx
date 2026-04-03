"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/auth";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">Troca de Vasilhame</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Pedido #{id} — Registre os garrafões coletados.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quantidade coletada</label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReturnedQty(Math.max(0, returnedQty - 1))}
              >
                −
              </Button>
              <Input
                type="number"
                min={0}
                value={returnedQty}
                onChange={(e) => setReturnedQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 text-center"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReturnedQty(returnedQty + 1)}
              >
                +
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Condição</label>
            <div className="flex gap-2">
              <Button
                variant={condition === "ok" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setCondition("ok")}
              >
                Bom estado
              </Button>
              <Button
                variant={condition === "damaged" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setCondition("damaged")}
              >
                Danificado
              </Button>
              <Button
                variant={condition === "dirty" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setCondition("dirty")}
              >
                Sujo
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button className="w-full" disabled={loading} onClick={handleSubmit}>
            {loading ? "Registrando..." : "Confirmar troca"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

export default function BottleExchangePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [collectedQty, setCollectedQty] = useState(0);
  const [condition, setCondition] = useState<"good" | "damaged">("good");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}/bottle-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collected_qty: collectedQty,
          condition,
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
          <p className="text-sm text-gray-500 text-center">
            Pedido #{id} — Registre os garrafões coletados.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quantidade coletada</label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollectedQty(Math.max(0, collectedQty - 1))}
              >
                −
              </Button>
              <Input
                type="number"
                min={0}
                value={collectedQty}
                onChange={(e) => setCollectedQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 text-center"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollectedQty(collectedQty + 1)}
              >
                +
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Condição</label>
            <div className="flex gap-2">
              <Button
                variant={condition === "good" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setCondition("good")}
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
            </div>
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <Button className="w-full" disabled={loading} onClick={handleSubmit}>
            {loading ? "Registrando..." : "Confirmar troca"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

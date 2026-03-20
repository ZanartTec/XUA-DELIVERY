"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";

const CHECKLIST_ITEMS = [
  { key: "products_ok", label: "Produtos conferidos e corretos" },
  { key: "packaging_ok", label: "Embalagem lacrada e íntegra" },
  { key: "label_ok", label: "Etiqueta de rota colada" },
];

export default function ChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  function toggle(key: string) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const allChecked = CHECKLIST_ITEMS.every((item) => checks[item.key]);
  const progress = CHECKLIST_ITEMS.filter((item) => checks[item.key]).length;

  async function handleDispatch() {
    setLoading(true);
    try {
      await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch", checklist: checks }),
      });
      router.push("/distributor/queue");
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Checklist — Pedido #{id}</h1>

      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${(progress / CHECKLIST_ITEMS.length) * 100}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 text-right">
        {progress}/{CHECKLIST_ITEMS.length} itens
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Verificações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              className={cn(
                "w-full flex items-center gap-3 rounded-md border p-3 text-sm text-left transition-colors",
                checks[item.key]
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 hover:bg-gray-50"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded border text-xs font-bold",
                  checks[item.key]
                    ? "bg-green-600 text-white border-green-600"
                    : "border-gray-300"
                )}
              >
                {checks[item.key] ? "✓" : ""}
              </span>
              {item.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Button
        className="w-full"
        disabled={!allChecked || loading}
        onClick={handleDispatch}
      >
        {loading ? "Despachando..." : "Despachar pedido"}
      </Button>
    </div>
  );
}

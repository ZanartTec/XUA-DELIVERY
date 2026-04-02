"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

interface ReconciliationRow {
  product_name: string;
  sent_qty: number;
  returned_qty: number;
  delta: number;
}

export default function ReconciliationPage() {
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/reconciliations")
      .then((r) => r.json())
      .then((data) => setRows(data.rows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetch("/api/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
    } catch {
      // handle silently
    } finally {
      setSubmitting(false);
    }
  }

  function updateRow(index: number, field: "returned_qty", value: number) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, [field]: value, delta: row.sent_qty - value }
          : row
      )
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-foreground">Conciliação de Estoque</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="py-3"><div className="h-4 w-48 rounded bg-muted" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Conciliação de Estoque</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Saídas vs Retornos</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 font-medium">Produto</th>
                <th className="py-2 font-medium text-center">Saíram</th>
                <th className="py-2 font-medium text-center">Retornaram</th>
                <th className="py-2 font-medium text-center">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2">{row.product_name}</td>
                  <td className="py-2 text-center">{row.sent_qty}</td>
                  <td className="py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      value={row.returned_qty}
                      onChange={(e) =>
                        updateRow(i, "returned_qty", parseInt(e.target.value) || 0)
                      }
                      className="w-16 text-center border rounded px-1 py-0.5"
                    />
                  </td>
                  <td
                    className={`py-2 text-center font-medium ${
                      row.delta > 0 ? "text-red-600" : row.delta < 0 ? "text-amber-600" : "text-green-600"
                    }`}
                  >
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Button className="w-full" disabled={submitting} onClick={handleSubmit}>
        {submitting ? "Enviando..." : "Confirmar conciliação"}
      </Button>
    </div>
  );
}

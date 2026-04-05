"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";

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
    fetch("/api/ops/reconciliations")
      .then((r) => r.json())
      .then((data) => setRows(data.rows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetch("/api/ops/reconciliations", {
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
        <h1 className="text-lg font-bold font-heading text-foreground">Conciliação de Estoque</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading text-foreground">Conciliação de Estoque</h1>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Saídas vs Retornos</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ borderBottom: "1px solid #e1e3e4" }}>
                <th className="py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Produto</th>
                <th className="py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground text-center">Saíram</th>
                <th className="py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground text-center">Retornaram</th>
                <th className="py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground text-center">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e1e3e4" }}>
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
                      className="w-16 text-center rounded-lg border-0 bg-[#e1e3e4] px-1 py-0.5"
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
        </div>
      </div>

      <Button className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]" disabled={submitting} onClick={handleSubmit}>
        {submitting ? "Enviando..." : "Confirmar conciliação"}
      </Button>
    </div>
  );
}

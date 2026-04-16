"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { AuditEventType } from "@/src/types/enums";

const EVENT_TYPES = Object.values(AuditEventType);

export default function AuditExportPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (eventType) params.append("eventTypes[]", eventType);

      const res = await fetch(`/api/ops/audit/export?${params.toString()}`);
      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading">Exportar Auditoria</h1>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
        <p className="text-sm font-semibold font-heading">Filtros</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data início</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data fim</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de evento</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full rounded-xl border-0 bg-[#e1e3e4] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <Button className="w-full rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] font-semibold shadow-none active:scale-[0.98]" disabled={loading} onClick={handleExport}>
          {loading ? "Exportando..." : "Baixar CSV"}
        </Button>
      </div>
    </div>
  );
}

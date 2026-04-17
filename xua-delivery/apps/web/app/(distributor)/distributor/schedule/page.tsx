"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

type WeekdayConfig = {
  weekday: number;
  is_active: boolean;
  lead_time_hours: number;
};

type BlockedDate = {
  id: string;
  blocked_date: string;
  reason: string | null;
};

type ScheduleConfig = {
  weekdays: WeekdayConfig[];
  blocked_dates: BlockedDate[];
};

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

const DEFAULT_LEAD_TIME = 2;

function buildDefaultWeekdays(existing: WeekdayConfig[]): WeekdayConfig[] {
  const byWeekday = new Map(existing.map((w) => [w.weekday, w]));
  return Array.from({ length: 7 }, (_, i) =>
    byWeekday.get(i) ?? {
      weekday: i,
      is_active: true,
      lead_time_hours: DEFAULT_LEAD_TIME,
    },
  );
}

export default function DistributorSchedulePage() {
  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<WeekdayConfig[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  // Resolve distributor_id do usuário autenticado via /api/auth/me
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const id = data?.consumer?.distributor_id ?? null;
        setDistributorId(id);
        if (!id) setLoading(false);
      })
      .catch(() => {
        setDistributorId(null);
        setLoading(false);
      });
  }, []);

  const loadConfig = useCallback(async () => {
    if (!distributorId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/distributor/schedule/${distributorId}`);
      if (!res.ok) throw new Error("Erro ao carregar agenda");
      const data: ScheduleConfig = await res.json();
      setWeekdays(buildDefaultWeekdays(data.weekdays ?? []));
      setBlockedDates(data.blocked_dates ?? []);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao carregar" });
      setWeekdays(buildDefaultWeekdays([]));
    } finally {
      setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const toggleActive = (weekday: number) => {
    setWeekdays((prev) =>
      prev.map((w) => (w.weekday === weekday ? { ...w, is_active: !w.is_active } : w)),
    );
  };

  const changeLeadTime = (weekday: number, value: string) => {
    const n = Number.parseInt(value, 10);
    const safe = Number.isFinite(n) ? Math.max(0, Math.min(72, n)) : 0;
    setWeekdays((prev) =>
      prev.map((w) => (w.weekday === weekday ? { ...w, lead_time_hours: safe } : w)),
    );
  };

  const saveWeekdays = async () => {
    if (!distributorId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/distributor/schedule/${distributorId}/weekdays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekdays }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage({ type: "success", text: "Agenda semanal salva" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const addBlockedDate = async () => {
    if (!distributorId || !newBlockDate) return;
    setAddingBlock(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/distributor/schedule/${distributorId}/block-date`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocked_date: newBlockDate,
          reason: newBlockReason || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setNewBlockDate("");
      setNewBlockReason("");
      await loadConfig();
      setMessage({ type: "success", text: "Data bloqueada" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao bloquear" });
    } finally {
      setAddingBlock(false);
    }
  };

  const removeBlockedDate = async (date: string) => {
    if (!distributorId) return;
    setMessage(null);
    try {
      const res = await fetch(
        `/api/distributor/schedule/${distributorId}/block-date/${date}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadConfig();
      setMessage({ type: "success", text: "Data desbloqueada" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erro" });
    }
  };

  const sortedBlocked = useMemo(
    () => [...blockedDates].sort((a, b) => a.blocked_date.localeCompare(b.blocked_date)),
    [blockedDates],
  );

  if (!distributorId) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-sm text-[#737688]">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          "Usuário não vinculado a nenhuma distribuidora"
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#191c1d] font-heading">Agenda</h1>
          <p className="text-xs text-[#737688]">
            Configure os dias operacionais e datas bloqueadas
          </p>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-sm flex items-center gap-2",
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {message.type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Weekdays grid */}
      <section className="rounded-2xl border border-[#e1e3e4] bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#191c1d]">Dias operacionais</h2>
          <Button
            size="sm"
            onClick={saveWeekdays}
            disabled={saving || loading}
            className="bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[#f0f2f4] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {weekdays.map((w) => (
              <div
                key={w.weekday}
                className="flex items-center gap-3 rounded-lg border border-[#e1e3e4] p-3"
              >
                <button
                  type="button"
                  onClick={() => toggleActive(w.weekday)}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    w.is_active ? "bg-primary" : "bg-[#c4c6cf]",
                  )}
                  aria-label={`Toggle ${WEEKDAY_LABELS[w.weekday]}`}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                      w.is_active ? "translate-x-5" : "translate-x-0.5",
                    )}
                  />
                </button>
                <span className="flex-1 text-sm font-medium text-[#191c1d]">
                  {WEEKDAY_LABELS[w.weekday]}
                </span>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`lead-${w.weekday}`}
                    className="text-[10px] uppercase tracking-wider text-[#737688]"
                  >
                    Lead time (h)
                  </label>
                  <input
                    id={`lead-${w.weekday}`}
                    type="number"
                    min={0}
                    max={72}
                    value={w.lead_time_hours}
                    disabled={!w.is_active}
                    onChange={(e) => changeLeadTime(w.weekday, e.target.value)}
                    className="w-16 rounded-md border border-[#e1e3e4] px-2 py-1 text-sm text-[#191c1d] disabled:bg-[#f0f2f4] disabled:text-[#c4c6cf] focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Blocked dates */}
      <section className="rounded-2xl border border-[#e1e3e4] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#191c1d] mb-3">Datas bloqueadas</h2>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="date"
            value={newBlockDate}
            onChange={(e) => setNewBlockDate(e.target.value)}
            className="rounded-lg border border-[#e1e3e4] px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <input
            type="text"
            placeholder="Motivo (opcional)"
            value={newBlockReason}
            onChange={(e) => setNewBlockReason(e.target.value)}
            maxLength={200}
            className="flex-1 rounded-lg border border-[#e1e3e4] px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <Button
            size="sm"
            onClick={addBlockedDate}
            disabled={!newBlockDate || addingBlock}
            className="bg-primary text-white"
          >
            {addingBlock ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Bloquear
              </>
            )}
          </Button>
        </div>

        {sortedBlocked.length === 0 ? (
          <p className="text-xs text-[#737688]">Nenhuma data bloqueada</p>
        ) : (
          <ul className="divide-y divide-[#e1e3e4]">
            {sortedBlocked.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#191c1d]">{b.blocked_date}</p>
                  {b.reason && (
                    <p className="text-xs text-[#737688] truncate">{b.reason}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeBlockedDate(b.blocked_date)}
                  className="p-2 rounded-lg hover:bg-[#f0f2f4] text-[#737688] hover:text-red-500 transition-colors"
                  aria-label="Remover bloqueio"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

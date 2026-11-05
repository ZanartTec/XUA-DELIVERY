"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarOff, Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Switch } from "@/src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { isoDayToDate, todayIso } from "@/src/lib/datetime";
import { cn } from "@/src/lib/utils";
import type { DeliveryWindow } from "@xua/shared/enums";

type WeekdayConfig = { weekday: number; is_active: boolean; lead_time_hours: number };
type BlockedDate = { id: string; blocked_date: string; reason: string | null };
type TimeSlotConfig = {
  id: string;
  label: string;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  window: DeliveryWindow;
  is_active: boolean;
  sort_order: number;
};

const WEEKDAY_LABELS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DEFAULT_LEAD_TIME = 2;
const pad = (n: number) => String(n).padStart(2, "0");

function buildDefaultWeekdays(existing: WeekdayConfig[]): WeekdayConfig[] {
  const byWeekday = new Map(existing.map((w) => [w.weekday, w]));
  // Segunda primeiro: é como a operação lê a semana.
  return [1, 2, 3, 4, 5, 6, 0].map((i) => byWeekday.get(i) ?? { weekday: i, is_active: true, lead_time_hours: DEFAULT_LEAD_TIME });
}

async function request(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Erro ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

export default function DistributorSchedulePage() {
  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [weekdays, setWeekdays] = useState<WeekdayConfig[]>([]);
  const [savedWeekdays, setSavedWeekdays] = useState<string>("");
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [blockOpen, setBlockOpen] = useState(false);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  const [slotOpen, setSlotOpen] = useState(false);
  const [slotForm, setSlotForm] = useState({ label: "", start: "08:00", end: "10:00", window: "MORNING" as DeliveryWindow });
  const [savingSlot, setSavingSlot] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setDistributorId(data?.consumer?.distributor_id ?? null))
      .catch(() => setDistributorId(null))
      .finally(() => setResolved(true));
  }, []);

  const base = distributorId ? `/api/distributor/schedule/${distributorId}` : null;

  const loadConfig = useCallback(async () => {
    if (!base) return;
    try {
      const data = await request(base);
      const list = buildDefaultWeekdays(data.weekdays ?? []);
      setWeekdays(list);
      setSavedWeekdays(JSON.stringify(list));
      setBlockedDates(data.blocked_dates ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar a agenda");
      setWeekdays(buildDefaultWeekdays([]));
    } finally {
      setLoading(false);
    }
  }, [base]);

  const loadTimeSlots = useCallback(async () => {
    if (!base) return;
    try {
      const data = await request(`${base}/time-slots`);
      setTimeSlots(data.slots ?? []);
    } catch {
      // sem horários configurados
    }
  }, [base]);

  useEffect(() => {
    void loadConfig();
    void loadTimeSlots();
  }, [loadConfig, loadTimeSlots]);

  const dirty = JSON.stringify(weekdays) !== savedWeekdays;

  function updateDay(weekday: number, patch: Partial<WeekdayConfig>) {
    setWeekdays((prev) => prev.map((w) => (w.weekday === weekday ? { ...w, ...patch } : w)));
  }

  async function saveWeekdays() {
    if (!base) return;
    setSaving(true);
    try {
      await request(`${base}/weekdays`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekdays }) });
      setSavedWeekdays(JSON.stringify(weekdays));
      toast.success("Dias de entrega salvos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function addBlockedDate() {
    if (!base || !newBlockDate) return;
    setAddingBlock(true);
    try {
      await request(`${base}/block-date`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked_date: newBlockDate, reason: newBlockReason.trim() || undefined }),
      });
      setNewBlockDate("");
      setNewBlockReason("");
      setBlockOpen(false);
      await loadConfig();
      toast.success("Data bloqueada para entregas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao bloquear");
    } finally {
      setAddingBlock(false);
    }
  }

  async function removeBlockedDate(date: string) {
    if (!base) return;
    try {
      await request(`${base}/block-date/${date}`, { method: "DELETE" });
      await loadConfig();
      toast.success("Data liberada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function addTimeSlot() {
    if (!base || !slotForm.label.trim()) return;
    const [sh, sm] = slotForm.start.split(":").map(Number);
    const [eh, em] = slotForm.end.split(":").map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      toast.error("O fim precisa ser depois do início.");
      return;
    }
    setSavingSlot(true);
    try {
      await request(`${base}/time-slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: slotForm.label.trim(), start_hour: sh, start_minute: sm, end_hour: eh, end_minute: em, window: slotForm.window }),
      });
      setSlotForm({ label: "", start: "08:00", end: "10:00", window: "MORNING" });
      setSlotOpen(false);
      await loadTimeSlots();
      toast.success("Horário adicionado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSavingSlot(false);
    }
  }

  async function toggleSlot(slotId: string, isActive: boolean) {
    if (!base) return;
    setTimeSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, is_active: isActive } : s)));
    try {
      await request(`${base}/time-slots/${slotId}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
      await loadTimeSlots();
    }
  }

  async function deleteSlot(slotId: string) {
    if (!base) return;
    try {
      await request(`${base}/time-slots/${slotId}`, { method: "DELETE" });
      await loadTimeSlots();
      toast.success("Horário removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  const sortedBlocked = useMemo(() => [...blockedDates].sort((a, b) => a.blocked_date.localeCompare(b.blocked_date)), [blockedDates]);
  const [tab, setTab] = useState("dias");

  if (resolved && !distributorId) {
    return <EmptyState icon={CalendarOff} title="Usuário não vinculado a nenhuma distribuidora" />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Agenda" description="Quando você entrega e com quanta antecedência." sticky>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-11 w-full">
            <TabsTrigger value="dias" className="h-9">Dias</TabsTrigger>
            <TabsTrigger value="horarios" className="h-9">Horários</TabsTrigger>
            <TabsTrigger value="folgas" className="h-9">Folgas</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab} className="px-4 pb-4">
        <TabsContent value="dias" className="mt-0 space-y-2">
          <p className="text-sm text-muted-foreground">
            Antecedência mínima: quantas horas antes da entrega o cliente ainda pode pedir para aquele dia.
          </p>
          {loading ? (
            <Skeleton className="h-80 rounded-2xl" />
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
              {weekdays.map((w) => (
                <li key={w.weekday} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Switch id={`day-${w.weekday}`} checked={w.is_active} onCheckedChange={(v) => updateDay(w.weekday, { is_active: v })} />
                  <Label htmlFor={`day-${w.weekday}`} className={cn("min-w-28 flex-1 text-sm font-medium", !w.is_active && "text-muted-foreground")}>
                    {WEEKDAY_LABELS[w.weekday]}
                    {!w.is_active ? <span className="ml-1 font-normal">· sem entrega</span> : null}
                  </Label>
                  {w.is_active ? (
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`lead-${w.weekday}`} className="text-xs font-normal text-muted-foreground">
                        Antecedência
                      </Label>
                      <div className="relative">
                        <Input
                          id={`lead-${w.weekday}`}
                          type="number"
                          min={0}
                          max={72}
                          inputMode="numeric"
                          value={w.lead_time_hours}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10);
                            updateDay(w.weekday, { lead_time_hours: Number.isFinite(n) ? Math.max(0, Math.min(72, n)) : 0 });
                          }}
                          className="h-10 w-20 pr-7 text-right"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">h</span>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="horarios" className="mt-0 space-y-2">
          <p className="text-sm text-muted-foreground">Sem horários, o cliente escolhe só Manhã ou Tarde.</p>
          {timeSlots.length === 0 ? (
            <EmptyState icon={Clock} title="Nenhum horário configurado" description="Usando Manhã e Tarde como padrão." />
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
              {timeSlots.map((slot) => (
                <li key={slot.id} className={cn("flex items-center gap-3 px-4 py-3", !slot.is_active && "bg-surface-low")}>
                  <Switch
                    checked={slot.is_active}
                    onCheckedChange={(v) => toggleSlot(slot.id, v)}
                    aria-label={`${slot.is_active ? "Desativar" : "Ativar"} ${slot.label}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", slot.is_active ? "text-foreground" : "text-muted-foreground")}>{slot.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {pad(slot.start_hour)}:{pad(slot.start_minute)} – {pad(slot.end_hour)}:{pad(slot.end_minute)} · {slot.window === "MORNING" ? "Manhã" : "Tarde"}
                    </p>
                  </div>
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon-touch" aria-label={`Excluir horário ${slot.label}`}>
                        <Trash2 />
                      </Button>
                    }
                    title={`Excluir “${slot.label}”?`}
                    description="Clientes não poderão mais escolher esse horário. Pedidos já feitos não mudam."
                    confirmLabel="Excluir"
                    destructive
                    onConfirm={() => deleteSlot(slot.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="folgas" className="mt-0 space-y-2">
          <p className="text-sm text-muted-foreground">Feriados e dias sem operação: ninguém consegue agendar entrega neles.</p>
          {sortedBlocked.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Nenhuma data bloqueada" />
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
              {sortedBlocked.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground first-letter:uppercase">
                      {isoDayToDate(b.blocked_date).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                    </p>
                    {b.reason ? <p className="truncate text-xs text-muted-foreground">{b.reason}</p> : null}
                  </div>
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon-touch" aria-label="Liberar data">
                        <Trash2 />
                      </Button>
                    }
                    title="Liberar esta data?"
                    description="Clientes voltam a poder agendar entregas nesse dia."
                    confirmLabel="Liberar"
                    onConfirm={() => removeBlockedDate(b.blocked_date.slice(0, 10))}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <StickyActionBar>
        {tab === "dias" ? (
          <Button variant="cta" size="xl" disabled={!dirty || saving || loading} onClick={saveWeekdays}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {dirty ? "Salvar dias" : "Dias salvos"}
          </Button>
        ) : tab === "horarios" ? (
          <Button variant="cta" size="xl" onClick={() => setSlotOpen(true)}>
            <Plus aria-hidden /> Novo horário
          </Button>
        ) : (
          <Button variant="cta" size="xl" onClick={() => setBlockOpen(true)}>
            <Plus aria-hidden /> Bloquear data
          </Button>
        )}
      </StickyActionBar>

      <ResponsiveDialog
        open={slotOpen}
        onOpenChange={setSlotOpen}
        title="Novo horário de entrega"
        footer={
          <Button variant="cta" size="xl" disabled={!slotForm.label.trim() || savingSlot} onClick={addTimeSlot}>
            {savingSlot ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Adicionar horário
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="slot-label">Nome que o cliente vê</Label>
            <Input id="slot-label" value={slotForm.label} onChange={(e) => setSlotForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex.: Início da manhã" className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="slot-start">Das</Label>
              <Input id="slot-start" type="time" step={900} value={slotForm.start} onChange={(e) => setSlotForm((f) => ({ ...f, start: e.target.value }))} className="h-11" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="slot-end">Até</Label>
              <Input id="slot-end" type="time" step={900} value={slotForm.end} onChange={(e) => setSlotForm((f) => ({ ...f, end: e.target.value }))} className="h-11" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Período</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={slotForm.window}
              onValueChange={(v) => v && setSlotForm((f) => ({ ...f, window: v as DeliveryWindow }))}
              className="grid w-full grid-cols-2"
            >
              <ToggleGroupItem value="MORNING" className="h-11">Manhã</ToggleGroupItem>
              <ToggleGroupItem value="AFTERNOON" className="h-11">Tarde</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title="Bloquear data"
        description="Nenhuma entrega poderá ser agendada nesse dia."
        footer={
          <Button variant="cta" size="xl" disabled={!newBlockDate || addingBlock} onClick={addBlockedDate}>
            {addingBlock ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Bloquear data
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="block-date">Data</Label>
            <Input id="block-date" type="date" min={todayIso()} value={newBlockDate} onChange={(e) => setNewBlockDate(e.target.value)} className="h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="block-reason">
              Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input id="block-reason" value={newBlockReason} onChange={(e) => setNewBlockReason(e.target.value)} maxLength={200} placeholder="Ex.: Feriado municipal" className="h-11" />
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

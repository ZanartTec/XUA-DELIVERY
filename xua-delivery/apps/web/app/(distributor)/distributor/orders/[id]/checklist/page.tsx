"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { api } from "@/src/lib/api-client";
import { useSocket } from "@/src/hooks/use-socket";
import { OrderStatus } from "@xua/shared/enums";

const CHECKLIST_ITEMS = [
  { key: "items_checked", label: "Itens do pedido separados e conferidos" },
  { key: "empties_prepared", label: "Vasilhames vazios preparados para retirada" },
  { key: "address_contact_confirmed", label: "Endereço e contato do cliente confirmados" },
];

type Driver = { id: string; name: string };
type DriversResponse = { drivers?: Driver[] };
type OrderDetailResponse = { order?: { driver_id?: string | null; status?: string } | null };

export default function ChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const { on, off } = useSocket();

  const loadChecklistContext = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      try {
        const [driversData, orderData] = await Promise.all([
          api.get<DriversResponse>("/api/distributor/drivers"),
          api.get<OrderDetailResponse>(`/api/orders/${id}`),
        ]);

        if (isCancelled()) return;
        setDrivers(driversData.drivers ?? []);
        setSelectedDriver(orderData.order?.driver_id ?? "");
        setOrderStatus(orderData.order?.status ?? null);
        setError(null);
      } catch (err) {
        if (!isCancelled()) {
          setError(`Não foi possível carregar dados do checklist: ${err instanceof Error ? err.message : "erro desconhecido"}`);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    let cancelled = false;

    void loadChecklistContext(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [loadChecklistContext]);

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const data = args[0];
      if (typeof data === "object" && data !== null && "orderId" in data && data.orderId === id) {
        void loadChecklistContext();
      }
    };

    on("order_status_changed", handler);
    return () => off("order_status_changed", handler);
  }, [id, loadChecklistContext, off, on]);

  function toggle(key: string) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const allChecked = CHECKLIST_ITEMS.every((item) => checks[item.key]);
  const progress = CHECKLIST_ITEMS.filter((item) => checks[item.key]).length;
  const blockedByStatus = orderStatus !== null && orderStatus !== OrderStatus.ACCEPTED_BY_DISTRIBUTOR;
  const canDispatch = allChecked && selectedDriver !== "" && orderStatus === OrderStatus.ACCEPTED_BY_DISTRIBUTOR;

  async function handleDispatch() {
    setLoading(true);
    setError(null);
    try {
      await api.patch(`/api/orders/${id}`, { action: "dispatch_with_checklist", driver_id: selectedDriver });

      router.push("/distributor/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading">Checklist — Pedido #{id}</h1>

      <div className="w-full bg-[#e1e3e4] rounded-full h-2">
        <div
          className="bg-[#00E0FF] h-2 rounded-full transition-all"
          style={{ width: `${(progress / CHECKLIST_ITEMS.length) * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">
        {progress}/{CHECKLIST_ITEMS.length} itens
      </p>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3">
        <p className="text-sm font-semibold font-heading">Verificações</p>
        {CHECKLIST_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => toggle(item.key)}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl p-3 text-sm text-left transition-all",
              checks[item.key]
                ? "bg-green-50 shadow-[0_2px_8px_rgba(34,197,94,0.15)]"
                : "bg-[#e1e3e4]/50 hover:bg-[#e1e3e4]"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded text-xs font-bold",
                checks[item.key]
                  ? "bg-green-600 text-white"
                  : "bg-white text-muted-foreground/30"
              )}
            >
              {checks[item.key] ? "✓" : ""}
            </span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-2">
        <p className="text-sm font-semibold font-heading">Motorista</p>
        <select
          value={selectedDriver}
          onChange={(e) => setSelectedDriver(e.target.value)}
          disabled={blockedByStatus}
          className="w-full rounded-xl border border-[#e1e3e4] bg-[#f5f6f7] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Selecione o motorista...</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {drivers.length === 0 && !error && (
          <p className="text-xs text-amber-700">
            Nenhum motorista ativo foi encontrado para esta distribuidora. O despacho permanece bloqueado.
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 rounded-xl bg-red-50 px-3 py-2">{error}</p>
      )}

      {blockedByStatus && !error && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Este pedido nao esta mais aguardando checklist. Volte para a fila para ver o status atual.
        </p>
      )}

      <Button
        className="w-full rounded-xl bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]"
        disabled={!canDispatch || loading}
        onClick={handleDispatch}
      >
        {loading ? "Despachando..." : "Despachar pedido"}
      </Button>
    </div>
  );
}


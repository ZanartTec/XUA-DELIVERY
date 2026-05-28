"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  History,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import type { InventoryItemType, InventoryMovementType } from "@xua/shared/enums";
import { INVENTORY_ITEM_TYPE_VALUES } from "@xua/shared/enums";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { ApiError, api } from "@/src/lib/api-client";
import {
  buildInventoryQuery,
  formatInventoryQuantity,
  INVENTORY_ITEM_TYPE_LABEL,
  INVENTORY_MOVEMENT_LABEL,
  type ItemTypeFilter,
  type StockStatusFilter,
} from "@/src/lib/inventory-ui";
import { cn, formatDate, formatTime } from "@/src/lib/utils";

interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  type: InventoryItemType;
  product_id: string | null;
  unit_label: string;
  low_stock_threshold: number | null;
  is_active: boolean;
}

interface InventoryBalance {
  id: string;
  inventory_item_id: string;
  item: Pick<InventoryItem, "id" | "code" | "name" | "type" | "unit_label">;
  quantity_on_hand: number;
  low_stock_threshold: number | null;
  is_low_stock: boolean;
  last_movement_at: string | null;
  updated_at: string;
}

interface InventoryMovement {
  id: string;
  inventory_item_id: string;
  item: Pick<InventoryItem, "id" | "code" | "name" | "type" | "unit_label">;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  reference_type: string | null;
  reference_id: string | null;
  occurred_at: string;
}

interface BalanceResponse {
  balances: InventoryBalance[];
  pagination: Pagination;
}

interface MovementResponse {
  movements: InventoryMovement[];
  pagination: Pagination;
}

interface ItemResponse {
  items: InventoryItem[];
  pagination: Pagination;
}

function createBatchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(char) / 4)))).toString(16)
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
      <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]"
        />
      ))}
    </div>
  );
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export default function DistributorInventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<ItemTypeFilter>("ALL");
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>("ALL");
  const [balanceOffset, setBalanceOffset] = useState(0);
  const [movementOffset, setMovementOffset] = useState(0);
  const [movementItemId, setMovementItemId] = useState("ALL");
  const [loadObservation, setLoadObservation] = useState("");
  const [loadQuantities, setLoadQuantities] = useState<Record<string, string>>({});
  const deferredSearch = useDeferredValue(search);

  const itemsQuery = useQuery<ItemResponse>({
    queryKey: ["distributor-inventory-items"],
    queryFn: () => api.get(`/api/distributor/inventory/items?is_active=true&limit=100&offset=0`),
  });

  const balancesQuery = useQuery<BalanceResponse>({
    queryKey: ["distributor-inventory-balances", deferredSearch, itemType, stockStatus, balanceOffset],
    queryFn: () => {
      const query = buildInventoryQuery({
        q: deferredSearch.trim() || undefined,
        item_type: itemType === "ALL" ? undefined : itemType,
        stock_status: stockStatus === "ALL" ? undefined : stockStatus,
        limit: "20",
        offset: String(balanceOffset),
      });
      return api.get(`/api/distributor/inventory/balances?${query}`);
    },
  });

  const movementsQuery = useQuery<MovementResponse>({
    queryKey: ["distributor-inventory-movements", movementItemId, movementOffset],
    queryFn: () => {
      const query = buildInventoryQuery({
        inventory_item_id: movementItemId === "ALL" ? undefined : movementItemId,
        limit: "10",
        offset: String(movementOffset),
      });
      return api.get(`/api/distributor/inventory/movements?${query}`);
    },
  });

  const initialLoadMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.post<{
        applied_count: number;
        replayed_count: number;
        skipped_count: number;
      }>("/api/distributor/inventory/initial-load", payload),
    onSuccess: (result) => {
      setLoadQuantities({});
      setLoadObservation("");
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-balances"] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-movements"] });
      toast.success(
        `Carga registrada: ${result.applied_count} aplicado(s), ${result.replayed_count} repetido(s), ${result.skipped_count} zerado(s)`
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Erro ao registrar carga inicial")),
  });

  const balances = balancesQuery.data?.balances ?? [];
  const movements = movementsQuery.data?.movements ?? [];
  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data?.items]);
  const lowStockCount = balances.filter((balance) => balance.is_low_stock).length;
  const totalQuantity = balances.reduce((sum, balance) => sum + balance.quantity_on_hand, 0);
  const hasNextBalances = Boolean(
    balancesQuery.data && balanceOffset + balancesQuery.data.pagination.limit < balancesQuery.data.pagination.total
  );
  const hasNextMovements = Boolean(
    movementsQuery.data && movementOffset + movementsQuery.data.pagination.limit < movementsQuery.data.pagination.total
  );

  const initialLoadItems = useMemo(
    () =>
      items
        .map((item) => ({
          inventory_item_id: item.id,
          quantity: Number(loadQuantities[item.id] ?? 0),
        }))
        .filter((item) => item.quantity > 0),
    [items, loadQuantities]
  );

  function submitInitialLoad() {
    const invalid = Object.values(loadQuantities).some((value) => {
      if (!value) return false;
      const parsed = Number(value);
      return !Number.isInteger(parsed) || parsed < 0;
    });

    if (invalid) {
      toast.error("Quantidades devem ser inteiras e não negativas");
      return;
    }

    if (initialLoadItems.length === 0) {
      toast.error("Informe ao menos uma quantidade positiva");
      return;
    }

    initialLoadMutation.mutate({
      batch_id: createBatchId(),
      observation: loadObservation.trim() || undefined,
      items: initialLoadItems,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold font-heading text-foreground">Estoque</h1>
          <p className="text-sm text-muted-foreground">Saldos, alertas e movimentações</p>
        </div>
        <Button asChild size="sm" className="rounded-xl bg-[#00E0FF] text-[#001735] shadow-none hover:bg-[#00E0FF]/90">
          <Link href="/distributor/inventory/reconciliation">
            <SlidersHorizontal className="h-4 w-4" />
            Conciliar
          </Link>
        </Button>
      </div>

      {balancesQuery.isLoading ? (
        <LoadingCards />
      ) : balancesQuery.isError ? (
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-red-100">
          <p className="text-sm font-semibold text-red-700">Erro ao carregar saldos</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => balancesQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Itens com saldo</p>
            <p className="mt-2 text-3xl font-bold text-[#0d1b2f]">{balancesQuery.data?.pagination.total ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantidade total</p>
            <p className="mt-2 text-3xl font-bold text-[#0d1b2f]">{totalQuantity.toLocaleString("pt-BR")}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Baixo estoque</p>
            <p className={cn("mt-2 text-3xl font-bold", lowStockCount > 0 ? "text-red-600" : "text-green-600")}>
              {lowStockCount}
            </p>
          </div>
        </div>
      )}

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setBalanceOffset(0);
              }}
              placeholder="Buscar item ou código"
              className="rounded-xl border-[#d9dde3] pl-9"
            />
          </div>
          <Select
            value={itemType}
            onValueChange={(value) => {
              setItemType(value as ItemTypeFilter);
              setBalanceOffset(0);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-[#d9dde3]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os tipos</SelectItem>
              {INVENTORY_ITEM_TYPE_VALUES.map((type) => (
                <SelectItem key={type} value={type}>
                  {INVENTORY_ITEM_TYPE_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={stockStatus}
            onValueChange={(value) => {
              setStockStatus(value as StockStatusFilter);
              setBalanceOffset(0);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-[#d9dde3]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os status</SelectItem>
              <SelectItem value="LOW_STOCK">Baixo estoque</SelectItem>
              <SelectItem value="OK">Sem alerta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {balancesQuery.isLoading ? (
          <LoadingCards />
        ) : balances.length === 0 ? (
          <EmptyState title="Nenhum saldo encontrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#e1e3e4] text-left">
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limite</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Último movimento</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((balance) => (
                  <tr key={balance.id} className="border-b border-[#e1e3e4] last:border-0">
                    <td className="py-3">
                      <p className="font-semibold text-[#0d1b2f]">{balance.item.name}</p>
                      <p className="text-xs text-muted-foreground">{balance.item.code}</p>
                    </td>
                    <td className="py-3 text-muted-foreground">{INVENTORY_ITEM_TYPE_LABEL[balance.item.type]}</td>
                    <td className="py-3 text-right font-semibold">
                      {formatInventoryQuantity(balance.quantity_on_hand, balance.item.unit_label)}
                    </td>
                    <td className="py-3 text-right text-muted-foreground">
                      {balance.low_stock_threshold == null
                        ? "-"
                        : formatInventoryQuantity(balance.low_stock_threshold, balance.item.unit_label)}
                    </td>
                    <td className="py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                          balance.is_low_stock
                            ? "bg-red-50 text-red-700"
                            : "bg-green-50 text-green-700"
                        )}
                      >
                        {balance.is_low_stock ? (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {balance.is_low_stock ? "Baixo" : "OK"}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {balance.last_movement_at ? `${formatDate(balance.last_movement_at)} ${formatTime(balance.last_movement_at)}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={balanceOffset === 0 || balancesQuery.isFetching}
            onClick={() => setBalanceOffset((offset) => Math.max(0, offset - 20))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {balancesQuery.data ? `${balanceOffset + 1}-${Math.min(balanceOffset + balances.length, balancesQuery.data.pagination.total)} de ${balancesQuery.data.pagination.total}` : "-"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNextBalances || balancesQuery.isFetching}
            onClick={() => setBalanceOffset((offset) => offset + 20)}
          >
            Próxima
          </Button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-sm font-bold text-foreground">Extrato recente</h2>
            </div>
            <Select
              value={movementItemId}
              onValueChange={(value) => {
                setMovementItemId(value);
                setMovementOffset(0);
              }}
            >
              <SelectTrigger className="h-9 w-full rounded-xl border-[#d9dde3] sm:w-56">
                <SelectValue placeholder="Item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os itens</SelectItem>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {movementsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-[#eef0f3]" />
              ))}
            </div>
          ) : movements.length === 0 ? (
            <EmptyState title="Nenhum movimento encontrado" />
          ) : (
            <div className="space-y-2">
              {movements.map((movement) => {
                const positive = movement.quantity_delta > 0;
                const DirectionIcon = positive ? ArrowUp : ArrowDown;
                return (
                  <div key={movement.id} className="flex items-start gap-3 rounded-xl border border-[#e4e8f1] p-3">
                    <span
                      className={cn(
                        "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      )}
                    >
                      <DirectionIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#0d1b2f]">{movement.item.name}</p>
                        <p className={cn("font-bold", positive ? "text-green-700" : "text-red-700")}>
                          {positive ? "+" : ""}{formatInventoryQuantity(movement.quantity_delta, movement.item.unit_label)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {INVENTORY_MOVEMENT_LABEL[movement.movement_type] ?? movement.movement_type} · {formatDate(movement.occurred_at)} {formatTime(movement.occurred_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={movementOffset === 0 || movementsQuery.isFetching}
              onClick={() => setMovementOffset((offset) => Math.max(0, offset - 10))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasNextMovements || movementsQuery.isFetching}
              onClick={() => setMovementOffset((offset) => offset + 10)}
            >
              Próxima
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-sm font-bold text-foreground">Carga inicial</h2>
          </div>

          {itemsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-[#eef0f3]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="Nenhum item ativo" />
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_7rem] items-center gap-3 rounded-xl border border-[#e4e8f1] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0d1b2f]">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.code} · {INVENTORY_ITEM_TYPE_LABEL[item.type]}</p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={loadQuantities[item.id] ?? ""}
                    onChange={(event) =>
                      setLoadQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    placeholder="0"
                    className="h-9 rounded-xl border-[#d9dde3] text-right"
                  />
                </div>
              ))}
            </div>
          )}

          <Textarea
            value={loadObservation}
            onChange={(event) => setLoadObservation(event.target.value)}
            placeholder="Observação"
            className="min-h-20 rounded-xl border-[#d9dde3] bg-white text-sm"
            maxLength={500}
          />
          <Button
            type="button"
            className="w-full rounded-xl bg-[#00E0FF] text-[#001735] shadow-none hover:bg-[#00E0FF]/90"
            disabled={initialLoadMutation.isPending || itemsQuery.isLoading}
            onClick={submitInitialLoad}
          >
            {initialLoadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Registrar carga
          </Button>
        </div>
      </section>
    </div>
  );
}

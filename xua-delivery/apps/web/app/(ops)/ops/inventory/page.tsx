"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  History,
  PackageSearch,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
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
import { api } from "@/src/lib/api-client";
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
  unit_label: string;
  is_active: boolean;
}

interface OpsBalance {
  id: string;
  distributor_id: string;
  distributor_name: string;
  inventory_item_id: string;
  item: Pick<InventoryItem, "id" | "code" | "name" | "type" | "unit_label">;
  quantity_on_hand: number;
  low_stock_threshold: number | null;
  is_low_stock: boolean;
  last_movement_at: string | null;
  updated_at: string;
}

interface OpsMovement {
  id: string;
  distributor_id: string;
  distributor_name: string;
  inventory_item_id: string;
  item: Pick<InventoryItem, "id" | "code" | "name" | "type" | "unit_label">;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  reference_type: string | null;
  reference_id: string | null;
  occurred_at: string;
}

interface BalanceResponse {
  balances: OpsBalance[];
  pagination: Pagination;
}

interface MovementResponse {
  movements: OpsMovement[];
  pagination: Pagination;
}

interface ItemResponse {
  items: InventoryItem[];
  pagination: Pagination;
}

interface DistributorOptionResponse {
  distributors: Array<{ id: string; name: string }>;
}

function dateInput(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
      <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}

export default function OpsInventoryPage() {
  const [search, setSearch] = useState("");
  const [distributorId, setDistributorId] = useState("ALL");
  const [itemId, setItemId] = useState("ALL");
  const [itemType, setItemType] = useState<ItemTypeFilter>("ALL");
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>("ALL");
  const [start, setStart] = useState(dateInput(7));
  const [end, setEnd] = useState(dateInput(0));
  const [balanceOffset, setBalanceOffset] = useState(0);
  const [movementOffset, setMovementOffset] = useState(0);
  const deferredSearch = useDeferredValue(search);

  const itemsQuery = useQuery<ItemResponse>({
    queryKey: ["ops-inventory-items"],
    queryFn: () => api.get("/api/ops/inventory/items?is_active=true&limit=100&offset=0"),
  });

  const distributorOptionsQuery = useQuery<DistributorOptionResponse>({
    queryKey: ["ops-inventory-distributor-options"],
    queryFn: () => api.get("/api/ops/inventory/distributors"),
  });

  const balancesQuery = useQuery<BalanceResponse>({
    queryKey: [
      "ops-inventory-balances",
      deferredSearch,
      distributorId,
      itemId,
      itemType,
      stockStatus,
      balanceOffset,
    ],
    queryFn: () => {
      const query = buildInventoryQuery({
        q: deferredSearch.trim() || undefined,
        distributor_id: distributorId === "ALL" ? undefined : distributorId,
        inventory_item_id: itemId === "ALL" ? undefined : itemId,
        item_type: itemType === "ALL" ? undefined : itemType,
        stock_status: stockStatus === "ALL" ? undefined : stockStatus,
        limit: "20",
        offset: String(balanceOffset),
      });
      return api.get(`/api/ops/inventory/balances?${query}`);
    },
  });

  const movementsQuery = useQuery<MovementResponse>({
    queryKey: ["ops-inventory-movements", distributorId, itemId, start, end, movementOffset],
    queryFn: () => {
      const query = buildInventoryQuery({
        distributor_id: distributorId === "ALL" ? undefined : distributorId,
        inventory_item_id: itemId === "ALL" ? undefined : itemId,
        start,
        end,
        limit: "20",
        offset: String(movementOffset),
      });
      return api.get(`/api/ops/inventory/movements?${query}`);
    },
  });

  const distributorOptions = useMemo(() => {
    return distributorOptionsQuery.data?.distributors ?? [];
  }, [distributorOptionsQuery.data?.distributors]);

  const balances = balancesQuery.data?.balances ?? [];
  const movements = movementsQuery.data?.movements ?? [];
  const lowStockCount = balances.filter((balance) => balance.is_low_stock).length;
  const distributorCount = new Set(balances.map((balance) => balance.distributor_id)).size;
  const hasNextBalances = Boolean(
    balancesQuery.data && balanceOffset + balancesQuery.data.pagination.limit < balancesQuery.data.pagination.total
  );
  const hasNextMovements = Boolean(
    movementsQuery.data && movementOffset + movementsQuery.data.pagination.limit < movementsQuery.data.pagination.total
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold font-heading text-foreground">Estoque</h1>
          <p className="text-sm text-muted-foreground">Saldos globais e extrato operacional</p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          <Link href="/ops/inventory/reconciliations">
            <SlidersHorizontal className="h-4 w-4" />
            Conciliações
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldos filtrados</p>
          <p className="mt-2 text-3xl font-bold text-[#0d1b2f]">{balancesQuery.data?.pagination.total ?? 0}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Distribuidoras</p>
          <p className="mt-2 text-3xl font-bold text-[#0d1b2f]">{distributorCount}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alertas</p>
          <p className={cn("mt-2 text-3xl font-bold", lowStockCount > 0 ? "text-red-600" : "text-green-600")}>
            {lowStockCount}
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
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
            value={distributorId}
            onValueChange={(value) => {
              setDistributorId(value);
              setBalanceOffset(0);
              setMovementOffset(0);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-[#d9dde3]">
              <SelectValue placeholder="Distribuidora" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {distributorOptions.map((distributor) => (
                <SelectItem key={distributor.id} value={distributor.id}>
                  {distributor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={itemId}
            onValueChange={(value) => {
              setItemId(value);
              setBalanceOffset(0);
              setMovementOffset(0);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-[#d9dde3]">
              <SelectValue placeholder="Item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os itens</SelectItem>
              {(itemsQuery.data?.items ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <SelectValue placeholder="Alerta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="LOW_STOCK">Baixo estoque</SelectItem>
              <SelectItem value="OK">Sem alerta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {balancesQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-[#eef0f3]" />
            ))}
          </div>
        ) : balancesQuery.isError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Erro ao carregar saldos</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => balancesQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </Button>
          </div>
        ) : balances.length === 0 ? (
          <EmptyState title="Nenhum saldo encontrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[#e1e3e4] text-left">
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Distribuidora</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limite</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alerta</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((balance) => (
                  <tr key={balance.id} className="border-b border-[#e1e3e4] last:border-0">
                    <td className="py-3 font-semibold text-[#0d1b2f]">{balance.distributor_name}</td>
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
                          balance.is_low_stock ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                        )}
                      >
                        {balance.is_low_stock ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {balance.is_low_stock ? "Baixo" : "OK"}
                      </span>
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

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-sm font-bold text-foreground">Movimentos do período</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              type="date"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                setMovementOffset(0);
              }}
              className="h-9 rounded-xl border-[#d9dde3]"
            />
            <Input
              type="date"
              value={end}
              onChange={(event) => {
                setEnd(event.target.value);
                setMovementOffset(0);
              }}
              className="h-9 rounded-xl border-[#d9dde3]"
            />
          </div>
        </div>

        {movementsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-[#eef0f3]" />
            ))}
          </div>
        ) : movementsQuery.isError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Erro ao carregar movimentos</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => movementsQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </Button>
          </div>
        ) : movements.length === 0 ? (
          <EmptyState title="Nenhum movimento encontrado" />
        ) : (
          <div className="space-y-2">
            {movements.map((movement) => {
              const positive = movement.quantity_delta > 0;
              const DirectionIcon = positive ? ArrowUp : ArrowDown;
              return (
                <div key={movement.id} className="grid gap-3 rounded-xl border border-[#e4e8f1] p-3 md:grid-cols-[2fr_1fr_1fr] md:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      )}
                    >
                      <DirectionIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0d1b2f]">{movement.item.name}</p>
                      <p className="text-xs text-muted-foreground">{movement.distributor_name} · {movement.item.code}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {INVENTORY_MOVEMENT_LABEL[movement.movement_type] ?? movement.movement_type}
                  </p>
                  <div className="text-left md:text-right">
                    <p className={cn("font-bold", positive ? "text-green-700" : "text-red-700")}>
                      {positive ? "+" : ""}{formatInventoryQuantity(movement.quantity_delta, movement.item.unit_label)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(movement.occurred_at)} {formatTime(movement.occurred_at)}</p>
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
            onClick={() => setMovementOffset((offset) => Math.max(0, offset - 20))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {movementsQuery.data ? `${movementOffset + 1}-${Math.min(movementOffset + movements.length, movementsQuery.data.pagination.total)} de ${movementsQuery.data.pagination.total}` : "-"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNextMovements || movementsQuery.isFetching}
            onClick={() => setMovementOffset((offset) => offset + 20)}
          >
            Próxima
          </Button>
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
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
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { addDaysIso, todayIso } from "@/src/lib/datetime";
import { plural } from "@/src/lib/format";
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
import { cn, formatDateShort, formatTime } from "@/src/lib/utils";

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

export default function OpsInventoryPage() {
  const [search, setSearch] = useState("");
  const [distributorId, setDistributorId] = useState("ALL");
  const [itemId, setItemId] = useState("ALL");
  const [itemType, setItemType] = useState<ItemTypeFilter>("ALL");
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>("ALL");
  const [start, setStart] = useState(() => addDaysIso(todayIso(), -7));
  const [end, setEnd] = useState(() => todayIso());
  const [tab, setTab] = useState<"balances" | "movements">("balances");
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // Total de itens abaixo do limite (independe da página atual).
  const lowStockQuery = useQuery<BalanceResponse>({
    queryKey: ["ops-inventory-low-stock", distributorId, itemId, itemType],
    queryFn: () =>
      api.get(
        `/api/ops/inventory/balances?${buildInventoryQuery({
          distributor_id: distributorId === "ALL" ? undefined : distributorId,
          inventory_item_id: itemId === "ALL" ? undefined : itemId,
          item_type: itemType === "ALL" ? undefined : itemType,
          stock_status: "LOW_STOCK",
          limit: "1",
          offset: "0",
        })}`,
      ),
  });
  const lowStockTotal = lowStockQuery.data?.pagination.total ?? 0;

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

  const distributorOptions = distributorOptionsQuery.data?.distributors ?? [];
  const balances = balancesQuery.data?.balances ?? [];
  const movements = movementsQuery.data?.movements ?? [];
  const activeFilters = [distributorId, itemId, itemType, stockStatus].filter((v) => v !== "ALL").length;

  function resetPages() {
    setBalanceOffset(0);
    setMovementOffset(0);
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Estoque da rede"
        description="Saldos e movimentos de todas as distribuidoras."
        sticky
        actions={
          <Button asChild variant="soft" size="sm">
            <Link href="/ops/inventory/reconciliations">
              <ClipboardCheck aria-hidden /> Conferências
            </Link>
          </Button>
        }
      >
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setBalanceOffset(0);
                }}
                placeholder="Buscar item ou código"
                aria-label="Buscar item"
                className="h-11 rounded-xl pl-9"
              />
            </div>
            <Button variant="outline" className="relative h-11 rounded-xl" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal aria-hidden />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilters > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {activeFilters}
                </span>
              ) : null}
            </Button>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "balances" | "movements")}>
            <TabsList className="grid h-10 w-full grid-cols-2">
              <TabsTrigger value="balances">Saldos{balancesQuery.data ? ` (${balancesQuery.data.pagination.total})` : ""}</TabsTrigger>
              <TabsTrigger value="movements">Movimentos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </PageHeader>

      <div className="space-y-3 px-4 pb-4">
        {tab === "balances" ? (
          <>
            {stockStatus === "ALL" && lowStockTotal > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setStockStatus("LOW_STOCK");
                  setBalanceOffset(0);
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-left text-sm"
              >
                <AlertTriangle className="size-5 shrink-0 text-warning-foreground" aria-hidden />
                <span className="flex-1">
                  <strong>{plural(lowStockTotal, "item abaixo", "itens abaixo")}</strong> do limite. Ver só esses
                </span>
              </button>
            ) : null}

            {balancesQuery.isLoading ? (
              <Skeleton className="h-64 rounded-2xl" />
            ) : balancesQuery.isError ? (
              <LoadError label="saldos" onRetry={() => balancesQuery.refetch()} />
            ) : balances.length === 0 ? (
              <EmptyState icon={PackageSearch} title="Nenhum saldo encontrado" description={activeFilters || search ? "Tente limpar os filtros." : undefined} />
            ) : (
              <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                {balances.map((balance) => (
                  <li key={balance.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{balance.item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {balance.distributor_name} · {INVENTORY_ITEM_TYPE_LABEL[balance.item.type]}
                        {balance.low_stock_threshold != null
                          ? ` · limite ${formatInventoryQuantity(balance.low_stock_threshold, balance.item.unit_label)}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("font-heading text-lg font-bold tabular-nums", balance.is_low_stock ? "text-destructive" : "text-ink")}>
                        {formatInventoryQuantity(balance.quantity_on_hand, balance.item.unit_label)}
                      </p>
                      {balance.is_low_stock ? <StatusBadge label="Baixo" tone="danger" className="h-5 px-2 text-[11px]" /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Pager
              offset={balanceOffset}
              count={balances.length}
              total={balancesQuery.data?.pagination.total}
              busy={balancesQuery.isFetching}
              onChange={setBalanceOffset}
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0 space-y-1.5">
                <span className="text-sm font-medium">De</span>
                <Input
                  type="date"
                  value={start}
                  max={end}
                  onChange={(event) => {
                    setStart(event.target.value);
                    setMovementOffset(0);
                  }}
                  className="h-11 w-full min-w-0 rounded-xl"
                />
              </label>
              <label className="min-w-0 space-y-1.5">
                <span className="text-sm font-medium">Até</span>
                <Input
                  type="date"
                  value={end}
                  min={start}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setMovementOffset(0);
                  }}
                  className="h-11 w-full min-w-0 rounded-xl"
                />
              </label>
            </div>

            {movementsQuery.isLoading ? (
              <Skeleton className="h-64 rounded-2xl" />
            ) : movementsQuery.isError ? (
              <LoadError label="movimentos" onRetry={() => movementsQuery.refetch()} />
            ) : movements.length === 0 ? (
              <EmptyState icon={History} title="Nenhum movimento no período" />
            ) : (
              <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                {movements.map((movement) => {
                  const positive = movement.quantity_delta > 0;
                  const DirectionIcon = positive ? ArrowUp : ArrowDown;
                  return (
                    <li key={movement.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl",
                          positive ? "bg-success/10 text-success-foreground" : "bg-danger-surface text-destructive",
                        )}
                      >
                        <DirectionIcon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{movement.item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {INVENTORY_MOVEMENT_LABEL[movement.movement_type] ?? movement.movement_type} · {movement.distributor_name}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("font-semibold tabular-nums", positive ? "text-success-foreground" : "text-destructive")}>
                          {positive ? "+" : ""}
                          {formatInventoryQuantity(movement.quantity_delta, movement.item.unit_label)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(movement.occurred_at)} {formatTime(movement.occurred_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Pager
              offset={movementOffset}
              count={movements.length}
              total={movementsQuery.data?.pagination.total}
              busy={movementsQuery.isFetching}
              onChange={setMovementOffset}
            />
          </>
        )}
      </div>

      <ResponsiveDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filtros"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="xl"
              className="flex-1"
              disabled={activeFilters === 0}
              onClick={() => {
                setDistributorId("ALL");
                setItemId("ALL");
                setItemType("ALL");
                setStockStatus("ALL");
                resetPages();
              }}
            >
              Limpar
            </Button>
            <Button variant="cta" size="xl" className="flex-1" onClick={() => setFiltersOpen(false)}>
              Ver resultados
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FilterSelect
            label="Distribuidora"
            value={distributorId}
            onChange={(v) => {
              setDistributorId(v);
              resetPages();
            }}
            options={[{ value: "ALL", label: "Todas" }, ...distributorOptions.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <FilterSelect
            label="Item"
            value={itemId}
            onChange={(v) => {
              setItemId(v);
              resetPages();
            }}
            options={[
              { value: "ALL", label: "Todos os itens" },
              ...(itemsQuery.data?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <FilterSelect
            label="Tipo"
            value={itemType}
            onChange={(v) => {
              setItemType(v as ItemTypeFilter);
              setBalanceOffset(0);
            }}
            options={[
              { value: "ALL", label: "Todos os tipos" },
              ...INVENTORY_ITEM_TYPE_VALUES.map((type) => ({ value: type, label: INVENTORY_ITEM_TYPE_LABEL[type] })),
            ]}
          />
          <FilterSelect
            label="Situação"
            value={stockStatus}
            onChange={(v) => {
              setStockStatus(v as StockStatusFilter);
              setBalanceOffset(0);
            }}
            options={[
              { value: "ALL", label: "Todos" },
              { value: "LOW_STOCK", label: "Abaixo do limite" },
              { value: "OK", label: "Dentro do limite" },
            ]}
          />
        </div>
      </ResponsiveDialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 w-full rounded-xl" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-danger-surface p-4">
      <p className="text-sm font-semibold text-destructive">Não foi possível carregar os {label}.</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        <RefreshCw aria-hidden /> Tentar de novo
      </Button>
    </div>
  );
}

const PAGE_SIZE = 20;

function Pager({
  offset,
  count,
  total,
  busy,
  onChange,
}: {
  offset: number;
  count: number;
  total?: number;
  busy: boolean;
  onChange: (offset: number) => void;
}) {
  if (!total || total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" size="sm" disabled={offset === 0 || busy} onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>
        <ChevronLeft aria-hidden /> Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        {offset + 1}–{Math.min(offset + count, total)} de {total}
      </span>
      <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total || busy} onClick={() => onChange(offset + PAGE_SIZE)}>
        Próxima <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}

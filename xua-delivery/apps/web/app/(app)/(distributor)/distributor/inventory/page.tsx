"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, History, PackagePlus, PackageSearch, Scale, Search } from "lucide-react";
import { toast } from "sonner";
import type { InventoryItemType, InventoryMovementType } from "@xua/shared/enums";

import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { ApiError, api } from "@/src/lib/api-client";
import {
  buildInventoryQuery,
  INVENTORY_ITEM_TYPE_LABEL,
  INVENTORY_MOVEMENT_LABEL,
  type StockStatusFilter,
} from "@/src/lib/inventory-ui";
import { cn, formatDate, formatTime } from "@/src/lib/utils";
import { DataView, type Column } from "@/src/components/shared/data-view";
import { Spinner } from "@/src/components/ui/spinner";

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
}

interface InventoryBalance {
  id: string;
  inventory_item_id: string;
  item: InventoryItem;
  quantity_on_hand: number;
  low_stock_threshold: number | null;
  is_low_stock: boolean;
  last_movement_at: string | null;
}

interface InventoryMovement {
  id: string;
  item: InventoryItem;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  occurred_at: string;
}

const PAGE = 20;

function createBatchId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
        (Number(char) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(char) / 4)))).toString(16),
      );
}

const quantityClass = (low: boolean) => (low ? "text-destructive" : "text-ink");

function BalanceMobile({ b }: { b: InventoryBalance }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{b.item.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {INVENTORY_ITEM_TYPE_LABEL[b.item.type]} · {b.item.code}
          {b.low_stock_threshold != null ? ` · mínimo ${b.low_stock_threshold}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className={cn("font-heading text-xl font-bold tabular-nums", quantityClass(b.is_low_stock))}>
          {b.quantity_on_hand.toLocaleString("pt-BR")}
        </p>
        <p className="text-[11px] text-muted-foreground">{b.item.unit_label}</p>
      </div>
      {b.is_low_stock ? <StatusBadge label="Baixo" tone="danger" className="h-5 px-2 text-[11px]" /> : null}
    </div>
  );
}

const BALANCE_COLUMNS: Column<InventoryBalance>[] = [
  { id: "item", header: "Item", cell: (b) => <span className="font-medium text-foreground">{b.item.name}</span> },
  { id: "type", header: "Tipo", cell: (b) => INVENTORY_ITEM_TYPE_LABEL[b.item.type], className: "text-muted-foreground" },
  { id: "code", header: "Código", cell: (b) => <span className="font-mono text-xs">{b.item.code}</span>, className: "text-muted-foreground" },
  {
    id: "min",
    header: "Mínimo",
    align: "right",
    cell: (b) => (b.low_stock_threshold != null ? b.low_stock_threshold.toLocaleString("pt-BR") : "—"),
    className: "text-muted-foreground",
  },
  {
    id: "qty",
    header: "Saldo",
    align: "right",
    cell: (b) => (
      <span className={cn("font-semibold", quantityClass(b.is_low_stock))}>
        {b.quantity_on_hand.toLocaleString("pt-BR")} <span className="text-xs font-normal text-muted-foreground">{b.item.unit_label}</span>
      </span>
    ),
  },
  {
    id: "status",
    header: "Situação",
    cell: (b) =>
      b.is_low_stock ? (
        <StatusBadge label="Baixo" tone="danger" className="h-5 px-2 text-[11px]" />
      ) : (
        <StatusBadge label="Normal" tone="success" className="h-5 px-2 text-[11px]" />
      ),
  },
];

function MovementIcon({ delta }: { delta: number }) {
  const positive = delta > 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        positive ? "bg-success-surface text-success-foreground" : "bg-danger-surface text-destructive",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function MovementQuantity({ delta }: { delta: number }) {
  const positive = delta > 0;
  return (
    <span className={cn("font-semibold tabular-nums", positive ? "text-success-foreground" : "text-destructive")}>
      {positive ? "+" : ""}
      {delta.toLocaleString("pt-BR")}
    </span>
  );
}

const movementWhen = (m: InventoryMovement) => `${formatDate(m.occurred_at)} ${formatTime(m.occurred_at)}`;
const movementLabel = (m: InventoryMovement) => INVENTORY_MOVEMENT_LABEL[m.movement_type] ?? m.movement_type;

function MovementMobile({ m }: { m: InventoryMovement }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <MovementIcon delta={m.quantity_delta} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{m.item.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {movementLabel(m)} · {movementWhen(m)}
        </p>
      </div>
      <MovementQuantity delta={m.quantity_delta} />
    </div>
  );
}

const MOVEMENT_COLUMNS: Column<InventoryMovement>[] = [
  {
    id: "item",
    header: "Item",
    cell: (m) => (
      <span className="flex items-center gap-3">
        <MovementIcon delta={m.quantity_delta} />
        <span className="font-medium text-foreground">{m.item.name}</span>
      </span>
    ),
  },
  { id: "type", header: "Movimento", cell: movementLabel, className: "text-muted-foreground" },
  { id: "when", header: "Data", cell: movementWhen, className: "text-muted-foreground tabular-nums" },
  { id: "qty", header: "Quantidade", align: "right", cell: (m) => <MovementQuantity delta={m.quantity_delta} /> },
];

export default function DistributorInventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>("ALL");
  const [offset, setOffset] = useState(0);
  const [movementItemId, setMovementItemId] = useState("ALL");
  const [movementOffset, setMovementOffset] = useState(0);
  const [loadOpen, setLoadOpen] = useState(false);
  const [loadQuantities, setLoadQuantities] = useState<Record<string, string>>({});
  const [loadObservation, setLoadObservation] = useState("");
  const deferredSearch = useDeferredValue(search);

  const itemsQuery = useQuery<{ items: InventoryItem[] }>({
    queryKey: ["distributor-inventory-items"],
    queryFn: () => api.get(`/api/distributor/inventory/items?is_active=true&limit=100&offset=0`),
  });
  const balancesQuery = useQuery<{ balances: InventoryBalance[]; pagination: Pagination }>({
    queryKey: ["distributor-inventory-balances", deferredSearch, stockStatus, offset],
    queryFn: () =>
      api.get(
        `/api/distributor/inventory/balances?${buildInventoryQuery({
          q: deferredSearch.trim() || undefined,
          stock_status: stockStatus === "ALL" ? undefined : stockStatus,
          limit: String(PAGE),
          offset: String(offset),
        })}`,
      ),
  });
  // Todos os saldos (sem filtro): resumo do topo e quais itens ainda não têm carga inicial.
  const allBalancesQuery = useQuery<{ balances: InventoryBalance[] }>({
    queryKey: ["distributor-inventory-balances", "all"],
    queryFn: () => api.get(`/api/distributor/inventory/balances?limit=100&offset=0`),
  });
  const movementsQuery = useQuery<{ movements: InventoryMovement[]; pagination: Pagination }>({
    queryKey: ["distributor-inventory-movements", movementItemId, movementOffset],
    queryFn: () =>
      api.get(
        `/api/distributor/inventory/movements?${buildInventoryQuery({
          inventory_item_id: movementItemId === "ALL" ? undefined : movementItemId,
          limit: "10",
          offset: String(movementOffset),
        })}`,
      ),
  });

  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const allBalances = useMemo(() => allBalancesQuery.data?.balances ?? [], [allBalancesQuery.data]);
  const balances = balancesQuery.data?.balances ?? [];
  const movements = movementsQuery.data?.movements ?? [];
  const lowStock = allBalances.filter((b) => b.is_low_stock).length;
  // A API só aceita uma carga inicial por item; depois disso, ajuste é pela conciliação.
  const itemsWithoutStock = useMemo(() => {
    const withBalance = new Set(allBalances.map((b) => b.inventory_item_id));
    return items.filter((i) => !withBalance.has(i.id));
  }, [items, allBalances]);

  const loadMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.post<{ applied_count: number }>("/api/distributor/inventory/initial-load", payload),
    onSuccess: (result) => {
      setLoadQuantities({});
      setLoadObservation("");
      setLoadOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-balances"] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-movements"] });
      toast.success(`Carga registrada em ${result.applied_count} ${result.applied_count === 1 ? "item" : "itens"}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Erro ao registrar a carga"),
  });

  const loadItems = itemsWithoutStock
    .map((item) => ({ inventory_item_id: item.id, quantity: Number(loadQuantities[item.id] || 0) }))
    .filter((i) => i.quantity > 0);
  const loadInvalid = Object.values(loadQuantities).some((v) => v !== "" && (!Number.isInteger(Number(v)) || Number(v) < 0));

  const total = balancesQuery.data?.pagination.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl md:max-w-6xl">
      <PageHeader
        title="Estoque"
        description="O que você tem agora, por item."
        sticky
        actions={
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant={itemsWithoutStock.length ? "outline" : "cta"} size="lg">
              <Link href="/distributor/inventory/reconciliation">
                <Scale aria-hidden /> Conferir contagem
              </Link>
            </Button>
            {itemsWithoutStock.length > 0 ? (
              <Button variant="cta" size="lg" onClick={() => setLoadOpen(true)}>
                <PackagePlus aria-hidden /> Carga inicial
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-2 md:flex md:items-center md:gap-3 md:space-y-0">
          <div className="relative md:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Buscar item ou código"
              aria-label="Buscar item"
              className="h-11 md:h-9 rounded-xl pl-9"
            />
          </div>
          <ToggleGroup
            type="single"
            value={stockStatus}
            onValueChange={(v) => {
              if (!v) return;
              setStockStatus(v as StockStatusFilter);
              setOffset(0);
            }}
            className="justify-start"
            spacing={2}
          >
            <ToggleGroupItem value="ALL" className="h-9 rounded-md bg-muted px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              Todos
            </ToggleGroupItem>
            <ToggleGroupItem value="LOW_STOCK" className="h-9 rounded-md bg-muted px-4 data-[state=on]:bg-destructive data-[state=on]:text-white">
              Baixo estoque {lowStock > 0 ? `(${lowStock})` : ""}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </PageHeader>

      <div className="space-y-6 px-4 pb-4">
        {lowStock > 0 && stockStatus === "ALL" ? (
          <Alert variant="destructive" className="border-destructive/30 bg-danger-surface">
            <AlertTriangle aria-hidden />
            <AlertDescription>
              {lowStock === 1 ? "1 item está abaixo do mínimo." : `${lowStock} itens estão abaixo do mínimo.`}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Lista de saldos: o saldo é a informação principal, sempre visível (antes ficava fora da tabela no celular) */}
        <section aria-label="Saldos" className="space-y-2">
          {balancesQuery.isLoading ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : balancesQuery.isError ? (
            <EmptyState
              icon={PackageSearch}
              title="Erro ao carregar o estoque"
              action={
                <Button variant="outline" onClick={() => balancesQuery.refetch()}>
                  Tentar de novo
                </Button>
              }
            />
          ) : balances.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={search || stockStatus !== "ALL" ? "Nenhum item com esse filtro" : "Estoque ainda vazio"}
              description={search || stockStatus !== "ALL" ? undefined : "Registre a carga inicial para começar a controlar os saldos."}
            />
          ) : (
            <DataView
              label="Saldos"
              items={balances}
              getKey={(b) => b.id}
              columns={BALANCE_COLUMNS}
              renderMobile={(b) => <BalanceMobile b={b} />}
            />
          )}
          {total > PAGE ? (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="lg" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + balances.length, total)} de {total}
              </span>
              <Button variant="outline" size="lg" disabled={offset + PAGE >= total} onClick={() => setOffset((o) => o + PAGE)}>
                Próxima
              </Button>
            </div>
          ) : null}
        </section>

        {/* Extrato */}
        <section aria-labelledby="sec-extrato" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="sec-extrato" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="size-4 text-primary" aria-hidden /> Movimentações
            </h2>
            <Select
              value={movementItemId}
              onValueChange={(v) => {
                setMovementItemId(v);
                setMovementOffset(0);
              }}
            >
              <SelectTrigger className="h-10 w-44" aria-label="Filtrar movimentações por item">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os itens</SelectItem>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {movementsQuery.isLoading ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : movements.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-hairline p-4 text-center text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
          ) : (
            <DataView
              label="Movimentações"
              items={movements}
              getKey={(m) => m.id}
              columns={MOVEMENT_COLUMNS}
              renderMobile={(m) => <MovementMobile m={m} />}
            />
          )}
          {(movementsQuery.data?.pagination.total ?? 0) > 10 ? (
            <div className="flex justify-between">
              <Button variant="ghost" size="lg" disabled={movementOffset === 0} onClick={() => setMovementOffset((o) => Math.max(0, o - 10))}>
                Mais recentes
              </Button>
              <Button
                variant="ghost"
                size="lg"
                disabled={movementOffset + 10 >= (movementsQuery.data?.pagination.total ?? 0)}
                onClick={() => setMovementOffset((o) => o + 10)}
              >
                Mais antigas
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <StickyActionBar mobileOnly>
        <Button asChild variant={itemsWithoutStock.length ? "outline" : "cta"} size="xl">
          <Link href="/distributor/inventory/reconciliation">
            <Scale aria-hidden /> Conferir contagem
          </Link>
        </Button>
        {itemsWithoutStock.length > 0 ? (
          <Button variant="cta" size="xl" onClick={() => setLoadOpen(true)}>
            <PackagePlus aria-hidden /> Carga inicial
          </Button>
        ) : null}
      </StickyActionBar>

      <ResponsiveDialog
        open={loadOpen}
        onOpenChange={setLoadOpen}
        title="Carga inicial"
        description="Informe quanto você tem hoje de cada item. Depois, ajustes são feitos pela conferência de contagem."
        footer={
          <Button
            variant="cta"
            size="xl"
            disabled={loadMutation.isPending || loadItems.length === 0 || loadInvalid}
            onClick={() =>
              loadMutation.mutate({ batch_id: createBatchId(), observation: loadObservation.trim() || undefined, items: loadItems })
            }
          >
            {loadMutation.isPending ? <Spinner aria-hidden /> : null}
            Registrar carga
          </Button>
        }
      >
        <div className="grid gap-3">
          {itemsWithoutStock.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_6rem] items-center gap-3">
              <Label htmlFor={`load-${item.id}`} className="flex-col items-start gap-0 font-normal">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.unit_label}</span>
              </Label>
              <Input
                id={`load-${item.id}`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={loadQuantities[item.id] ?? ""}
                onChange={(e) => setLoadQuantities((c) => ({ ...c, [item.id]: e.target.value }))}
                placeholder="0"
                className="h-11 md:h-9 text-right"
              />
            </div>
          ))}
          {loadInvalid ? <p className="text-xs text-destructive">Use apenas números inteiros, sem negativos.</p> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="load-obs">
              Observação <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea id="load-obs" value={loadObservation} onChange={(e) => setLoadObservation(e.target.value)} maxLength={500} rows={2} className="resize-none" />
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

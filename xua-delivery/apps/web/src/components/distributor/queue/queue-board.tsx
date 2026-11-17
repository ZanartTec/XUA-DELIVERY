"use client";

import { cn } from "@/src/lib/utils";
import { OrderCard, type OrderActions } from "./order-card";
import { STAGES, type QueueOrder } from "./queue-model";

const STAGE_DOT: Record<(typeof STAGES)[number]["key"], string> = {
  incoming: "bg-warning",
  preparation: "bg-primary",
  route: "bg-success",
};

interface StageGroup {
  key: (typeof STAGES)[number]["key"];
  label: string;
  hint: string;
  orders: QueueOrder[];
}

interface QueueBoardProps {
  groups: readonly StageGroup[];
  actionLoadingId: string | null;
  onOpen: OrderActions["onOpen"];
  onAccept: OrderActions["onAccept"];
  onReject: OrderActions["onReject"];
  /** Desktop: 3 colunas com rolagem própria. Abaixo disso, etapas empilhadas. */
  columns: boolean;
  dimmed?: boolean;
}

/** Quadro da operação: uma coluna por etapa (Novos, Preparo, Em rota). */
export function QueueBoard({ groups, actionLoadingId, onOpen, onAccept, onReject, columns, dimmed }: QueueBoardProps) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-3 lg:gap-4", dimmed && "opacity-80")}>
      {groups.map((stage) => (
        <section
          key={stage.key}
          aria-labelledby={`st-${stage.key}`}
          className="space-y-2 lg:flex lg:min-h-80 lg:flex-col lg:space-y-0 lg:rounded-2xl lg:border lg:border-hairline lg:bg-surface-low"
        >
          <h2
            id={`st-${stage.key}`}
            className="flex items-center gap-2 text-sm font-semibold text-foreground lg:border-b lg:border-hairline lg:px-3 lg:py-2.5"
          >
            <span aria-hidden className={cn("size-2 rounded-full", STAGE_DOT[stage.key])} />
            <span>{stage.label}</span>
            <span className="hidden font-normal text-muted-foreground xl:inline">· {stage.hint}</span>
            <span className="ml-auto rounded-md bg-background px-1.5 text-xs text-muted-foreground tabular-nums lg:border lg:border-hairline">
              {stage.orders.length}
            </span>
          </h2>
          {stage.orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted-foreground lg:m-3 lg:mt-3">
              Nada nesta etapa
            </p>
          ) : (
            <ul className="space-y-2 lg:max-h-[calc(100dvh-24rem)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-2">
              {stage.orders.map((order) => (
                <li key={order.id}>
                  <OrderCard
                    order={order}
                    compact={columns}
                    loading={actionLoadingId === order.id}
                    onOpen={onOpen}
                    onAccept={onAccept}
                    onReject={onReject}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

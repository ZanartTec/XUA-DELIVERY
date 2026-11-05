import { Check } from "lucide-react";
import { CONSUMER_ORDER_STEPS, consumerOrderProgress } from "@/src/lib/order-status";
import { cn } from "@/src/lib/utils";

interface OrderStepperProps {
  status: string;
  compact?: boolean;
  className?: string;
}

/** Progresso do pedido para o consumidor: Confirmado → Aceito → A caminho → Entregue. */
export function OrderStepper({ status, compact = false, className }: OrderStepperProps) {
  const progress = consumerOrderProgress(status);
  if (progress.kind === "issue") return null;
  const current = progress.kind === "progress" ? progress.current : -1;

  return (
    <ol
      data-slot="order-stepper"
      aria-label="Andamento do pedido"
      className={cn("grid grid-cols-4 gap-1", className)}
    >
      {CONSUMER_ORDER_STEPS.map((label, index) => {
        const done = index < current || (index === current && index === CONSUMER_ORDER_STEPS.length - 1);
        const active = index === current && !done;
        return (
          <li key={label} className="flex flex-col gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "h-1.5 rounded-full transition-colors",
                done || active ? "bg-primary" : "bg-surface-highest",
                active && "animate-pulse",
              )}
            />
            {!compact ? (
              <span
                className={cn(
                  "flex items-center gap-1 text-[11px] leading-tight",
                  active ? "font-semibold text-primary" : done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                {label}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

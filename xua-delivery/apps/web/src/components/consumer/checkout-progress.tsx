import { Check } from "lucide-react";
import { cn } from "@/src/lib/utils";

const STEPS = ["Entrega", "Pagamento", "Confirmação"] as const;

/** Progresso do checkout avulso: Entrega → Pagamento → Confirmação. */
export function CheckoutProgress({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol aria-label="Etapas do pedido" className="flex items-center gap-2">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                done && "bg-primary text-primary-foreground",
                active && "bg-cta text-cta-foreground",
                !done && !active && "bg-surface-high text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-xs",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < STEPS.length - 1 ? <span aria-hidden className="h-px flex-1 bg-hairline" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

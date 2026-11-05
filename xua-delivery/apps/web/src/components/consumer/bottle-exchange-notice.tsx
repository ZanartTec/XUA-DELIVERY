"use client";

import { Info, Recycle } from "lucide-react";
import { formatCurrency, cn } from "@/src/lib/utils";
import { plural } from "@/src/lib/format";

interface BottleExchangeItem {
  quantity: number;
  /** Preço do vasilhame cobrado se faltar o vazio (só itens refil). */
  bottle_charge_cents?: number | null;
}

/**
 * Regra de vasilhame na entrega, explicada ao cliente antes de fechar o pedido:
 * o total cobra só a água; cada unidade refil exige 1 vazio na porta e, sem ele,
 * o entregador cobra o vasilhame (até o teto mostrado) ou entrega só o que tiver troca.
 * Produto com vasilhame incluso não entra aqui.
 */
export function getBottleExchangeSummary(items: BottleExchangeItem[]) {
  return items.reduce(
    (acc, item) => {
      if (!item.bottle_charge_cents) return acc;
      acc.requiredEmpties += item.quantity;
      acc.maxChargeCents += item.quantity * item.bottle_charge_cents;
      acc.unitPrices.add(item.bottle_charge_cents);
      return acc;
    },
    { requiredEmpties: 0, maxChargeCents: 0, unitPrices: new Set<number>() }
  );
}

export function BottleExchangeNotice({
  items,
  className,
}: {
  items: BottleExchangeItem[];
  className?: string;
}) {
  const { requiredEmpties, maxChargeCents, unitPrices } = getBottleExchangeSummary(items);
  if (requiredEmpties === 0) return null;

  const unitLabel =
    unitPrices.size === 1 ? `${formatCurrency([...unitPrices][0])} por vasilhame` : "o valor do vasilhame";

  return (
    <section aria-label="Troca de vasilhame" className={cn("rounded-2xl bg-sky/10 p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky/15">
          <Recycle className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Separe {plural(requiredEmpties, "vasilhame vazio", "vasilhames vazios")} para a troca
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            A água refil não inclui o vasilhame: para cada unidade, entregue ao motorista 1 vasilhame vazio do
            mesmo tipo, em bom estado e dentro da validade (3 anos).
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-1.5 border-t border-sky/15 pt-3">
        <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-xs leading-snug font-medium text-warning-foreground">
          Sem o vazio, o entregador cobra {unitLabel} na entrega (até {formatCurrency(maxChargeCents)}) ou
          entrega só as unidades com troca.
        </p>
      </div>
    </section>
  );
}

"use client";

import { Info, Recycle } from "lucide-react";
import { formatCurrency } from "@/src/lib/utils";

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
    <div className={`rounded-2xl bg-[#5697E9]/10 p-4 ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5697E9]/15">
          <Recycle className="h-5 w-5 text-[#5697E9]" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h3 className="font-heading text-sm font-semibold text-[#191c1d]">
            Tenha {requiredEmpties} {requiredEmpties === 1 ? "vasilhame vazio" : "vasilhames vazios"} para troca
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[#444]">
            A água refil não inclui o vasilhame: para cada unidade, entregue ao motorista 1 vasilhame vazio do
            mesmo tipo, em bom estado e dentro da validade (3 anos).
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-1.5 border-t border-[#5697E9]/15 pt-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
        <p className="text-[11px] font-medium leading-tight text-amber-700">
          Sem o vazio, o entregador cobra {unitLabel} na entrega (até {formatCurrency(maxChargeCents)}) ou
          entrega só as unidades com troca.
        </p>
      </div>
    </div>
  );
}

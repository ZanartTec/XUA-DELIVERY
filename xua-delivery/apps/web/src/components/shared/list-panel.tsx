import type * as React from "react";
import { cardVariants } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";

/**
 * Lista em painel: card com linhas separadas por filete (`<li>` dentro).
 * É o padrão das listas do app (pedidos, motoristas, estoque…); o desktop pode trocá-lo por tabela.
 */
export function ListPanel({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="list-panel"
      className={cn(cardVariants(), "divide-y divide-hairline overflow-hidden", className)}
      {...props}
    />
  );
}

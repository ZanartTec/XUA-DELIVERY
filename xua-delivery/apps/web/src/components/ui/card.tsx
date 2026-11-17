import * as React from "react";
import { cn } from "@/src/lib/utils";

/** Casca única dos cards do app: raio 2xl, borda hairline, fundo `card`. Profundidade por borda, sem sombra. */
const SHELL = "rounded-2xl border border-hairline bg-card text-card-foreground";

const VARIANTS = {
  default: "",
  /** Card clicável: a borda ganha a cor da marca no hover e no foco. */
  interactive:
    "cursor-pointer transition-colors duration-200 hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none",
} as const;

interface CardStyleOptions {
  variant?: keyof typeof VARIANTS;
  className?: string;
}

/** Classes do card para elementos que não são `div` (`section`, `dl`, `Accordion`…). Prefira `<Card>`. */
export function cardVariants({ variant = "default", className }: CardStyleOptions = {}): string {
  return cn(SHELL, VARIANTS[variant], className);
}

function Card({
  variant,
  className,
  ...props
}: React.ComponentProps<"div"> & Pick<CardStyleOptions, "variant">) {
  return <div data-slot="card" className={cardVariants({ variant, className })} {...props} />;
}

export { Card };

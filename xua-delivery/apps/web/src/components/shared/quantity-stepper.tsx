"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Nome do item para os rótulos acessíveis. */
  itemLabel?: string;
  /** Quando `value === min + 1`, o "−" vira lixeira (remove o item). */
  removable?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  itemLabel = "item",
  removable = true,
  size = "md",
  className,
}: QuantityStepperProps) {
  const willRemove = removable && value - 1 <= min && min === 0;
  const btnSize = size === "sm" ? "icon-sm" : "icon-lg";

  return (
    <div
      data-slot="quantity-stepper"
      className={cn("inline-flex items-center gap-1 rounded-xl bg-surface-low p-1", className)}
    >
      <Button
        type="button"
        variant="ghost"
        size={btnSize}
        className={cn("rounded-lg", willRemove && "text-destructive hover:text-destructive")}
        aria-label={willRemove ? `Remover ${itemLabel}` : `Diminuir quantidade de ${itemLabel}`}
        disabled={value <= min && !willRemove}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        {willRemove ? <Trash2 /> : <Minus />}
      </Button>
      <span
        aria-live="polite"
        className={cn(
          "min-w-6 text-center font-semibold tabular-nums text-foreground",
          size === "sm" ? "text-sm" : "text-base",
        )}
      >
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size={btnSize}
        className="rounded-lg"
        aria-label={`Aumentar quantidade de ${itemLabel}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}

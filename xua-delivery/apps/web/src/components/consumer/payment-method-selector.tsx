"use client";

import { Banknote, CreditCard, Smartphone, WalletCards } from "lucide-react";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { cn } from "@/src/lib/utils";
import type { CheckoutPaymentMethod } from "@xua/shared/enums";
import { CHECKOUT_PAYMENT_METHOD_OPTIONS } from "@xua/shared/mappers/payment";

export type PaymentMethod = CheckoutPaymentMethod;

const PAYMENT_METHOD_ICONS: Record<PaymentMethod, typeof CreditCard> = {
  pix: WalletCards,
  credit: CreditCard,
  cash: Banknote,
  card_on_delivery: Smartphone,
};

const PAYMENT_METHODS = CHECKOUT_PAYMENT_METHOD_OPTIONS.map((method) => ({
  ...method,
  icon: PAYMENT_METHOD_ICONS[method.value],
}));

interface PaymentMethodSelectorProps {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  disabledMethods?: PaymentMethod[];
  hiddenMethods?: PaymentMethod[];
}

export function PaymentMethodSelector({
  value,
  onChange,
  disabledMethods = [],
  hiddenMethods = [],
}: PaymentMethodSelectorProps) {
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(v) => onChange(v as PaymentMethod)}
      aria-label="Forma de pagamento"
    >
      {PAYMENT_METHODS.filter((pm) => !hiddenMethods.includes(pm.value)).map((pm) => {
        const checked = value === pm.value;
        const disabled = disabledMethods.includes(pm.value);
        const Icon = pm.icon;
        return (
          <Label
            key={pm.value}
            htmlFor={`pay-${pm.value}`}
            className={cn(
              "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 font-normal transition-colors",
              checked ? "border-primary ring-1 ring-primary" : "border-hairline hover:border-primary/40",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                checked ? "bg-secondary" : "bg-surface-low",
              )}
            >
              <Icon className={cn("size-5", checked ? "text-primary" : "text-muted-foreground")} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{pm.label}</span>
              <span className="block text-xs text-muted-foreground">{pm.sublabel}</span>
            </span>
            <RadioGroupItem id={`pay-${pm.value}`} value={pm.value} disabled={disabled} aria-label={pm.label} />
          </Label>
        );
      })}
    </RadioGroup>
  );
}

export { PAYMENT_METHODS };

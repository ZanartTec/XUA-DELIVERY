"use client";

import { cn } from "@/src/lib/utils";
import { CreditCard, Banknote, WalletCards, Check, Smartphone } from "lucide-react";
import type { CheckoutPaymentMethod } from "@xua/shared/enums";
import { CHECKOUT_PAYMENT_METHOD_OPTIONS } from "@xua/shared/mappers/payment";

export type PaymentMethod = CheckoutPaymentMethod;

const PAYMENT_METHOD_VISUALS: Record<PaymentMethod, {
  icon: typeof CreditCard;
  iconBg: string;
  iconColor: string;
}> = {
  pix: {
    icon: WalletCards,
    iconBg: "bg-[#e7f9f2]",
    iconColor: "text-[#008d5d]",
  },
  credit: {
    icon: CreditCard,
    iconBg: "bg-[#d8e2ff]",
    iconColor: "text-[#32466e]",
  },
  cash: {
    icon: Banknote,
    iconBg: "bg-[#fff2dd]",
    iconColor: "text-[#7a4700]",
  },
  card_on_delivery: {
    icon: Smartphone,
    iconBg: "bg-[#ede7ff]",
    iconColor: "text-[#4b2e83]",
  },
};

const PAYMENT_METHODS = CHECKOUT_PAYMENT_METHOD_OPTIONS.map((method) => ({
  ...method,
  ...PAYMENT_METHOD_VISUALS[method.value],
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
    <div className="space-y-3">
      {PAYMENT_METHODS.filter((pm) => !hiddenMethods.includes(pm.value)).map((pm) => {
        const selected = value === pm.value;
        const disabled = disabledMethods.includes(pm.value);
        const Icon = pm.icon;
        return (
          <button
            key={pm.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(pm.value)}
            className={cn(
              "relative flex w-full items-center gap-4 rounded-xl p-4 transition-all active:scale-[0.98]",
              selected
                ? "bg-white border-2 border-primary shadow-[0_2px_12px_rgba(27,74,154,0.08)]"
                : "bg-white border border-[#e1e3e4] hover:bg-[#e7e8e9]",
              disabled && "cursor-not-allowed opacity-50 hover:bg-white active:scale-100"
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                pm.iconBg
              )}
            >
              <Icon className={cn("h-5 w-5", pm.iconColor)} />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-[#191c1d]">{pm.label}</p>
              <p className="text-xs text-[#434656]">{pm.sublabel}</p>
            </div>
            {selected && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#00E0FF]">
                <Check className="h-3.5 w-3.5 text-[#001735]" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { PAYMENT_METHODS };

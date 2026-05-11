"use client";

import { cn } from "@/src/lib/utils";
import { CreditCard, Banknote, WalletCards, Check } from "lucide-react";

export type PaymentMethod = "pix" | "credit" | "cash";

const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  sublabel: string;
  icon: typeof CreditCard;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    value: "pix",
    label: "Pix",
    sublabel: "Aprovação instantânea e segura",
    icon: Banknote,
    iconBg: "bg-[#e7f9f2]",
    iconColor: "text-[#008d5d]",
  },
  {
    value: "credit",
    label: "Cartão de Crédito",
    sublabel: "Em breve via Mercado Pago",
    icon: CreditCard,
    iconBg: "bg-[#d8e2ff]",
    iconColor: "text-[#32466e]",
  },
  {
    value: "cash",
    label: "Dinheiro",
    sublabel: "Pague na hora da entrega",
    icon: WalletCards,
    iconBg: "bg-[#e1e3e4]",
    iconColor: "text-[#434656]",
  },
];

interface PaymentMethodSelectorProps {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
}

export function PaymentMethodSelector({
  value,
  onChange,
}: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-3">
      {PAYMENT_METHODS.map((pm) => {
        const selected = value === pm.value;
        const Icon = pm.icon;
        const disabled = pm.value === "credit";
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
              disabled && "opacity-50 cursor-not-allowed"
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
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C8F708]">
                <Check className="h-3.5 w-3.5 text-[#1a2600]" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { PAYMENT_METHODS };

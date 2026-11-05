"use client";

import { Input } from "@/src/components/ui/input";
import { formatCep, formatPhone, onlyDigits } from "@/src/lib/format";

type Mask = "phone" | "cep";

const MASKS: Record<Mask, { format: (v: string) => string; maxDigits: number; inputMode: "tel" | "numeric"; autoComplete: string }> = {
  phone: { format: formatPhone, maxDigits: 11, inputMode: "tel", autoComplete: "tel-national" },
  cep: { format: formatCep, maxDigits: 8, inputMode: "numeric", autoComplete: "postal-code" },
};

interface MaskedInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  mask: Mask;
  /** Valor só com dígitos. */
  value: string;
  /** Recebe só os dígitos. */
  onValueChange: (digits: string) => void;
}

/** Input com máscara de exibição; o estado guarda apenas dígitos. */
export function MaskedInput({ mask, value, onValueChange, ...props }: MaskedInputProps) {
  const cfg = MASKS[mask];
  return (
    <Input
      inputMode={cfg.inputMode}
      autoComplete={cfg.autoComplete}
      {...props}
      value={cfg.format(value)}
      onChange={(e) => onValueChange(onlyDigits(e.target.value).slice(0, cfg.maxDigits))}
    />
  );
}

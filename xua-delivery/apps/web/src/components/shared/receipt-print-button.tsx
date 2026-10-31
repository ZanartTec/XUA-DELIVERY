"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import {
  RECEIPT_FORMAT_LABELS,
  openReceipt,
  readReceiptFormat,
  saveReceiptFormat,
  type ReceiptFormat,
} from "@/src/lib/receipt";

const FORMATS: ReceiptFormat[] = ["a4", "thermal"];

/**
 * Botão de impressão do comprovante de venda com escolha de formato
 * (A4 / térmica 80 mm). O formato escolhido fica salvo no navegador.
 */
export function ReceiptPrintButton({
  buildUrl,
  label = "Imprimir comprovante",
  defaultFormat = "a4",
  className,
}: {
  buildUrl: (format: ReceiptFormat) => string;
  label?: string;
  defaultFormat?: ReceiptFormat;
  className?: string;
}) {
  const [format, setFormat] = useState<ReceiptFormat>(defaultFormat);

  useEffect(() => {
    setFormat(readReceiptFormat(defaultFormat));
  }, [defaultFormat]);

  function selectFormat(next: ReceiptFormat) {
    setFormat(next);
    saveReceiptFormat(next);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="grid grid-cols-2 gap-1 rounded-md bg-[#f3f4f5] p-1" role="radiogroup" aria-label="Formato de impressão">
        {FORMATS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={format === option}
            onClick={() => selectFormat(option)}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              format === option ? "bg-white text-[#0d1b2f] shadow-sm" : "text-[#64748b] hover:text-[#0d1b2f]"
            )}
          >
            {RECEIPT_FORMAT_LABELS[option]}
          </button>
        ))}
      </div>
      <Button
        type="button"
        className="h-9 w-full rounded-md bg-[#0d1b2f] text-white hover:bg-[#17253c]"
        onClick={() => openReceipt(buildUrl(format))}
      >
        <Printer className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}

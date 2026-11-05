"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Textarea } from "@/src/components/ui/textarea";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { cn } from "@/src/lib/utils";

export const REJECT_REASON_OPTIONS = [
  { value: "out_of_stock", label: "Falta de estoque" },
  { value: "delivery_area_issue", label: "Endereço fora da área de entrega" },
  { value: "operational_capacity", label: "Sem capacidade de entrega nesse dia" },
  { value: "other", label: "Outro motivo" },
] as const;
export type RejectReason = (typeof REJECT_REASON_OPTIONS)[number]["value"];

interface RejectOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderLabel: string;
  loading?: boolean;
  onConfirm: (input: { reason: RejectReason; details?: string }) => void;
}

/** Recusa com motivo obrigatório (o cliente é avisado com ele). Bottom sheet no celular. */
export function RejectOrderDialog({ open, onOpenChange, orderLabel, loading = false, onConfirm }: RejectOrderDialogProps) {
  const [reason, setReason] = useState<RejectReason | "">("");
  const [details, setDetails] = useState("");
  const needsDetails = reason === "other";
  const ready = reason !== "" && (!needsDetails || details.trim().length >= 10);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason("");
      setDetails("");
    }
    onOpenChange(next);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Recusar pedido ${orderLabel}`}
      description="O cliente recebe o motivo e o pedido é cancelado."
      footer={
        <>
          <Button variant="outline" size="xl" onClick={() => handleOpenChange(false)} disabled={loading}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            size="xl"
            disabled={!ready || loading}
            onClick={() => reason && onConfirm({ reason, details: needsDetails ? details.trim() : undefined })}
          >
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Recusar pedido
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as RejectReason)} aria-label="Motivo da recusa">
          {REJECT_REASON_OPTIONS.map((option) => (
            <Label
              key={option.value}
              htmlFor={`reject-${option.value}`}
              className={cn(
                "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border bg-card px-3 font-normal",
                reason === option.value ? "border-primary ring-1 ring-primary" : "border-hairline",
              )}
            >
              {option.label}
              <RadioGroupItem id={`reject-${option.value}`} value={option.value} aria-label={option.label} />
            </Label>
          ))}
        </RadioGroup>
        {needsDetails ? (
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Explique ao cliente (mínimo de 10 caracteres)"
            rows={3}
            className="resize-none rounded-xl text-base md:text-sm"
          />
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}

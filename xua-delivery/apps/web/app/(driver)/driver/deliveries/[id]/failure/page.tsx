"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Textarea } from "@/src/components/ui/textarea";
import { PageHeader } from "@/src/components/shared/page-header";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { cn } from "@/src/lib/utils";

const FAILURE_REASONS = [
  "Cliente ausente",
  "Sem acesso ao local",
  "Endereço incorreto",
  "Local inseguro",
  // Regra de vasilhame: cliente sem vazio para troca e sem querer pagar o vasilhame.
  "Sem vasilhame para troca",
  "Outro",
] as const;
type Reason = (typeof FAILURE_REASONS)[number];

function FailureContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [reason, setReason] = useState<Reason | "">(
    searchParams.get("motivo") === "sem-vasilhame" ? "Sem vasilhame para troca" : "",
  );
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsDetails = reason === "Outro";
  const detailsOk = !needsDetails || details.trim().length >= 10;

  async function handleSubmit() {
    if (!reason || !detailsOk) return;
    setLoading(true);
    setError(null);
    try {
      const extra = details.trim();
      const finalReason = extra ? `${reason}: ${extra}` : reason;
      const response = await fetch(`/api/orders/${id}/delivery-failed`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: finalReason }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Não foi possível registrar.");
        return;
      }
      toast.success("Ocorrência registrada. A distribuidora vai reagendar.");
      await queryClient.invalidateQueries({ queryKey: ["driver-deliveries"] });
      router.push("/driver/deliveries");
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        back={`/driver/deliveries/${id}`}
        eyebrow={`Pedido #${id.slice(0, 8).toUpperCase()}`}
        title="Não consegui entregar"
        description="Escolha o motivo. A distribuidora usa isso para reagendar."
      />

      <div className="space-y-4 px-4">
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as Reason)} aria-label="Motivo">
          {FAILURE_REASONS.map((item) => (
            <Label
              key={item}
              htmlFor={`reason-${item}`}
              className={cn(
                "flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border bg-card px-4 text-base font-medium",
                reason === item ? "border-primary ring-1 ring-primary" : "border-hairline",
              )}
            >
              {item}
              <RadioGroupItem id={`reason-${item}`} value={item} aria-label={item} />
            </Label>
          ))}
        </RadioGroup>

        {reason ? (
          <div className="grid gap-1.5">
            <Label htmlFor="details">
              {needsDetails ? "Descreva o que aconteceu" : "Detalhes"}{" "}
              {!needsDetails ? <span className="font-normal text-muted-foreground">(opcional)</span> : null}
            </Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              className="resize-none rounded-xl text-base md:text-sm"
              placeholder={needsDetails ? "Ao menos 10 caracteres" : "Ex.: portaria fechada, interfone sem resposta"}
            />
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <StickyActionBar>
        <Button variant="destructive" size="xl" disabled={loading || !reason || !detailsOk} onClick={handleSubmit}>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {loading ? "Registrando…" : "Registrar ocorrência"}
        </Button>
      </StickyActionBar>
    </div>
  );
}

export default function DriverFailurePage() {
  return (
    <Suspense fallback={null}>
      <FailureContent />
    </Suspense>
  );
}

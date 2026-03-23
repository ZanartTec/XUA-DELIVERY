"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OtpInput } from "@/src/components/shared/otp-input";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";

export default function OtpVerifyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  async function handleComplete(code: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_otp", code }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Código inválido");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        return;
      }

      router.push(`/driver/deliveries/${id}/exchange`);
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">Verificar OTP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500 text-center">
            Peça o código de 6 dígitos ao consumidor para confirmar a entrega do pedido #{id}.
          </p>
          <div className={cn(shake && "animate-shake")}>
            <OtpInput onComplete={handleComplete} disabled={loading} />
          </div>
          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
          {loading && (
            <p className="text-sm text-gray-500 text-center">Verificando...</p>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.back()}
          >
            Voltar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

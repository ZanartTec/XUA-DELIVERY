"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { CheckCircle2, ShoppingCart } from "lucide-react";

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  return (
    <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>
      <Card className="w-full max-w-sm shadow-lg border-0">
        <CardContent className="py-6 space-y-3">
          <h1 className="text-xl font-bold text-green-700">Pedido confirmado!</h1>
          <p className="text-sm text-muted-foreground">
            Seu pedido foi criado com sucesso. Acompanhe o status em tempo real.
          </p>
          {orderId && (
            <p className="text-xs text-muted-foreground">Pedido #{orderId}</p>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-3">
        <Link href={orderId ? `/orders/${orderId}` : "/orders"}>
          <Button>Ver pedido</Button>
        </Link>
        <Link href="/catalog">
          <Button variant="outline" className="gap-1.5">
            <ShoppingCart className="h-4 w-4" /> Continuar comprando
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutConfirmationPage() {
  return (
    <Suspense fallback={<div className="p-4 flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Carregando...</p></div>}>
      <ConfirmationContent />
    </Suspense>
  );
}

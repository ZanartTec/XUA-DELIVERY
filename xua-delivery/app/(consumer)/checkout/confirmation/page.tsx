"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";

export default function CheckoutConfirmationPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  return (
    <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      <div className="text-6xl">✅</div>
      <Card className="w-full max-w-sm">
        <CardContent className="py-6 space-y-3">
          <h1 className="text-xl font-bold text-green-700">Pedido confirmado!</h1>
          <p className="text-sm text-gray-600">
            Seu pedido foi criado com sucesso. Acompanhe o status em tempo real.
          </p>
          {orderId && (
            <p className="text-xs text-gray-400">Pedido #{orderId}</p>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-3">
        <Link href={orderId ? `/orders/${orderId}` : "/orders"}>
          <Button>Ver pedido</Button>
        </Link>
        <Link href="/catalog">
          <Button variant="outline">Continuar comprando</Button>
        </Link>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { CheckCircle2, ShoppingCart } from "lucide-react";

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 px-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white/95 px-6 py-6 shadow-[0_4px_24px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <h1 className="text-xl font-bold font-heading text-green-700">Pedido confirmado!</h1>
        <p className="text-sm text-muted-foreground">
          Seu pedido foi criado com sucesso. Acompanhe o status em tempo real.
        </p>
        {orderId && (
          <p className="text-xs text-muted-foreground">Pedido #{orderId}</p>
        )}
      </div>
      <div className="flex gap-3">
        <Link href={orderId ? `/orders/${orderId}` : "/orders"}>
          <Button className="rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] shadow-none hover:opacity-90 active:scale-[0.98]">
            Ver pedido
          </Button>
        </Link>
        <Link href="/catalog">
          <Button variant="outline" className="gap-1.5 rounded-xl border-0 bg-[#e1e3e4] hover:bg-[#d1d3d4]">
            <ShoppingCart className="h-4 w-4" /> Continuar comprando
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutConfirmationPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center px-4"><p className="text-muted-foreground">Carregando...</p></div>}>
      <ConfirmationContent />
    </Suspense>
  );
}

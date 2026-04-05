"use client";

import { useParams } from "next/navigation";

export default function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading">Rota #{id}</h1>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-2 text-sm font-semibold font-heading">Mapa</p>
        <div className="w-full h-64 bg-[#e1e3e4] rounded-xl flex items-center justify-center text-muted-foreground text-sm">
          Integração Google Maps (placeholder)
        </div>
      </div>

      <div className="rounded-2xl bg-white/95 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm text-center">
        <p className="text-sm text-muted-foreground">
          Funcionalidade de rotas de entrega em desenvolvimento.
        </p>
      </div>
    </div>
  );
}

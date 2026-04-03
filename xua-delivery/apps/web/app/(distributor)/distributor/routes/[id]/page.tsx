"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

export default function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Rota #{id}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mapa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full h-64 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-sm">
            Integração Google Maps (placeholder)
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Funcionalidade de rotas de entrega em desenvolvimento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

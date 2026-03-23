"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StatusPill } from "@/src/components/shared/status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

interface RouteStop {
  order_id: string;
  consumer_name: string;
  address_line: string;
  status: string;
  sequence: number;
}

export default function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders?scope=route&route_id=${id}`)
      .then((r) => r.json())
      .then((data) => setStops(data.stops ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Rota #{id}</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Rota #{id}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mapa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full h-64 bg-gray-100 rounded-md flex items-center justify-center text-gray-400 text-sm">
            Integração Google Maps (placeholder)
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {stops.map((stop) => (
          <Card key={stop.order_id}>
            <CardContent className="py-3 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  <span className="text-gray-400 mr-2">#{stop.sequence}</span>
                  {stop.consumer_name}
                </p>
                <p className="text-xs text-gray-500">{stop.address_line}</p>
              </div>
              <StatusPill status={stop.status} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

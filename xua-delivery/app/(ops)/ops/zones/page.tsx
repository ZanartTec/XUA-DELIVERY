"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

interface Zone {
  id: string;
  name: string;
  city: string;
  state: string;
  morning_capacity: number;
  afternoon_capacity: number;
}

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/zones?all=true")
      .then((r) => r.json())
      .then((data) => setZones(data.zones ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateCapacity(
    id: string,
    field: "morning_capacity" | "afternoon_capacity",
    value: number
  ) {
    setZones((prev) =>
      prev.map((z) => (z.id === id ? { ...z, [field]: value } : z))
    );
  }

  async function saveZone(zone: Zone) {
    await fetch(`/api/zones/${zone.id}/capacity`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        morning_capacity: zone.morning_capacity,
        afternoon_capacity: zone.afternoon_capacity,
      }),
    });
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Zonas de Cobertura</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Zonas de Cobertura</h1>

      <div className="space-y-3">
        {zones.map((zone) => (
          <Card key={zone.id}>
            <CardHeader>
              <CardTitle className="text-sm">
                {zone.name} — {zone.city}/{zone.state}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Cap. Manhã</label>
                  <Input
                    type="number"
                    min={0}
                    value={zone.morning_capacity}
                    onChange={(e) =>
                      updateCapacity(zone.id, "morning_capacity", parseInt(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Cap. Tarde</label>
                  <Input
                    type="number"
                    min={0}
                    value={zone.afternoon_capacity}
                    onChange={(e) =>
                      updateCapacity(zone.id, "afternoon_capacity", parseInt(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <Button size="sm" onClick={() => saveZone(zone)}>
                Salvar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

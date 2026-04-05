"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";


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
    await fetch(`/api/zones/${zone.id}`, {
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
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Zonas de Cobertura</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading text-foreground">Zonas de Cobertura</h1>

      <div className="space-y-3">
        {zones.map((zone) => (
          <div key={zone.id} className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3">
            <p className="text-sm font-semibold font-heading">
              {zone.name} — {zone.city}/{zone.state}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cap. Manhã</label>
                <Input
                  type="number"
                  min={0}
                  value={zone.morning_capacity}
                  onChange={(e) =>
                    updateCapacity(zone.id, "morning_capacity", parseInt(e.target.value) || 0)
                  }
                  className="rounded-xl border-0 bg-[#e1e3e4]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cap. Tarde</label>
                <Input
                  type="number"
                  min={0}
                  value={zone.afternoon_capacity}
                  onChange={(e) =>
                    updateCapacity(zone.id, "afternoon_capacity", parseInt(e.target.value) || 0)
                  }
                  className="rounded-xl border-0 bg-[#e1e3e4]"
                />
              </div>
            </div>
            <Button size="sm" onClick={() => saveZone(zone)} className="rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]">
              Salvar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

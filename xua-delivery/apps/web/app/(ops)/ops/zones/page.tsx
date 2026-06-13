"use client";

import { useEffect, useState } from "react";

interface ZoneCoverage {
  id: string;
  neighborhood: string | null;
  zip_code: string | null;
}

interface Zone {
  id: string;
  name: string;
  is_active: boolean;
  coverage?: ZoneCoverage[];
}

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/zones?all=true")
      .then((r) => {
        if (!r.ok) throw new Error("Erro ao carregar zonas");
        return r.json();
      })
      .then((data) => setZones(data.zones ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Zonas de Cobertura</h1>
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading text-foreground">Zonas de Cobertura</h1>

      {zones.length === 0 ? (
        <div className="rounded-2xl bg-white/95 p-6 text-center text-sm text-muted-foreground shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          Nenhuma zona cadastrada.
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((zone) => (
            <div key={zone.id} className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold font-heading">{zone.name}</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    zone.is_active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {zone.is_active ? "Ativa" : "Inativa"}
                </span>
              </div>

              {zone.coverage && zone.coverage.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {zone.coverage.map((cov) => (
                    <span
                      key={cov.id}
                      className="inline-flex items-center rounded-lg bg-[#e1e3e4]/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {cov.neighborhood ?? cov.zip_code}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

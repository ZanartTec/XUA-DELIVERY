"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ZoneCoverage {
  id: string;
  neighborhood: string | null;
  zip_code: string | null;
}

interface Zone {
  id: string;
  name: string;
  distributor_id: string;
  is_active: boolean;
  coverage?: ZoneCoverage[];
}

interface DistributorOption {
  id: string;
  name: string;
}

interface CreateDraft {
  name: string;
  distributor_id: string;
}

const EMPTY_CREATE_DRAFT: CreateDraft = { name: "", distributor_id: "" };

interface CoverageDraft {
  neighborhood: string;
  zip_code: string;
}

const EMPTY_COVERAGE_DRAFT: CoverageDraft = { neighborhood: "", zip_code: "" };

async function extractError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" ? body.error : fallback;
}

// ---------------------------------------------------------------------------
// Zone card (lista de cobertura + formulário de adicionar cobertura)
// ---------------------------------------------------------------------------

function ZoneCard({
  zone,
  onCoverageAdded,
  onCoverageRemoved,
}: {
  zone: Zone;
  onCoverageAdded: (zoneId: string, coverage: ZoneCoverage) => void;
  onCoverageRemoved: (zoneId: string, coverageId: string) => void;
}) {
  const [addingCoverage, setAddingCoverage] = useState(false);
  const [draft, setDraft] = useState<CoverageDraft>({ ...EMPTY_COVERAGE_DRAFT });
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAddCoverage() {
    if (!draft.neighborhood.trim()) {
      toast.error("Informe o bairro");
      return;
    }
    if (!/^\d{5}$/.test(draft.zip_code.trim())) {
      toast.error("CEP deve ter 5 dígitos");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/zones/${zone.id}/coverage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          neighborhood: draft.neighborhood.trim(),
          zip_code: draft.zip_code.trim(),
        }),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao adicionar cobertura"));
      const coverage = await res.json();
      onCoverageAdded(zone.id, coverage);
      setDraft({ ...EMPTY_COVERAGE_DRAFT });
      setAddingCoverage(false);
      toast.success("Cobertura adicionada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar cobertura");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCoverage(coverageId: string) {
    setRemovingId(coverageId);
    try {
      const res = await fetch(`/api/zones/${zone.id}/coverage?coverageId=${coverageId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao remover cobertura"));
      onCoverageRemoved(zone.id, coverageId);
      toast.success("Cobertura removida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover cobertura");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold font-heading">{zone.name}</p>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            zone.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
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
              className="inline-flex items-center gap-1 rounded-lg bg-[#e1e3e4]/60 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {cov.neighborhood ?? cov.zip_code}
              <button
                type="button"
                disabled={removingId === cov.id}
                onClick={() => handleRemoveCoverage(cov.id)}
                className="text-muted-foreground/60 hover:text-red-600 disabled:opacity-50"
                aria-label={`Remover cobertura ${cov.neighborhood ?? cov.zip_code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {addingCoverage ? (
        <div className="space-y-2 pt-2 border-t border-[#e4e8f1]">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={draft.neighborhood}
              onChange={(e) => setDraft({ ...draft, neighborhood: e.target.value })}
              placeholder="Bairro"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
            <Input
              value={draft.zip_code}
              onChange={(e) => setDraft({ ...draft, zip_code: e.target.value.replace(/\D/g, "").slice(0, 5) })}
              placeholder="CEP (5 dígitos)"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={saving}
              onClick={handleAddCoverage}
              className="h-7 text-xs rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
            >
              {saving ? "Salvando..." : "Adicionar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs rounded-xl"
              onClick={() => {
                setAddingCoverage(false);
                setDraft({ ...EMPTY_COVERAGE_DRAFT });
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          className="h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
          onClick={() => setAddingCoverage(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Adicionar bairro/CEP
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [distributors, setDistributors] = useState<DistributorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ ...EMPTY_CREATE_DRAFT });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/zones").then((r) => {
        if (!r.ok) throw new Error("Erro ao carregar zonas");
        return r.json();
      }),
      fetch("/api/distributor/all")
        .then((r) => r.json())
        .then((d) =>
          setDistributors(
            (d.distributors ?? []).map((dist: { id: string; name: string }) => ({
              id: dist.id,
              name: dist.name,
            }))
          )
        ),
    ])
      .then(([zonesData]) => {
        // GET /api/zones retorna a lista diretamente (array), sem wrapper.
        setZones(Array.isArray(zonesData) ? zonesData : (zonesData.zones ?? []));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar zonas"))
      .finally(() => setLoading(false));
  }, []);

  function validateCreate(d: CreateDraft): string | null {
    if (!d.name.trim()) return "Informe o nome da zona";
    if (!d.distributor_id) return "Selecione a distribuidora";
    return null;
  }

  async function handleCreate() {
    const err = validateCreate(createDraft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createDraft.name.trim(),
          distributor_id: createDraft.distributor_id,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao criar zona"));
      const zone = await res.json();
      setZones((prev) => [...prev, { ...zone, coverage: [] }]);
      setCreateDraft({ ...EMPTY_CREATE_DRAFT });
      setCreating(false);
      toast.success("Zona criada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar zona");
    } finally {
      setSaving(false);
    }
  }

  function handleCoverageAdded(zoneId: string, coverage: ZoneCoverage) {
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, coverage: [...(z.coverage ?? []), coverage] } : z))
    );
  }

  function handleCoverageRemoved(zoneId: string, coverageId: string) {
    setZones((prev) =>
      prev.map((z) =>
        z.id === zoneId ? { ...z, coverage: (z.coverage ?? []).filter((c) => c.id !== coverageId) } : z
      )
    );
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

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Zonas de Cobertura</h1>
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Zonas de Cobertura</h1>
        {!creating && (
          <Button
            size="sm"
            className="rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
            onClick={() => setCreating(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Nova zona
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-2xl bg-white/95 p-5 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold font-heading">Nova zona</p>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateDraft({ ...EMPTY_CREATE_DRAFT });
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nome *
              </label>
              <Input
                value={createDraft.name}
                onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })}
                placeholder="Ex: Zona Sul"
                className="rounded-xl border-[#d9dde3] text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Distribuidora *
              </label>
              <select
                value={createDraft.distributor_id}
                onChange={(e) => setCreateDraft({ ...createDraft, distributor_id: e.target.value })}
                className="w-full rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecione…</option>
                {distributors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            disabled={saving}
            onClick={handleCreate}
            className="rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
          >
            <Save className="mr-1 h-4 w-4" />
            {saving ? "Salvando..." : "Criar zona"}
          </Button>
        </div>
      )}

      {zones.length === 0 && !creating ? (
        <div className="rounded-2xl bg-white/95 p-6 text-center text-sm text-muted-foreground shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          Nenhuma zona cadastrada.
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              onCoverageAdded={handleCoverageAdded}
              onCoverageRemoved={handleCoverageRemoved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Link2, Mail, Phone, UserX } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnlinkedDriver {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

interface DistributorOption {
  id: string;
  name: string;
}

async function extractError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" ? body.error : fallback;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function UnlinkedDriverCard({
  driver,
  distributors,
  onLinked,
}: {
  driver: UnlinkedDriver;
  distributors: DistributorOption[];
  onLinked: (driverId: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [linking, setLinking] = useState(false);

  async function handleLink() {
    if (!selected) {
      toast.error("Selecione uma distribuidora");
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(`/api/distributor/drivers/${driver.id}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distributor_id: selected }),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao vincular motorista"));
      onLinked(driver.id);
      toast.success(`${driver.name} vinculado com sucesso`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao vincular motorista");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3 border border-amber-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <UserX className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold font-heading leading-tight truncate">{driver.name}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1 truncate">
                <Mail className="h-3 w-3 shrink-0" />
                {driver.email}
              </span>
              {driver.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3 shrink-0" />
                  {driver.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <Badge className="shrink-0 bg-amber-100 text-amber-700 hover:bg-amber-100">Órfão</Badge>
      </div>

      <div className="flex gap-2 pt-1">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm"
        >
          <option value="">Selecione a distribuidora…</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={linking}
          onClick={handleLink}
          className="shrink-0 rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
        >
          <Link2 className="mr-1 h-4 w-4" />
          {linking ? "Vinculando..." : "Vincular"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OpsDriversPage() {
  const [unlinked, setUnlinked] = useState<UnlinkedDriver[]>([]);
  const [distributors, setDistributors] = useState<DistributorOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/distributor/drivers/unlinked")
        .then((r) => r.json())
        .then((d) => setUnlinked(d.drivers ?? [])),
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
      .catch(() => toast.error("Erro ao carregar motoristas"))
      .finally(() => setLoading(false));
  }, []);

  function handleLinked(driverId: string) {
    setUnlinked((prev) => prev.filter((d) => d.id !== driverId));
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Motoristas</h1>
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
      <div>
        <h1 className="text-lg font-bold font-heading text-foreground">Motoristas</h1>
        <p className="text-xs text-muted-foreground">
          Motoristas sem distribuidora vinculada — cadastro por distribuidora fica em cada
          distribuidor (Motoristas &gt; Nova distribuidora).
        </p>
      </div>

      {unlinked.length === 0 ? (
        <div className="rounded-2xl bg-white/95 px-6 py-10 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
            <Link2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="mt-3 text-sm font-semibold font-heading text-foreground">
            Nenhum motorista órfão
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Todos os motoristas cadastrados estão vinculados a uma distribuidora.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {unlinked.map((driver) => (
            <UnlinkedDriverCard
              key={driver.id}
              driver={driver}
              distributors={distributors}
              onLinked={handleLinked}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ListPlus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/lib/utils";
import { coverageLabel, parseCoverageList } from "@/src/lib/zone-coverage";
import {
  useAddCoverage,
  useAddCoverageBulk,
  usePreviewCoverage,
  useRemoveCoverage,
  type CoverageEntry,
  type CoveragePreview,
  type OpsZone,
} from "@/src/hooks/ops/use-ops-zones";
import { OPS_CTA, OPS_FIELD_LABEL, OPS_INPUT, OPS_ROW_ACTION } from "./styles";

type Mode = "idle" | "single" | "bulk";

const PLACEHOLDER = `Centro; 36010-000
Granbery
36035-000`;

export function CoverageEditor({ zone }: { zone: OpsZone }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [neighborhood, setNeighborhood] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [preview, setPreview] = useState<CoveragePreview | null>(null);

  const addCoverage = useAddCoverage();
  const addBulk = useAddCoverageBulk();
  const previewCoverage = usePreviewCoverage();
  const removeCoverage = useRemoveCoverage();

  const parsedLines = useMemo(() => parseCoverageList(bulkText), [bulkText]);
  const invalidLines = parsedLines.filter((line) => line.error);
  const validEntries = parsedLines
    .map((line) => line.entry)
    .filter((entry): entry is CoverageEntry => Boolean(entry));

  function resetForms() {
    setMode("idle");
    setNeighborhood("");
    setZipCode("");
    setBulkText("");
    setPreview(null);
  }

  async function handleAddSingle() {
    const entry: CoverageEntry = {
      neighborhood: neighborhood.trim() || undefined,
      zip_code: zipCode.trim() || undefined,
    };
    if (!entry.neighborhood && !entry.zip_code) {
      toast.error("Informe bairro ou CEP");
      return;
    }

    try {
      const result = await addCoverage.mutateAsync({ zoneId: zone.id, entry });
      toast.success("Cobertura adicionada");
      warnAboutOverlaps(result.warnings);
      resetForms();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar cobertura");
    }
  }

  async function handlePreview() {
    if (validEntries.length === 0) {
      toast.error("Nenhuma linha válida para importar");
      return;
    }
    try {
      setPreview(
        await previewCoverage.mutateAsync({ zoneId: zone.id, items: validEntries })
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao analisar a lista");
    }
  }

  async function handleConfirmBulk() {
    try {
      const result = await addBulk.mutateAsync({ zoneId: zone.id, items: validEntries });
      if (result.created_count === 0) {
        toast.error("Nenhuma linha foi importada — todas já são atendidas por outra zona");
        return;
      }
      toast.success(
        `${result.created_count} ${result.created_count === 1 ? "cobertura importada" : "coberturas importadas"}`
      );
      warnAboutOverlaps(result.warnings);
      resetForms();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao importar cobertura");
    }
  }

  async function handleRemove(coverageId: string) {
    try {
      await removeCoverage.mutateAsync({ zoneId: zone.id, coverageId });
      toast.success("Cobertura removida");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover cobertura");
    }
  }

  return (
    <div className="space-y-2">
      {zone.coverage.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {zone.coverage.map((coverage) => (
            <span
              key={coverage.id}
              className="inline-flex items-center gap-1 rounded-lg bg-[#e1e3e4]/60 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {coverageLabel(coverage)}
              <button
                type="button"
                disabled={removeCoverage.isPending}
                onClick={() => handleRemove(coverage.id)}
                aria-label={`Remover cobertura ${coverageLabel(coverage)}`}
                className="text-muted-foreground/60 hover:text-red-600 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className={OPS_ROW_ACTION} onClick={() => setMode("single")}>
            <Plus className="mr-1 h-3 w-3" />
            Adicionar bairro/CEP
          </Button>
          <Button size="sm" className={OPS_ROW_ACTION} onClick={() => setMode("bulk")}>
            <ListPlus className="mr-1 h-3 w-3" />
            Importar lista
          </Button>
        </div>
      )}

      {mode === "single" && (
        <div className="space-y-2 border-t border-[#e4e8f1] pt-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              autoFocus
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Bairro"
              className={OPS_INPUT}
            />
            <Input
              value={zipCode}
              onChange={(e) => setZipCode(formatZipInput(e.target.value))}
              placeholder="CEP (8 dígitos)"
              inputMode="numeric"
              className={OPS_INPUT}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Informe bairro, CEP ou os dois. O CEP casa com o endereço do cliente; o
            bairro é usado para encontrar distribuidoras concorrentes na mesma área.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={addCoverage.isPending}
              onClick={handleAddSingle}
              className={cn(OPS_CTA, "h-7 text-xs")}
            >
              {addCoverage.isPending ? "Salvando..." : "Adicionar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-xl text-xs" onClick={resetForms}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {mode === "bulk" && (
        <div className="space-y-2 border-t border-[#e4e8f1] pt-2">
          <label htmlFor={`bulk-${zone.id}`} className={OPS_FIELD_LABEL}>
            Uma cobertura por linha
          </label>
          <Textarea
            id={`bulk-${zone.id}`}
            autoFocus
            rows={6}
            value={bulkText}
            onChange={(e) => {
              setBulkText(e.target.value);
              setPreview(null);
            }}
            placeholder={PLACEHOLDER}
            className={cn(OPS_INPUT, "font-mono text-xs")}
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{validEntries.length} linha(s) válida(s)</span>
            {invalidLines.length > 0 && (
              <span className="text-red-600">{invalidLines.length} com erro</span>
            )}
          </div>

          {invalidLines.length > 0 && (
            <ul className="max-h-24 space-y-0.5 overflow-y-auto rounded-xl bg-red-50 p-2 text-[11px] text-red-700">
              {invalidLines.slice(0, 10).map((line) => (
                <li key={line.line}>
                  Linha {line.line}: “{line.raw}” — {line.error}
                </li>
              ))}
            </ul>
          )}

          {preview && <PreviewSummary preview={preview} />}

          <div className="flex flex-wrap gap-2">
            {!preview ? (
              <Button
                size="sm"
                disabled={previewCoverage.isPending || validEntries.length === 0}
                onClick={handlePreview}
                className={cn(OPS_CTA, "h-7 text-xs")}
              >
                {previewCoverage.isPending ? "Analisando..." : "Analisar lista"}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={addBulk.isPending || preview.accepted_count === 0}
                onClick={handleConfirmBulk}
                className={cn(OPS_CTA, "h-7 text-xs")}
              >
                {addBulk.isPending
                  ? "Importando..."
                  : `Importar ${preview.accepted_count} linha(s)`}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 rounded-xl text-xs" onClick={resetForms}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Resultado da análise: o que entra, o que é bloqueado e o que só avisa. */
function PreviewSummary({ preview }: { preview: CoveragePreview }) {
  return (
    <div className="space-y-2 rounded-xl bg-[#e1e3e4]/40 p-2.5 text-[11px]">
      <p className="font-semibold text-foreground">
        {preview.accepted_count} de {preview.total} serão importadas
        {preview.duplicates_in_payload > 0 &&
          ` · ${preview.duplicates_in_payload} repetida(s) na própria lista`}
      </p>

      {preview.conflicts.length > 0 && (
        <div className="space-y-1">
          <p className="font-semibold text-red-700">
            {preview.conflicts.length} bloqueada(s) — já atendidas por outra zona desta
            distribuidora:
          </p>
          <ul className="max-h-24 space-y-0.5 overflow-y-auto text-red-700">
            {preview.conflicts.slice(0, 10).map((conflict, index) => (
              <li key={`${conflict.zone_id}-${index}`}>
                {coverageLabel(conflict)} → zona “{conflict.zone_name}”
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.warnings.length > 0 && <OverlapWarning warnings={preview.warnings} />}
    </div>
  );
}

function OverlapWarning({
  warnings,
}: {
  warnings: { distributor_name: string; zone_name: string }[];
}) {
  const distributors = Array.from(new Set(warnings.map((w) => w.distributor_name)));
  return (
    <div className="flex items-start gap-1.5 text-amber-700">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <p>
        Também atendido por {distributors.join(", ")}. Isso é permitido — o cliente
        escolhe a distribuidora no checkout.
      </p>
    </div>
  );
}

function warnAboutOverlaps(warnings: { distributor_name: string }[]) {
  if (warnings.length === 0) return;
  const distributors = Array.from(new Set(warnings.map((w) => w.distributor_name)));
  toast.warning(`Área também atendida por ${distributors.join(", ")}`);
}

/** Máscara de CEP: só dígitos, hífen automático depois do 5º. */
function formatZipInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

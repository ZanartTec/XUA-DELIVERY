import { normalizeZipCode } from "@xua/shared/utils/zip";
import type { CoverageEntry } from "@/src/hooks/ops/use-ops-zones";

export interface ParsedCoverageLine {
  line: number;
  raw: string;
  entry?: CoverageEntry;
  error?: string;
}

const SEPARATOR = /[;,\t]|\s{2,}/;

/**
 * Converte a lista colada pela Ops em entradas de cobertura.
 *
 * Cada linha aceita "Bairro", "36010-000" ou "Bairro; 36010-000" (também com
 * vírgula, tab ou espaços duplos como separador). A ordem dos campos não
 * importa: o token que tiver 8 dígitos é o CEP.
 */
export function parseCoverageList(text: string): ParsedCoverageLine[] {
  return text
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter(({ raw }) => raw.length > 0)
    .map(({ raw, line }): ParsedCoverageLine => {
      const tokens = raw
        .split(SEPARATOR)
        .map((token) => token.trim())
        .filter(Boolean);

      let zipCode: string | undefined;
      const neighborhoodParts: string[] = [];

      for (const token of tokens) {
        const normalized = normalizeZipCode(token);
        if (normalized && !zipCode) {
          zipCode = normalized;
          continue;
        }
        neighborhoodParts.push(token);
      }

      const neighborhood = neighborhoodParts.join(" ").trim() || undefined;

      if (!neighborhood && !zipCode) {
        return { line, raw, error: "Informe bairro ou CEP" };
      }
      if (neighborhood && neighborhood.length < 2) {
        return { line, raw, error: "Bairro deve ter ao menos 2 caracteres" };
      }
      // Um token só de dígitos que não virou CEP é quase sempre CEP digitado errado.
      if (!zipCode && neighborhood && /^\d+$/.test(neighborhood)) {
        return { line, raw, error: "CEP deve ter 8 dígitos" };
      }

      return { line, raw, entry: { neighborhood, zip_code: zipCode } };
    });
}

/** Rótulo curto de uma cobertura para chips e listas de conflito. */
export function coverageLabel(entry: {
  neighborhood?: string | null;
  zip_code?: string | null;
}): string {
  if (entry.neighborhood && entry.zip_code) return `${entry.neighborhood} · ${entry.zip_code}`;
  return entry.neighborhood ?? entry.zip_code ?? "—";
}


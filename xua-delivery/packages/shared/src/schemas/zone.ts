import { z } from "zod";
import { normalizeZipCode } from "../utils/zip";

// ─── Zona ────────────────────────────────────────────────────────────────────

export const zoneSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres"),
  distributor_id: z.string().uuid("Distribuidor inválido"),
  is_active: z.boolean().default(true),
});
export type ZoneInput = z.infer<typeof zoneSchema>;

/**
 * Edição de zona. Deliberadamente NÃO aceita `distributor_id`: mover uma zona
 * de distribuidora muda o roteamento de todos os endereços já vinculados, então
 * tem rota própria (`PATCH /:id/transfer`) com guard de pedidos em aberto.
 */
export const zoneUpdateSchema = z
  .object({
    name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => d.name !== undefined || d.is_active !== undefined, {
    message: "Informe ao menos um campo para atualizar",
  });
export type ZoneUpdateInput = z.infer<typeof zoneUpdateSchema>;

export const zoneTransferSchema = z.object({
  distributor_id: z.string().uuid("Distribuidor inválido"),
});
export type ZoneTransferInput = z.infer<typeof zoneTransferSchema>;

const LIMIT_QUERY = z.coerce
  .number()
  .int("limit deve ser inteiro")
  .min(1, "limit deve ser maior que zero")
  .max(100, "limit deve ser no máximo 100")
  .default(20);

const OFFSET_QUERY = z.coerce
  .number()
  .int("offset deve ser inteiro")
  .min(0, "offset não pode ser negativo")
  .default(0);

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

/**
 * Filtros da listagem operacional. Todos são aplicados no banco — a tela nunca
 * baixa a base inteira para filtrar no cliente.
 */
export const zoneOpsQuerySchema = z.object({
  distributor_id: z.preprocess(
    emptyToUndefined,
    z.string().uuid("Distribuidor inválido").optional()
  ),
  /** Busca por nome da zona. */
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  /** Busca por bairro ou CEP dentro da cobertura — "que zona atende o Centro?". */
  coverage: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  limit: LIMIT_QUERY,
  offset: OFFSET_QUERY,
});
export type ZoneOpsQueryInput = z.infer<typeof zoneOpsQuerySchema>;

/** Cobertura de UMA zona, paginada: uma zona sozinha pode ter milhares de linhas. */
export const zoneCoverageQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  limit: LIMIT_QUERY,
  offset: OFFSET_QUERY,
});
export type ZoneCoverageQueryInput = z.infer<typeof zoneCoverageQuerySchema>;

// ─── Cobertura ───────────────────────────────────────────────────────────────

/**
 * Uma linha de cobertura casa por bairro OU por CEP — pelo menos um é
 * obrigatório (o banco aceita ambos nulos, o que gera linha inútil).
 *
 * O CEP é normalizado para "#####-###", o formato gravado no banco e procurado
 * por `consumersService.createAddress`. A versão anterior deste schema exigia 5
 * dígitos, o que fazia toda cobertura criada pela API nunca casar com endereço.
 */
export const coverageSchema = z
  .object({
    neighborhood: z
      .string()
      .trim()
      .min(2, "Bairro deve ter ao menos 2 caracteres")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    zip_code: z
      .string()
      .trim()
      .optional()
      .or(z.literal("").transform(() => undefined))
      .transform((v, ctx) => {
        if (v === undefined) return undefined;
        const normalized = normalizeZipCode(v);
        if (!normalized) {
          ctx.addIssue({ code: "custom", message: "CEP deve ter 8 dígitos" });
          return z.NEVER;
        }
        return normalized;
      }),
  })
  .refine((d) => Boolean(d.neighborhood) || Boolean(d.zip_code), {
    message: "Informe ao menos bairro ou CEP",
  });
export type CoverageInput = z.infer<typeof coverageSchema>;

/** Import em massa — a Ops cola uma lista de bairros/CEPs de uma vez. */
export const coverageBulkSchema = z.object({
  items: z
    .array(coverageSchema)
    .min(1, "Informe ao menos uma linha de cobertura")
    .max(500, "Máximo de 500 linhas por importação"),
});
export type CoverageBulkInput = z.infer<typeof coverageBulkSchema>;

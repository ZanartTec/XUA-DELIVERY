import { z } from "zod";
import { DEPOSIT_MOVEMENT_TYPE_VALUES } from "../enums/index";

/** Remove tudo que não é dígito de um CPF/CNPJ. */
export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, "");
}

/** Valida dígitos verificadores de CPF (11 dígitos). */
function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcCheck = (slice: number): number => {
    let sum = 0;
    for (let i = 0; i < slice; i++) {
      sum += Number(cpf[i]) * (slice + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calcCheck(9) === Number(cpf[9]) && calcCheck(10) === Number(cpf[10]);
}

/** Valida dígitos verificadores de CNPJ (14 dígitos). */
function isValidCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcCheck = (length: number): number => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(cnpj[i]) * weights[i];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return calcCheck(12) === Number(cnpj[12]) && calcCheck(13) === Number(cnpj[13]);
}

/** Verdadeiro se o documento normalizado é um CPF ou CNPJ válido. */
export function isValidDocument(normalized: string): boolean {
  return isValidCpf(normalized) || isValidCnpj(normalized);
}

const documentField = z
  .string()
  .trim()
  .min(1, "Documento é obrigatório")
  .transform(normalizeDocument)
  .refine(isValidDocument, "CPF/CNPJ inválido");

/** Busca de consumidor por documento (distribuidora). */
export const depositLookupSchema = z.object({
  document: documentField,
});
export type DepositLookupInput = z.infer<typeof depositLookupSchema>;

/** Habilitação/atualização de um consumidor no programa de caução. */
export const depositProgramUpsertSchema = z.object({
  consumer_id: z.string().uuid("Consumidor inválido"),
  max_bottles: z.number().int().min(0, "Limite não pode ser negativo"),
  notes: z.string().trim().max(500).optional(),
});
export type DepositProgramUpsertInput = z.infer<typeof depositProgramUpsertSchema>;

/** Alteração de habilitação/limite de um vínculo existente. */
export const depositProgramPatchSchema = z.object({
  is_enabled: z.boolean().optional(),
  max_bottles: z.number().int().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type DepositProgramPatchInput = z.infer<typeof depositProgramPatchSchema>;

/** Ajuste manual / baixa de saldo de vasilhames caucionados. */
export const depositAdjustSchema = z.object({
  inventory_item_id: z.string().uuid("Item inválido"),
  bottles_delta: z.number().int().refine((v) => v !== 0, "Delta não pode ser zero"),
  movement_type: z.enum(["MANUAL_ADJUSTMENT", "WRITE_OFF"] as const),
  notes: z.string().trim().min(3, "Justificativa obrigatória").max(500),
});
export type DepositAdjustInput = z.infer<typeof depositAdjustSchema>;

/** Preview de settlement de vasilhames no checkout (consumidor). */
export const depositPreviewSchema = z.object({
  distributor_id: z.string().uuid("Distribuidora inválida"),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid("Produto inválido"),
        quantity: z.number().int().min(1),
      })
    )
    .min(1, "Adicione ao menos um item"),
  empty_bottles: z
    .array(
      z.object({
        bottle_product_id: z.string().uuid("Vasilhame inválido"),
        quantity: z.number().int().min(0),
      })
    )
    .optional()
    .default([]),
});
export type DepositPreviewInput = z.infer<typeof depositPreviewSchema>;

export const DEPOSIT_ADJUST_MOVEMENT_TYPES = DEPOSIT_MOVEMENT_TYPE_VALUES;

import { z } from "zod";

const NAME = z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120);
const DESCRIPTION = z.string().trim().max(2000).nullish();
const IMAGE_URL = z.string().trim().url("URL de imagem inválida").max(2048).nullish();
const PRICE_CENTS = z.number().int("Preço deve ser inteiro (centavos)").positive("Preço deve ser positivo");
const DEPOSIT_CENTS = z.number().int().min(0, "Caução não pode ser negativo").default(0);

export const productCreateSchema = z.object({
  name: NAME,
  description: DESCRIPTION,
  image_url: IMAGE_URL,
  price_cents: PRICE_CENTS,
  deposit_cents: DEPOSIT_CENTS.optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z
  .object({
    name: NAME.optional(),
    description: DESCRIPTION,
    image_url: IMAGE_URL,
    price_cents: PRICE_CENTS.optional(),
    deposit_cents: DEPOSIT_CENTS.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

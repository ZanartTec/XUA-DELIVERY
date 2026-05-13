import { z } from "zod";

export const bannerTypeSchema = z.enum(["CAROUSEL", "FEATURED"]);
export type BannerTypeInput = z.infer<typeof bannerTypeSchema>;

const TITLE = z.string().trim().min(2, "Título deve ter ao menos 2 caracteres").max(120);
const SHORT_TEXT = z.string().trim().max(200).nullish();
const URL_FIELD = z.string().trim().url("URL inválida").max(2048).nullish();
const COLOR = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Cor inválida (use #RGB, #RRGGBB ou #RRGGBBAA)")
  .nullish();

const baseFields = {
  type: bannerTypeSchema,
  title: TITLE,
  subtitle: SHORT_TEXT,
  tag: SHORT_TEXT,
  highlight: SHORT_TEXT,
  cta_text: SHORT_TEXT,
  cta_url: URL_FIELD,
  bg_color: COLOR,
  bg_gradient_from: COLOR,
  bg_gradient_to: COLOR,
  bg_image_url: URL_FIELD,
  text_color: COLOR,
  image_url: URL_FIELD,
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
};

export const bannerCreateSchema = z.object(baseFields);
export type BannerCreateInput = z.infer<typeof bannerCreateSchema>;

export const bannerUpdateSchema = z
  .object({
    ...baseFields,
    type: bannerTypeSchema.optional(),
    title: TITLE.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });
export type BannerUpdateInput = z.infer<typeof bannerUpdateSchema>;

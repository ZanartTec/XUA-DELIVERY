import { z } from "zod";

export const createOrderSchema = z.object({
  address_id: z.string().uuid("Endereço inválido"),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  delivery_window: z.enum(["morning", "afternoon"]),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid("Produto inválido"),
        quantity: z.number().int().min(1, "Quantidade mínima: 1"),
      })
    )
    .min(1, "Adicione ao menos um item"),
  empty_bottles_qty: z.number().int().min(0).default(0),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});
export type RatingInput = z.infer<typeof ratingSchema>;

export const bottleExchangeSchema = z.object({
  driver_id: z.string().uuid(),
  returned_empty_qty: z.number().int().min(0, "Quantidade inválida"),
  bottle_condition: z.enum(["ok", "damaged", "dirty"]),
});
export type BottleExchangeInput = z.infer<typeof bottleExchangeSchema>;

export const nonCollectionSchema = z.object({
  driver_id: z.string().uuid(),
  reason: z.enum([
    "client_absent",
    "no_access",
    "no_empty_bottles",
    "unsafe_location",
    "other",
  ]),
  notes: z.string().trim().min(10, "Detalhe deve ter ao menos 10 caracteres").optional(),
}).superRefine((data, ctx) => {
  if (data.reason === "other" && (!data.notes || data.notes.length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["notes"],
      message: "Detalhe deve ter ao menos 10 caracteres",
    });
  }
});
export type NonCollectionInput = z.infer<typeof nonCollectionSchema>;

export const rejectOrderSchema = z.object({
  reason: z.enum([
    "out_of_stock",
    "delivery_area_issue",
    "operational_capacity",
    "other",
  ]),
  details: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.reason === "other" && (!data.details || data.details.length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["details"],
      message: "Detalhe deve ter ao menos 10 caracteres para 'Outro'",
    });
  }
});
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;

export const reconciliationSchema = z.object({
  items: z.array(
    z.object({
      order_id: z.string().uuid(),
      returned_empty_qty: z.number().int().min(0),
    })
  ).min(1),
  justification: z.string().trim().min(5, "Justificativa deve ter ao menos 5 caracteres").optional(),
});
export type ReconciliationInput = z.infer<typeof reconciliationSchema>;

export const rescheduleSchema = z.object({
  new_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  new_delivery_window: z.enum(["morning", "afternoon"]),
  reason: z.string().min(5, "Motivo deve ter ao menos 5 caracteres"),
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const subscriptionUpdateSchema = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
});
export type SubscriptionUpdateInput = z.infer<typeof subscriptionUpdateSchema>;

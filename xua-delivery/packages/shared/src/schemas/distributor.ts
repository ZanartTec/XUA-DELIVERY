import { z } from "zod";
import { DELIVERY_WINDOW_INPUT_VALUES } from "../enums";

export const distributorQuerySchema = z.object({
  zone_id: z.string().uuid("zone_id inválido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)").optional(),
  window: z.enum(DELIVERY_WINDOW_INPUT_VALUES).optional(),
});
export type DistributorQueryInput = z.infer<typeof distributorQuerySchema>;

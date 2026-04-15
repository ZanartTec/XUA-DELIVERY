import { z } from "zod";

export const distributorQuerySchema = z.object({
  zone_id: z.string().uuid("zone_id inválido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  window: z.enum(["morning", "afternoon"]),
});
export type DistributorQueryInput = z.infer<typeof distributorQuerySchema>;

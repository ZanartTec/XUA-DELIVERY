import { z } from "zod";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const weekdayConfigSchema = z.object({
  weekday: z.number().int().min(0, "weekday deve ser 0-6").max(6, "weekday deve ser 0-6"),
  is_active: z.boolean(),
  lead_time_hours: z.number().int().min(0).max(72).optional(),
});
export type WeekdayConfigInput = z.infer<typeof weekdayConfigSchema>;

export const weekdayBulkSchema = z.object({
  weekdays: z.array(weekdayConfigSchema).min(1).max(7),
});
export type WeekdayBulkInput = z.infer<typeof weekdayBulkSchema>;

export const blockDateSchema = z.object({
  blocked_date: z.string().regex(isoDateRegex, "Data inválida (YYYY-MM-DD)"),
  reason: z.string().max(200).optional(),
});
export type BlockDateInput = z.infer<typeof blockDateSchema>;

export const availableDatesQuerySchema = z.object({
  distributor_id: z.string().uuid("distributor_id inválido").optional(),
  days: z.coerce.number().int().min(1).max(30).default(14),
});
export type AvailableDatesQuery = z.infer<typeof availableDatesQuerySchema>;

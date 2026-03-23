import { z } from "zod";

export const auditExportSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  distributorId: z.string().uuid().optional(),
  eventTypes: z.array(z.string()).optional(),
});
export type AuditExportInput = z.infer<typeof auditExportSchema>;

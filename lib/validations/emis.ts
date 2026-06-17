import { z } from "zod";

export const emisReportSchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  term_id: z.string().uuid().optional(),
});

export type EmisReportInput = z.infer<typeof emisReportSchema>;

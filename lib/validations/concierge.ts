import { z } from "zod";

export const conciergeRequestSchema = z.object({
  school_name: z.string().min(2).max(200),
  contact_name: z.string().min(2).max(120),
  contact_phone: z.string().min(5).max(30),
  contact_email: z.string().email(),
  district: z.string().max(120).optional(),
  student_count: z.number().int().min(0).optional(),
  current_system: z.string().max(60).optional(),
  preferred_date: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const conciergeUpdateSchema = z.object({
  status: z.enum(["new", "contacted", "in_progress", "completed", "cancelled"]).optional(),
  internal_notes: z.string().max(2000).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export type ConciergeRequestInput = z.infer<typeof conciergeRequestSchema>;

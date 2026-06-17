import { z } from "zod";

export const importTemplateSchema = z.object({
  target: z.enum(["sms_template", "fee_structure", "report_comment"]),
  class_id: z.string().uuid().optional(),
  term_id: z.string().uuid().optional(),
});

export const createMarketplaceTemplateSchema = z.object({
  category: z.enum(["sms_template", "fee_structure", "report_comment"]),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  body: z.record(z.string(), z.unknown()),
  variables: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  is_featured: z.boolean().optional(),
});

export const updateMarketplaceTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  variables: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  is_featured: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
});

export type ImportTemplateInput = z.infer<typeof importTemplateSchema>;

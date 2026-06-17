import { z } from "zod";

// Accept either full_name OR (first_name + last_name). Normalised downstream.
export const bulkImportRowSchema = z
  .object({
    full_name: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    class_name: z.string().min(1),
    date_of_birth: z.string().optional(),
    enrollment_date: z.string().optional(),
    gender: z.enum(["male", "female", "other"]).optional(),
    parent_name: z.string().min(1),
    parent_phone: z.string().min(1),
    admission_number: z.string().optional(),
    parent_email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    district: z.string().optional(),
  })
  .refine(
    (r) => Boolean(r.full_name?.trim()) || (Boolean(r.first_name?.trim()) && Boolean(r.last_name?.trim())),
    { message: "Provide full_name or both first_name and last_name" }
  );

export const bulkImportBodySchema = z.object({
  rows: z.array(bulkImportRowSchema).min(1).max(5000),
});

export type BulkImportRow = z.infer<typeof bulkImportRowSchema>;

export function resolveFullName(row: BulkImportRow): string {
  if (row.full_name?.trim()) return row.full_name.trim();
  return `${row.first_name?.trim() ?? ""} ${row.last_name?.trim() ?? ""}`.trim();
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("3"))) return `+256${digits}`;
  return `+${digits}`;
}

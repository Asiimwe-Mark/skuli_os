import { z } from 'zod';

export const staffSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  role_title: z.string().min(1, 'Role is required'),
  national_id: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  bank_account: z.string().optional().nullable(),
  nssf_number: z.string().optional().nullable(),
  basic_salary: z.number().positive('Salary must be positive'),
  hire_date: z.string(),
  is_active: z.boolean().default(true),
});

export const payrollRunSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2030),
});

export const payrollItemSchema = z.object({
  staff_id: z.string().uuid(),
  basic_salary: z.number(),
  allowances: z.record(z.string(), z.number()),
  deductions: z.record(z.string(), z.number()),
});

export type StaffFormData = z.infer<typeof staffSchema>;
export type PayrollRunFormData = z.infer<typeof payrollRunSchema>;

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const onboardSchema = z.object({
  // School details
  school_name: z.string().min(2, 'School name is required'),
  address: z.string().min(2, 'Address is required'),
  district: z.string().min(1, 'Select a district'),
  phone: z
    .string()
    .regex(/^\+?256[0-9]{9}$|^[0][0-9]{9}$/, 'Invalid Uganda phone number'),
  email: z.string().email('Invalid email').optional().nullable(),
  school_type: z.enum(['primary', 'secondary', 'both']),
  logo_url: z.string().url().optional().nullable(),
  // Admin details
  full_name: z.string().min(2, 'Full name is required'),
  admin_email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
  // Plan selection
  plan: z.enum(['starter', 'growth', 'pro']),
  start_trial: z.boolean().default(true),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

// Individual step schemas (for multi-step forms)
export const onboardStep1Schema = z.object({
  school_name: z.string().min(2, 'School name is required'),
  address: z.string().min(2, 'Address is required'),
  district: z.string().min(1, 'Select a district'),
  phone: z
    .string()
    .regex(/^\+?256[0-9]{9}$|^[0][0-9]{9}$/, 'Invalid Uganda phone number'),
  email: z.string().email('Invalid email').optional().nullable(),
  school_type: z.enum(['primary', 'secondary', 'both']),
});

export const onboardStep2Schema = z.object({
  logo_url: z.string().url().optional().nullable(),
});

export const onboardStep3Schema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

export const onboardStep4Schema = z.object({
  plan: z.enum(['starter', 'growth', 'pro']),
  start_trial: z.boolean().default(true),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type OnboardFormData = z.infer<typeof onboardSchema>;
export type OnboardStep1Data = z.infer<typeof onboardStep1Schema>;
export type OnboardStep3Data = z.infer<typeof onboardStep3Schema>;
export type OnboardStep4Data = z.infer<typeof onboardStep4Schema>;

import { z } from 'zod';

export const schoolProfileSchema = z.object({
  name: z.string().min(2, 'School name is required'),
  address: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  motto: z.string().optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
});

export const inviteUserSchema = z.object({
  email: z.string().email('Invalid email'),
  role: z.enum(['SCHOOL_ADMIN', 'BURSAR', 'TEACHER', 'PARENT']),
  full_name: z.string().min(2, 'Name is required'),
});

export const apiKeysSchema = z.object({
  africas_talking_username: z.string().min(1, 'Username is required'),
  africas_talking_api_key: z.string().min(1, 'API Key is required'),
  africas_talking_sender_id: z.string().optional().nullable(),
});

export const gradingScaleSchema = z.object({
  grades: z.array(
    z.object({
      grade: z.enum(['A', 'B', 'C', 'D', 'F']),
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
      label: z.string(),
    })
  ),
});

export type SchoolProfileFormData = z.infer<typeof schoolProfileSchema>;
export type InviteUserFormData = z.infer<typeof inviteUserSchema>;
export type ApiKeysFormData = z.infer<typeof apiKeysSchema>;

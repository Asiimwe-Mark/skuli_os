import { z } from 'zod';

export const createStudentSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  // Zod v4: .optional() = T | undefined. Supabase returns null for missing
  // DOBs, so add .nullable() to accept both.
  date_of_birth: z.string().optional().nullable(),
  gender: z.enum(['male', 'female']).optional(),
  photo_url: z.string().url().optional().nullable(),
  parent_name: z.string().min(2, 'Parent name is required'),
  parent_phone: z
    .string()
    .regex(/^\+?256[0-9]{9}$|^[0][0-9]{9}$/, 'Invalid Uganda phone number')
    .transform((val) => {
      if (val.startsWith('0')) return `+256${val.slice(1)}`;
      if (!val.startsWith('+')) return `+${val}`;
      return val;
    }),
  parent_email: z.string().email('Invalid email').optional().nullable(),
  parent_nid: z.string().optional().nullable(),
  current_class_id: z.string().uuid('Select a class'),
  enrollment_date: z.string(),
  admission_number: z.string().optional().nullable(),
});

export const updateStudentSchema = createStudentSchema.partial().extend({
  id: z.string().uuid(),
});

export const enrollStudentSchema = z.object({
  student_id: z.string().uuid('Select a student'),
  class_id: z.string().uuid('Select a class'),
  term_id: z.string().uuid('Select a term'),
  academic_year_id: z.string().uuid('Select an academic year'),
});

export const studentTransferSchema = z.object({
  student_id: z.string().uuid(),
  new_class_id: z.string().uuid(),
  term_id: z.string().uuid(),
});

export const bulkPromoteSchema = z.object({
  academic_year_from: z.string().uuid(),
  academic_year_to: z.string().uuid(),
  term_id: z.string().uuid(),
  promotions: z.array(
    z.object({
      class_from_id: z.string().uuid(),
      class_to_id: z.string().uuid(),
    })
  ),
});

export type CreateStudentFormData = z.infer<typeof createStudentSchema>;
export type UpdateStudentFormData = z.infer<typeof updateStudentSchema>;
export type EnrollStudentFormData = z.infer<typeof enrollStudentSchema>;

// Legacy aliases
export const studentSchema = createStudentSchema;
export const studentUpdateSchema = updateStudentSchema;
export type StudentFormData = CreateStudentFormData;
export type StudentUpdateData = UpdateStudentFormData;

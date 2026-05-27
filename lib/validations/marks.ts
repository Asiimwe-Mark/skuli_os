import { z } from 'zod';

export const enterMarksSchema = z.object({
  student_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  class_id: z.string().uuid(),
  term_id: z.string().uuid(),
  exam_type: z.enum(['bot', 'midterm', 'eot', 'assignment', 'practical']),
  score: z.number().min(0, 'Score cannot be negative'),
  max_score: z.number().positive().default(100),
  remarks: z.string().optional().nullable(),
}).refine((data) => data.score <= data.max_score, {
  message: 'Score cannot exceed maximum score',
  path: ['score'],
});

export const submitMarksSchema = z.object({
  subject_id: z.string().uuid(),
  class_id: z.string().uuid(),
  term_id: z.string().uuid(),
  exam_type: z.enum(['bot', 'midterm', 'eot', 'assignment', 'practical']),
  marks: z.array(
    z.object({
      student_id: z.string().uuid(),
      score: z.number().min(0),
      max_score: z.number().positive().default(100),
      remarks: z.string().optional().nullable(),
    })
  ),
});

export const reportCardCommentSchema = z.object({
  report_card_id: z.string().uuid(),
  class_teacher_comment: z.string().optional().nullable(),
  headmaster_comment: z.string().optional().nullable(),
  conduct_grade: z.enum(['A', 'B', 'C', 'D']),
});

export const generateReportCardsSchema = z.object({
  class_id: z.string().uuid(),
  term_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
});

export type EnterMarksFormData = z.infer<typeof enterMarksSchema>;
export type SubmitMarksFormData = z.infer<typeof submitMarksSchema>;

// Legacy aliases
export const markEntrySchema = enterMarksSchema;
export const bulkMarksSchema = submitMarksSchema;
export type MarkEntryFormData = EnterMarksFormData;
export type BulkMarksFormData = SubmitMarksFormData;

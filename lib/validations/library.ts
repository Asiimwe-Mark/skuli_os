import { z } from 'zod';

export const createBookSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().optional().nullable(),
  isbn: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  total_copies: z.number().int().positive('Total copies must be at least 1').default(1),
  shelf_location: z.string().optional().nullable(),
});

export const issueBookSchema = z.object({
  book_id: z.string().uuid('Select a book'),
  student_id: z.string().uuid('Select a student'),
  due_date: z.string().min(1, 'Due date is required'),
});

export const returnBookSchema = z.object({
  issue_id: z.string().uuid('Issue ID is required'),
  fine_amount: z.number().min(0).optional().nullable(),
  fine_paid: z.boolean().default(false),
});

export type CreateBookFormData = z.infer<typeof createBookSchema>;
export type IssueBookFormData = z.infer<typeof issueBookSchema>;
export type ReturnBookFormData = z.infer<typeof returnBookSchema>;

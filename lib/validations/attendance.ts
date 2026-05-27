import { z } from 'zod';

export const attendanceRecordSchema = z.object({
  student_id: z.string().uuid(),
  status: z.enum(['present', 'absent', 'late', 'excused']),
  notes: z.string().optional().nullable(),
});

export const takeAttendanceSchema = z.object({
  class_id: z.string().uuid('Select a class'),
  date: z.string(),
  records: z.array(attendanceRecordSchema),
});

export type AttendanceRecordFormData = z.infer<typeof attendanceRecordSchema>;
export type TakeAttendanceFormData = z.infer<typeof takeAttendanceSchema>;

// Legacy alias
export const attendanceSchema = takeAttendanceSchema;
export type AttendanceFormValues = TakeAttendanceFormData;

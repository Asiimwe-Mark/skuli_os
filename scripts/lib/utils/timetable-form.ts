/**
 * Client-side Zod schemas for the timetable form (audit 5.12).
 *
 * The server-side route validates the inbound payload, but rejecting
 * bad input at the form layer means the user gets a toast before the
 * network round-trip. Mirrors createSlotSchema / createPeriodSchema
 * in app/api/timetable/{slots,periods}/route.ts.
 */
import { z } from "zod";

const UUID_OR_EMPTY = z.string().uuid().optional().or(z.literal(""));

export const slotFormSchema = z.object({
  subjectId: UUID_OR_EMPTY,
  teacherId: UUID_OR_EMPTY,
  room: z
    .string()
    .max(50, "Room name too long")
    .optional()
    .or(z.literal("")),
});

const HHMM = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;

export const periodFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  startTime: z
    .string()
    .regex(HHMM, "Invalid start time"),
  endTime: z
    .string()
    .regex(HHMM, "Invalid end time"),
  isBreak: z.boolean(),
});

export type SlotFormInput = z.infer<typeof slotFormSchema>;
export type PeriodFormInput = z.infer<typeof periodFormSchema>;

/**
 * Gate tests for lib/utils/timetable-form (audit 5.12).
 *
 * The previous slot/period form did no client-side validation,
 * relying on the server to reject bad payloads. That meant a typo
 * in the room name or a bad time string cost the user a round-trip
 * plus a generic 400 toast. These schemas run in the form handler
 * and surface a useful message before fetch().
 */
import { describe, it, expect } from "vitest";
import { slotFormSchema, periodFormSchema } from "@/lib/utils/timetable-form";

const validUUID = "9e1f2a3b-4c5d-46e7-8f90-1234567890ab";

describe("slotFormSchema (audit 5.12)", () => {
  it("accepts an empty form (no subject/teacher/room)", () => {
    const r = slotFormSchema.safeParse({ subjectId: "", teacherId: "", room: "" });
    expect(r.success).toBe(true);
  });

  it("accepts valid UUIDs for subject and teacher", () => {
    const r = slotFormSchema.safeParse({
      subjectId: validUUID,
      teacherId: validUUID,
      room: "Room 101",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-UUID subjectId", () => {
    const r = slotFormSchema.safeParse({ subjectId: "not-a-uuid", teacherId: "", room: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a room name over 50 chars", () => {
    const long = "x".repeat(51);
    const r = slotFormSchema.safeParse({ subjectId: "", teacherId: "", room: long });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/too long/i);
    }
  });

  it("accepts a 50-char room name (boundary)", () => {
    const at = "x".repeat(50);
    const r = slotFormSchema.safeParse({ subjectId: "", teacherId: "", room: at });
    expect(r.success).toBe(true);
  });
});

describe("periodFormSchema (audit 5.12)", () => {
  it("accepts a normal period", () => {
    const r = periodFormSchema.safeParse({
      name: "Period 1",
      startTime: "08:00",
      endTime: "08:40",
      isBreak: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const r = periodFormSchema.safeParse({
      name: "",
      startTime: "08:00",
      endTime: "08:40",
      isBreak: false,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed start time", () => {
    const r = periodFormSchema.safeParse({
      name: "Period 1",
      startTime: "8:00", // missing leading zero
      endTime: "08:40",
      isBreak: false,
    });
    expect(r.success).toBe(false);
  });

  it("rejects 25:00 (out of range)", () => {
    const r = periodFormSchema.safeParse({
      name: "Period 1",
      startTime: "25:00",
      endTime: "08:40",
      isBreak: false,
    });
    expect(r.success).toBe(false);
  });

  it("accepts 23:59 boundary", () => {
    const r = periodFormSchema.safeParse({
      name: "Period 1",
      startTime: "23:59",
      endTime: "23:59",
      isBreak: false,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a break period (isBreak true)", () => {
    const r = periodFormSchema.safeParse({
      name: "Lunch",
      startTime: "12:00",
      endTime: "13:00",
      isBreak: true,
    });
    expect(r.success).toBe(true);
  });
});

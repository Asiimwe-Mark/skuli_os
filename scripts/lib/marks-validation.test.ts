import { describe, it, expect } from "vitest";
import { submitMarksSchema } from "@/lib/validations/marks";

/**
 * Regression test: the marks POST schema must accept a `submit_final`
 * flag and default it to false. The server uses this flag to set
 * `review_status = 'submitted'` vs `'draft'`. Without it, the marks
 * review page would never see any submitted groups to approve.
 */
describe("submitMarksSchema", () => {
  it("accepts a body with submit_final: true", () => {
    const parsed = submitMarksSchema.safeParse({
      subject_id: "a48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e61",
      class_id: "b48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e62",
      term_id: "c48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e63",
      exam_type: "eot",
      submit_final: true,
      marks: [
        { student_id: "d48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e64", score: 80 },
      ],
    });
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.error.issues, null, 2));
    }
    expect(parsed.data.submit_final).toBe(true);
  });

  it("defaults submit_final to false when omitted", () => {
    const parsed = submitMarksSchema.safeParse({
      subject_id: "a48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e61",
      class_id: "b48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e62",
      term_id: "c48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e63",
      exam_type: "eot",
      marks: [
        { student_id: "d48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e64", score: 80 },
      ],
    });
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.error.issues, null, 2));
    }
    expect(parsed.data.submit_final).toBe(false);
  });

  it("still rejects out-of-range scores", () => {
    const parsed = submitMarksSchema.safeParse({
      subject_id: "a48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e61",
      class_id: "b48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e62",
      term_id: "c48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e63",
      exam_type: "eot",
      marks: [
        { student_id: "d48f1b3e-9c10-4f8d-b3f0-1a2b3c4d5e64", score: 250 },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

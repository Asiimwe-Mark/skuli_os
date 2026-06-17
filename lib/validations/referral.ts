import { z } from "zod";

export const applyReferralSchema = z.object({
  referral_code: z.string().min(3).max(64),
  new_school_id: z.string().uuid(),
});

export type ApplyReferralInput = z.infer<typeof applyReferralSchema>;

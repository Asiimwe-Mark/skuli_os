import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate a unique composite Pesapal merchant reference for tuition payments.
 * Structure: [SCHOOL_CODE]-[STUDENT_SHORT]-[TERM_LABEL]-[RANDOM_HASH]
 * Performs a DB collision check before returning.
 */
export async function generateTuitionRef(
  schoolCode: string,
  studentId: string,
  termLabel: string // e.g. "T1-2026"
): Promise<string> {
  const MAX_ATTEMPTS = 5;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const hash = crypto.randomBytes(4).toString('hex').toUpperCase();
    const schoolPart = schoolCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    const studentPart = studentId.replace(/-/g, '').slice(0, 6).toUpperCase();
    const ref = `${schoolPart}-${studentPart}-${termLabel}-${hash}`;

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('tuition_payments')
      .select('id')
      .eq('id', ref)
      .maybeSingle();

    if (!data) return ref; // No collision — safe to use
  }

  throw new Error('Failed to generate unique tuition reference after 5 attempts');
}

/**
 * Generate a batch reference for payroll clearing.
 * Structure: BATCH-[SCHOOL_SHORT]-[TIMESTAMP_MS]
 */
export function generateBatchRef(schoolId: string): string {
  return `BATCH-${schoolId.replace(/-/g, '').slice(0, 8).toUpperCase()}-${Date.now()}`;
}

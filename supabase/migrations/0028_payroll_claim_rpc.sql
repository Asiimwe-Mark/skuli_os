-- =============================================================================
-- SKULI SaaS: Payroll claim RPC (Audit §10.1)
-- Migration 0028 (part 6)
--
-- /api/v1/payroll/approve previously selected payroll_records
-- WHERE payment_status = 'pending' but never *flipped* them out of
-- pending, so two concurrent calls (or a webhook retry before the
-- first batch row was committed) could each see the same pending
-- records and create two funding batches.
--
-- This function atomically:
--   1. UPDATEs the supplied ids to payment_status='batched' WHERE
--      school_id = $1 AND id = ANY($2) AND payment_status = 'pending'.
--   2. Returns the ids it actually flipped.
--
-- The caller compares the returned count with the requested count;
-- any mismatch means a concurrent caller already won the race and
-- the route returns 409. The 0028_rls_hardening trigger
-- `payroll_records_approval_guard` blocks any other path from
-- re-flipping a non-pending row back to 'batched'.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payroll_claim_records_for_batch(
    p_school_id UUID,
    p_record_ids UUID[]
)
RETURNS TABLE(id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.payroll_records pr
       SET payment_status = 'batched',
           updated_at = now()
     WHERE pr.school_id = p_school_id
       AND pr.id = ANY(p_record_ids)
       AND pr.payment_status = 'pending'
    RETURNING pr.id;
END;
$$;

-- Only the service role (webhook + admin paths) may call this
-- function directly. The application-layer RLS still applies to the
-- underlying UPDATE because the SECURITY DEFINER context switches to
-- the function owner; we therefore revoke the EXECUTE grant from
-- anon/authenticated so end users cannot invoke it via PostgREST.
REVOKE ALL ON FUNCTION public.payroll_claim_records_for_batch(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_claim_records_for_batch(UUID, UUID[]) TO service_role;

-- =============================================================================
-- SKULI SaaS: Bulk recalculate fee accounts for a term
-- Migration 0045 (refactor A-to-Z, Phase 6.2)
--
-- The fee-account recalculation logic in migration 0019 is per-row.
-- The trigger on fee_structures already cascades one recalc per account,
-- but for an entire term (e.g. fee_structure change at term start) the
-- loop pays N round-trips. This function does the recalculation in a
-- single statement and returns the row count.
--
-- The body uses the same SQL the per-row trigger wraps, so the
-- resulting totals / status are identical. We do NOT call the
-- `recalculate_fee_account()` PL/pgSQL function in a loop — that
-- would still pay N function-call overheads and would lose the planner
-- benefits of a set-based UPDATE.
-- =============================================================================

CREATE OR REPLACE FUNCTION recalculate_term_accounts(
    p_school_id UUID,
    p_term_id   UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    WITH per_account AS (
        SELECT
            fa.id,
            -- Gross fees for the term (NULL class_id applies to all
            -- classes; class-scoped fees require the student's current
            -- class to match).
            COALESCE((
                SELECT SUM(fs.amount)
                FROM fee_structures fs
                LEFT JOIN students st ON st.id = fa.student_id
                WHERE fs.term_id    = fa.term_id
                  AND fs.school_id  = fa.school_id
                  AND fs.is_deleted = false
                  AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id)
            ), 0)::NUMERIC                                              AS gross_fees,

            -- Applicable discounts (percentage capped at gross; fixed
            -- capped at gross). `term_id IS NULL` means "applies to all
            -- terms".
            COALESCE((
                SELECT SUM(
                    CASE
                        WHEN fd.discount_type = 'percentage'
                            THEN LEAST(
                                COALESCE((
                                    SELECT SUM(fs.amount)
                                    FROM fee_structures fs
                                    LEFT JOIN students st ON st.id = fa.student_id
                                    WHERE fs.term_id    = fa.term_id
                                      AND fs.school_id  = fa.school_id
                                      AND fs.is_deleted = false
                                      AND (fs.class_id IS NULL
                                           OR fs.class_id = st.current_class_id)
                                ), 0) * fd.value / 100.0,
                                COALESCE((
                                    SELECT SUM(fs.amount)
                                    FROM fee_structures fs
                                    LEFT JOIN students st ON st.id = fa.student_id
                                    WHERE fs.term_id    = fa.term_id
                                      AND fs.school_id  = fa.school_id
                                      AND fs.is_deleted = false
                                      AND (fs.class_id IS NULL
                                           OR fs.class_id = st.current_class_id)
                                ), 0)
                            )
                        ELSE LEAST(fd.value, COALESCE((
                                    SELECT SUM(fs.amount)
                                    FROM fee_structures fs
                                    LEFT JOIN students st ON st.id = fa.student_id
                                    WHERE fs.term_id    = fa.term_id
                                      AND fs.school_id  = fa.school_id
                                      AND fs.is_deleted = false
                                      AND (fs.class_id IS NULL
                                           OR fs.class_id = st.current_class_id)
                                ), 0))
                    END
                )
                FROM student_discounts sd
                JOIN fee_discounts fd ON fd.id = sd.discount_id
                WHERE sd.student_id = fa.student_id
                  AND (sd.term_id = fa.term_id OR sd.term_id IS NULL)
                  AND sd.is_deleted = false
                  AND fd.is_deleted = false
            ), 0)::NUMERIC                                              AS total_discount,

            -- Confirmed payments.
            COALESCE((
                SELECT SUM(fp.amount)
                FROM fee_payments fp
                WHERE fp.fee_account_id = fa.id
                  AND fp.status         = 'confirmed'
                  AND fp.is_deleted     = false
            ), 0)::NUMERIC                                              AS total_paid
        FROM fee_accounts fa
        WHERE fa.school_id  = p_school_id
          AND fa.term_id    = p_term_id
          AND fa.is_deleted = false
    ),
    computed AS (
        SELECT
            pa.id,
            pa.gross_fees,
            pa.total_discount,
            GREATEST(pa.gross_fees - pa.total_discount, 0) AS net_expected,
            pa.total_paid,
            GREATEST(pa.gross_fees - pa.total_discount, 0) - pa.total_paid AS balance,
            CASE
                WHEN pa.gross_fees = 0                                  THEN 'paid'::fee_account_status
                WHEN (GREATEST(pa.gross_fees - pa.total_discount, 0) - pa.total_paid) < 0
                                                                     THEN 'overpaid'::fee_account_status
                WHEN (GREATEST(pa.gross_fees - pa.total_discount, 0) - pa.total_paid) = 0
                                                                     THEN 'paid'::fee_account_status
                WHEN pa.total_paid > 0                                  THEN 'partial'::fee_account_status
                ELSE                                                        'unpaid'::fee_account_status
            END AS new_status
        FROM per_account pa
    )
    UPDATE fee_accounts fa
       SET total_fees     = c.gross_fees,
           total_discount = c.total_discount,
           total_expected = c.net_expected,
           total_paid     = c.total_paid,
           balance        = c.balance,
           status         = c.new_status,
           updated_at     = now()
      FROM computed c
     WHERE fa.id = c.id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION recalculate_term_accounts(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION recalculate_term_accounts(UUID, UUID) TO authenticated;
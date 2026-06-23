-- =============================================================================
-- SKULI SaaS: Batch upsert attendance records
-- Migration 0046 (refactor A-to-Z, Phase 6.3)
--
-- The current attendance POST handler in app/api/attendance/route.ts does
-- a single `.upsert(records, { onConflict: "student_id,date" })` call
-- over the whole class. PostgREST expands that into N single-row UPSERTs
-- on the wire — one round-trip per student. For a 200-student class
-- that is ~200 round-trips per attendance submission.
--
-- This function does the upsert in a single SQL call from the handler,
-- returning the count of rows affected. It is SECURITY DEFINER so the
-- caller's role doesn't need explicit INSERT / UPDATE grants on
-- attendance_records; the function owns the privilege check via
-- `is_in_school(p_school_id)` below.
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_attendance_batch(
    p_school_id UUID,
    p_class_id  UUID,
    p_date      DATE,
    p_term_id   UUID,
    p_records   JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_count INTEGER := 0;
    v_record JSONB;
BEGIN
    -- Defence-in-depth: the wrapper already checked the caller's role,
    -- but the function itself enforces the tenant scope so a service-
    -- role caller cannot accidentally write cross-tenant rows.
    IF NOT is_in_school(p_school_id) THEN
        RAISE EXCEPTION 'Caller is not a member of school %', p_school_id
            USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;

    IF jsonb_typeof(p_records) <> 'array' THEN
        RAISE EXCEPTION 'p_records must be a JSONB array';
    END IF;

    FOR v_record IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        INSERT INTO attendance_records (
            school_id, student_id, class_id, term_id, date, status, notes
        ) VALUES (
            p_school_id,
            (v_record->>'student_id')::UUID,
            p_class_id,
            p_term_id,
            p_date,
            (v_record->>'status')::attendance_status,
            NULLIF(v_record->>'notes', '')
        )
        ON CONFLICT (student_id, class_id, date) DO UPDATE
            SET status     = EXCLUDED.status,
                notes      = EXCLUDED.notes,
                term_id    = COALESCE(EXCLUDED.term_id, attendance_records.term_id),
                updated_at = now(),
                is_deleted = false;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_attendance_batch(UUID, UUID, DATE, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_attendance_batch(UUID, UUID, DATE, UUID, JSONB) TO service_role;
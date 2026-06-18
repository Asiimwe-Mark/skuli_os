-- =============================================================================
-- SKULI SaaS: Business Functions
-- Migration 0019
--
-- All functions pinned to `SET search_path = pg_catalog, public`.
-- Service-role only by intent (revoked from anon/authenticated in 0026).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. recalculate_fee_account(p_account_id)
--    Recalculates total_expected (with discounts), total_paid, balance,
--    status for a fee_account. Per 00020 — discounts are subtracted
--    before the status decision.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_fee_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_account        fee_accounts%ROWTYPE;
    v_gross_fees     numeric;
    v_total_discount numeric;
    v_net_expected   numeric;
    v_total_paid     numeric;
    v_balance        numeric;
    v_status         fee_account_status;
BEGIN
    SELECT * INTO v_account FROM fee_accounts WHERE id = p_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee account % not found', p_account_id;
    END IF;

    -- 1. Gross fees: sum all applicable fee_structures
    SELECT COALESCE(SUM(fs.amount), 0)
    INTO v_gross_fees
    FROM fee_structures fs
    LEFT JOIN students st ON st.id = v_account.student_id
    WHERE fs.term_id    = v_account.term_id
      AND fs.school_id  = v_account.school_id
      AND fs.is_deleted = false
      AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

    -- 2. Applicable discounts (percentage capped at gross; fixed capped at gross)
    SELECT COALESCE(SUM(
        CASE
            WHEN fd.discount_type = 'percentage'
                THEN LEAST(v_gross_fees * fd.value / 100.0, v_gross_fees)
            ELSE LEAST(fd.value, v_gross_fees)
        END
    ), 0)
    INTO v_total_discount
    FROM student_discounts sd
    JOIN fee_discounts fd ON fd.id = sd.discount_id
    WHERE sd.student_id = v_account.student_id
      AND (sd.term_id = v_account.term_id OR sd.term_id IS NULL)
      AND sd.is_deleted = false
      AND fd.is_deleted = false;

    v_net_expected := GREATEST(v_gross_fees - v_total_discount, 0);

    -- 3. Confirmed payments
    SELECT COALESCE(SUM(fp.amount), 0)
    INTO v_total_paid
    FROM fee_payments fp
    WHERE fp.fee_account_id = p_account_id
      AND fp.status         = 'confirmed'
      AND fp.is_deleted     = false;

    v_balance := v_net_expected - v_total_paid;

    -- 4. Status
    IF v_net_expected = 0 THEN
        v_status := 'paid';
    ELSIF v_balance <= 0 AND v_total_paid > 0 THEN
        v_status := CASE WHEN v_balance < 0 THEN 'overpaid' ELSE 'paid' END;
    ELSIF v_total_paid > 0 THEN
        v_status := 'partial';
    ELSE
        v_status := 'unpaid';
    END IF;

    -- 5. Write back (including total_fees + total_discount)
    UPDATE fee_accounts
    SET total_fees     = v_gross_fees,
        total_discount = v_total_discount,
        total_expected = v_net_expected,
        total_paid     = v_total_paid,
        balance        = v_balance,
        status         = v_status,
        updated_at     = now()
    WHERE id = p_account_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1b. Fee-account auto-recalc trigger functions + marks.grade function.
--     (Trigger wirings live in 0023.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_fee_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
    IF (TG_OP = 'INSERT')
    OR (TG_OP = 'UPDATE' AND (
         NEW.status     IS DISTINCT FROM OLD.status OR
         NEW.amount     IS DISTINCT FROM OLD.amount OR
         NEW.is_deleted IS DISTINCT FROM OLD.is_deleted))
    THEN
        PERFORM recalculate_fee_account(NEW.fee_account_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_recalculate_fee_accounts_for_student()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_account_id uuid;
BEGIN
    FOR v_account_id IN
        SELECT id FROM fee_accounts
        WHERE student_id = COALESCE(NEW.student_id, OLD.student_id)
          AND (term_id = COALESCE(NEW.term_id, OLD.term_id)
               OR (NEW.term_id IS NULL AND OLD.term_id IS NULL))
          AND is_deleted = false
    LOOP
        PERFORM recalculate_fee_account(v_account_id);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_recalculate_accounts_for_fee_structure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_account_id uuid;
BEGIN
    FOR v_account_id IN
        SELECT id FROM fee_accounts
        WHERE school_id = COALESCE(NEW.school_id, OLD.school_id)
          AND term_id   = COALESCE(NEW.term_id,   OLD.term_id)
          AND is_deleted = false
    LOOP
        PERFORM recalculate_fee_account(v_account_id);
    END LOOP;
    RETURN NEW;
END;
$$;

-- Auto-populate marks.grade from grading_scales on insert/score change.
CREATE OR REPLACE FUNCTION fn_marks_set_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_pct numeric; v_grade text;
BEGIN
    IF NEW.score IS NOT NULL AND NEW.max_score IS NOT NULL AND NEW.max_score > 0 THEN
        v_pct := (NEW.score / NEW.max_score) * 100;
        SELECT grade INTO v_grade
        FROM grading_scales
        WHERE school_id = NEW.school_id
          AND is_deleted = false
          AND v_pct >= min_score
          AND v_pct <= max_score
        ORDER BY sort_order
        LIMIT 1;
        NEW.grade := v_grade;
    ELSE
        NEW.grade := NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. create_fee_accounts_for_term(p_school_id, p_term_id)
--    Batch creates fee accounts for all active enrolled students.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fee_accounts_for_term(
    p_school_id uuid,
    p_term_id   uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_count int := 0;
    v_rec record;
    v_academic_year_id uuid;
    v_total_expected numeric;
    v_total_discount numeric;
BEGIN
    SELECT academic_year_id INTO v_academic_year_id
    FROM terms
    WHERE id = p_term_id AND school_id = p_school_id;

    IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Term % not found for school %', p_term_id, p_school_id;
    END IF;

    FOR v_rec IN
        SELECT DISTINCT ce.student_id
        FROM class_enrollments ce
        JOIN students s ON s.id = ce.student_id
        WHERE ce.term_id = p_term_id
          AND s.school_id = p_school_id
          AND s.status = 'active'
          AND s.is_deleted = false
          AND ce.is_deleted = false
          AND NOT EXISTS (
              SELECT 1 FROM fee_accounts fa
              WHERE fa.student_id = ce.student_id
                AND fa.term_id = p_term_id
                AND fa.is_deleted = false
          )
    LOOP
        SELECT COALESCE(SUM(fs.amount), 0)
        INTO v_total_expected
        FROM fee_structures fs
        JOIN students st ON st.id = v_rec.student_id
        WHERE fs.term_id = p_term_id
          AND fs.school_id = p_school_id
          AND fs.is_deleted = false
          AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

        SELECT COALESCE(SUM(
            CASE
                WHEN fd.discount_type = 'percentage' THEN
                    LEAST(v_total_expected * fd.value / 100, v_total_expected * fd.value / 100)
                ELSE fd.value
            END
        ), 0)
        INTO v_total_discount
        FROM student_discounts sd
        JOIN fee_discounts fd ON fd.id = sd.discount_id
        WHERE sd.student_id = v_rec.student_id
          AND (sd.term_id = p_term_id OR sd.term_id IS NULL)
          AND sd.is_deleted = false
          AND fd.is_deleted = false;

        v_total_expected := GREATEST(v_total_expected - v_total_discount, 0);

        INSERT INTO fee_accounts (
            school_id, student_id, term_id, academic_year_id,
            total_expected, total_paid, balance, status
        ) VALUES (
            p_school_id, v_rec.student_id, p_term_id, v_academic_year_id,
            v_total_expected, 0, v_total_expected,
            CASE WHEN v_total_expected > 0 THEN 'unpaid'::fee_account_status ELSE 'paid'::fee_account_status END
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. generate_receipt_number(p_school_id) — atomic via advisory lock.
--    Per 00067: serialised with pg_advisory_xact_lock keyed on the
--    school uuid hash. Combined with the unique index in 0013, this
--    is correct under arbitrary concurrency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_receipt_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_school_code text;
    v_year_month text;
    v_seq int;
    v_receipt text;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_school_id::text));

    SELECT school_code INTO v_school_code FROM schools WHERE id = p_school_id;
    IF v_school_code IS NULL THEN
        v_school_code := 'UNK';
    END IF;

    v_year_month := to_char(now(), 'YYYYMM');

    SELECT COALESCE(MAX(CAST(SPLIT_PART(receipt_number, '-', 4) AS int)), 0) + 1
    INTO v_seq
    FROM fee_payments
    WHERE school_id = p_school_id
      AND receipt_number LIKE 'SKULI-' || v_school_code || '-' || v_year_month || '-%'
      AND is_deleted = false;

    v_receipt := 'SKULI-' || v_school_code || '-' || v_year_month || '-' || LPAD(v_seq::text, 4, '0');
    RETURN v_receipt;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. confirm_tuition_payment — ACID for Pesapal webhooks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_tuition_payment(
    p_tuition_payment_id  text,
    p_pesapal_tracking_id text,
    p_new_status          text,
    p_verified_amount     numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_fee_account_id uuid;
    v_school_id      uuid;
    v_receipt_number text;
BEGIN
    SELECT fee_account_id, school_id
    INTO v_fee_account_id, v_school_id
    FROM tuition_payments
    WHERE id = p_tuition_payment_id
      AND status = 'PENDING'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_new_status = 'COMPLETED' THEN
        v_receipt_number := 'PP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                            UPPER(SUBSTR(MD5(p_tuition_payment_id), 1, 6));
    END IF;

    UPDATE tuition_payments
    SET status                    = p_new_status::pesapal_payment_status,
        pesapal_order_tracking_id = p_pesapal_tracking_id,
        receipt_number            = v_receipt_number,
        updated_at                = NOW()
    WHERE id = p_tuition_payment_id;

    IF p_new_status = 'COMPLETED' AND v_fee_account_id IS NOT NULL THEN
        UPDATE fee_accounts
        SET total_paid = total_paid + p_verified_amount,
            balance    = GREATEST(0, balance - p_verified_amount),
            status     = CASE
                            WHEN (total_paid + p_verified_amount) >= total_expected THEN 'paid'::fee_account_status
                            WHEN (total_paid + p_verified_amount) > 0              THEN 'partial'::fee_account_status
                            ELSE 'unpaid'::fee_account_status
                         END,
            updated_at = NOW()
        WHERE id = v_fee_account_id;

        INSERT INTO fee_payments (
            school_id, fee_account_id, student_id, amount,
            payment_method, status, receipt_number, payment_date,
            mobile_money_transaction_id, notes
        )
        SELECT
            tp.school_id, tp.fee_account_id, tp.student_id, p_verified_amount,
            'mobile_money', 'confirmed', v_receipt_number, CURRENT_DATE,
            p_pesapal_tracking_id,
            'Online Payment via Pesapal'
        FROM tuition_payments tp
        WHERE tp.id = p_tuition_payment_id;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. apply_referral_credit — atomic referral + credit increment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_referral_credit(p_code text, p_new_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_code_id        uuid;
    v_owner_school   uuid;
BEGIN
    SELECT id, owner_school_id INTO v_code_id, v_owner_school
    FROM referral_codes
    WHERE code = p_code AND is_active = true;

    IF v_code_id IS NULL THEN
        RETURN jsonb_build_object('applied', false, 'reason', 'invalid_code');
    END IF;

    IF v_owner_school = p_new_school_id THEN
        RETURN jsonb_build_object('applied', false, 'reason', 'self_referral');
    END IF;

    IF EXISTS (SELECT 1 FROM referrals WHERE referred_school_id = p_new_school_id) THEN
        RETURN jsonb_build_object('applied', false, 'reason', 'already_referred');
    END IF;

    INSERT INTO referrals(referral_code_id, referred_school_id, credit_months)
    VALUES (v_code_id, p_new_school_id, 1);

    INSERT INTO billing_credits(school_id, months)
    VALUES (v_owner_school, 1)
    ON CONFLICT (school_id) DO UPDATE
        SET months = billing_credits.months + 1, updated_at = now();

    RETURN jsonb_build_object('applied', true, 'referrer_school_id', v_owner_school);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. generate_meeting_slots — slices a teacher's availability into slots.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_meeting_slots(
    p_school_id        uuid,
    p_teacher_id       uuid,
    p_slot_date        date,
    p_start_time       time,
    p_end_time         time,
    p_duration_minutes int DEFAULT 15
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    slot_start time;
    slot_end   time;
BEGIN
    slot_start := p_start_time;
    LOOP
        slot_end := slot_start + (p_duration_minutes || ' minutes')::interval;
        EXIT WHEN slot_end > p_end_time;

        IF NOT EXISTS (
            SELECT 1 FROM meeting_slots
            WHERE school_id = p_school_id
              AND teacher_id = p_teacher_id
              AND slot_date = p_slot_date
              AND start_time = slot_start
              AND is_deleted = false
        ) THEN
            INSERT INTO meeting_slots (school_id, teacher_id, slot_date, start_time, end_time, duration_minutes)
            VALUES (p_school_id, p_teacher_id, p_slot_date, slot_start, slot_end, p_duration_minutes);
        END IF;

        slot_start := slot_end;
    END LOOP;
END;
$$;

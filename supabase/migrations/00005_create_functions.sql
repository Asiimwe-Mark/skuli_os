-- =============================================================================
-- SKULI SaaS: Database Functions & Triggers
-- Migration 00005
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. update_updated_at() - Auto-update updated_at on every table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON schools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON academic_years
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON terms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON class_subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON class_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_structures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON marks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON sms_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON payroll_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscription_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. recalculate_fee_account(account_id)
--    Recalculates total_expected, total_paid, balance, status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_fee_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_account fee_accounts%ROWTYPE;
    v_total_expected numeric;
    v_total_paid numeric;
    v_balance numeric;
    v_status fee_account_status;
BEGIN
    -- Fetch the account
    SELECT * INTO v_account FROM fee_accounts WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee account % not found', p_account_id;
    END IF;

    -- Calculate total_expected from fee_structures for this term/class
    SELECT COALESCE(SUM(fs.amount), 0)
    INTO v_total_expected
    FROM fee_structures fs
    LEFT JOIN students st ON st.id = v_account.student_id
    WHERE fs.term_id = v_account.term_id
      AND fs.school_id = v_account.school_id
      AND fs.is_deleted = false
      AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

    -- Calculate total_paid from confirmed fee_payments
    SELECT COALESCE(SUM(fp.amount), 0)
    INTO v_total_paid
    FROM fee_payments fp
    WHERE fp.fee_account_id = p_account_id
      AND fp.status = 'confirmed'
      AND fp.is_deleted = false;

    -- Calculate balance
    v_balance := v_total_expected - v_total_paid;

    -- Determine status
    IF v_balance = 0 AND v_total_expected > 0 THEN
        v_status := 'paid';
    ELSIF v_balance > 0 AND v_total_paid > 0 THEN
        v_status := 'partial';
    ELSIF v_balance < 0 THEN
        v_status := 'overpaid';
    ELSE
        v_status := 'unpaid';
    END IF;

    -- Update the account
    UPDATE fee_accounts
    SET total_expected = v_total_expected,
        total_paid = v_total_paid,
        balance = v_balance,
        status = v_status
    WHERE id = p_account_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. generate_receipt_number(p_school_id)
--    Generates SKULI-{CODE}-{YYYYMM}-{SEQ} format
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_receipt_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_school_code text;
    v_year_month text;
    v_seq int;
    v_receipt text;
BEGIN
    -- Get school code
    SELECT school_code INTO v_school_code
    FROM schools
    WHERE id = p_school_id;

    IF v_school_code IS NULL THEN
        v_school_code := 'UNK';
    END IF;

    -- Get current year-month
    v_year_month := to_char(now(), 'YYYYMM');

    -- Get next sequence number for this school/month
    SELECT COALESCE(
        MAX(
            CAST(
                SPLIT_PART(receipt_number, '-', 4) AS int
            )
        ), 0
    ) + 1
    INTO v_seq
    FROM fee_payments
    WHERE school_id = p_school_id
      AND receipt_number LIKE 'SKULI-' || v_school_code || '-' || v_year_month || '-%'
      AND is_deleted = false;

    -- Build receipt number
    v_receipt := 'SKULI-' || v_school_code || '-' || v_year_month || '-' || LPAD(v_seq::text, 4, '0');

    RETURN v_receipt;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. handle_new_user()
--    Trigger on auth.users insert to create users table record
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_full_name text;
    v_phone text;
    v_role user_role;
    v_school_id uuid;
BEGIN
    -- Extract metadata set during signup
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );

    v_phone := COALESCE(
        NEW.raw_user_meta_data->>'phone',
        NEW.phone
    );

    v_role := COALESCE(
        (NEW.raw_user_meta_data->>'role')::user_role,
        'SCHOOL_ADMIN'
    );

    v_school_id := (NEW.raw_user_meta_data->>'school_id')::uuid;

    INSERT INTO users (
        id,
        school_id,
        role,
        full_name,
        phone,
        is_active
    ) VALUES (
        NEW.id,
        v_school_id,
        v_role,
        v_full_name,
        v_phone,
        true
    );

    RETURN NEW;
END;
$$;

-- Trigger to auto-create user profile on auth.users insert
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. create_fee_accounts_for_term(p_school_id, p_term_id)
--    Batch creates fee accounts for all enrolled students in a term
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fee_accounts_for_term(
    p_school_id uuid,
    p_term_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count int := 0;
    v_rec record;
    v_academic_year_id uuid;
    v_total_expected numeric;
BEGIN
    -- Get the academic year for this term
    SELECT academic_year_id INTO v_academic_year_id
    FROM terms
    WHERE id = p_term_id AND school_id = p_school_id;

    IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Term % not found for school %', p_term_id, p_school_id;
    END IF;

    -- Loop through all enrolled students for this term
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
        -- Calculate total_expected for this student
        SELECT COALESCE(SUM(fs.amount), 0)
        INTO v_total_expected
        FROM fee_structures fs
        JOIN students st ON st.id = v_rec.student_id
        WHERE fs.term_id = p_term_id
          AND fs.school_id = p_school_id
          AND fs.is_deleted = false
          AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

        INSERT INTO fee_accounts (
            school_id,
            student_id,
            term_id,
            academic_year_id,
            total_expected,
            total_paid,
            balance,
            status
        ) VALUES (
            p_school_id,
            v_rec.student_id,
            p_term_id,
            v_academic_year_id,
            v_total_expected,
            0,
            v_total_expected,
            CASE WHEN v_total_expected > 0 THEN 'unpaid'::fee_account_status ELSE 'paid'::fee_account_status END
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

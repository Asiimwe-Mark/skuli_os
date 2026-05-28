-- =============================================================================
-- SKULI SaaS: Fee Discounts / Scholarships
-- Migration 00020
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. fee_discounts — defines discount types per school
-- ---------------------------------------------------------------------------
CREATE TABLE fee_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          text NOT NULL,
  discount_type discount_type NOT NULL DEFAULT 'percentage',
  value         numeric NOT NULL,
  max_amount    numeric,
  is_recurring  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  is_deleted    boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_fee_discounts_school ON fee_discounts(school_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 2. student_discounts — assigns discounts to students
-- ---------------------------------------------------------------------------
CREATE TABLE student_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  discount_id   uuid NOT NULL REFERENCES fee_discounts(id) ON DELETE CASCADE,
  term_id       uuid REFERENCES terms(id),
  approved_by   uuid REFERENCES users(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  is_deleted    boolean NOT NULL DEFAULT false,
  UNIQUE (student_id, discount_id, term_id)
);

CREATE INDEX idx_student_discounts_school ON student_discounts(school_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_student ON student_discounts(student_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_discount ON student_discounts(discount_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_term ON student_discounts(term_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 3. RLS Policies
-- ---------------------------------------------------------------------------
ALTER TABLE fee_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_discounts ENABLE ROW LEVEL SECURITY;

-- fee_discounts: Admin/Bursar full access within school
CREATE POLICY "school_manage_discounts" ON fee_discounts FOR ALL
  USING (school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

-- student_discounts: Admin/Bursar full access within school
CREATE POLICY "school_manage_student_discounts" ON student_discounts FOR ALL
  USING (school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

-- student_discounts: Parents read-only for own children
CREATE POLICY "parent_read_student_discounts" ON student_discounts FOR SELECT
  USING (
    get_user_role() = 'PARENT'
    AND student_id IN (
      SELECT s.id FROM students s
      WHERE s.parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
        AND s.is_deleted = false
    )
  );

-- ---------------------------------------------------------------------------
-- 4. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON student_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Updated recalculate_fee_account() — subtracts applicable discounts
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
    v_total_discount numeric;
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

    -- Calculate total discount applicable to this student/term
    SELECT COALESCE(SUM(
      CASE
        WHEN fd.discount_type = 'percentage' THEN
          LEAST(v_total_expected * fd.value / 100, COALESCE(fd.max_amount, v_total_expected * fd.value / 100))
        ELSE fd.value
      END
    ), 0)
    INTO v_total_discount
    FROM student_discounts sd
    JOIN fee_discounts fd ON fd.id = sd.discount_id
    WHERE sd.student_id = v_account.student_id
      AND (sd.term_id = v_account.term_id OR sd.term_id IS NULL)
      AND sd.is_deleted = false
      AND fd.is_deleted = false;

    -- Apply discount, ensure non-negative
    v_total_expected := GREATEST(v_total_expected - v_total_discount, 0);

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
-- 6. Updated create_fee_accounts_for_term() — subtracts discounts on creation
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
    v_total_discount numeric;
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

        -- Calculate discount for this student/term
        SELECT COALESCE(SUM(
          CASE
            WHEN fd.discount_type = 'percentage' THEN
              LEAST(v_total_expected * fd.value / 100, COALESCE(fd.max_amount, v_total_expected * fd.value / 100))
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

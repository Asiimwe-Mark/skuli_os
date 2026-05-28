-- Expense payment method enum
CREATE TYPE expense_payment_method AS ENUM ('cash', 'bank', 'mobile_money', 'cheque');

-- Expense categories
CREATE TABLE expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_deleted  boolean NOT NULL DEFAULT false
);

-- Expenses
CREATE TABLE expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES expense_categories(id),
  term_id         uuid REFERENCES terms(id),
  description     text NOT NULL,
  amount          numeric NOT NULL,
  expense_date    date NOT NULL,
  payment_method  expense_payment_method,
  receipt_number  text,
  recorded_by     uuid REFERENCES users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false
);

-- RLS
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_expense_categories" ON expense_categories
  FOR ALL USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_manage_expense_cats" ON expense_categories
  FOR ALL USING (school_id = get_user_school_id());

CREATE POLICY "super_admin_all_expenses" ON expenses
  FOR ALL USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_manage_expenses" ON expenses
  FOR ALL USING (
    school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
  );

-- Index for dashboard queries
CREATE INDEX idx_expenses_date ON expenses(school_id, expense_date, term_id)
  WHERE is_deleted = false;

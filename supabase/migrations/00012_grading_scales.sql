-- Per-school configurable grading scales
CREATE TABLE grading_scales (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    grade       text NOT NULL,
    min_score   numeric NOT NULL,
    max_score   numeric NOT NULL,
    label       text,
    sort_order  int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false,
    UNIQUE (school_id, grade)
);

ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_admin_manage_grades"
    ON grading_scales FOR ALL
    USING (school_id = get_user_school_id());

-- Seed defaults when a school is created (via trigger)
CREATE OR REPLACE FUNCTION seed_default_grading_scale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO grading_scales (school_id, grade, min_score, max_score, label, sort_order) VALUES
        (NEW.id, 'A', 80, 100, 'Distinction', 1),
        (NEW.id, 'B', 70, 79,  'Credit',      2),
        (NEW.id, 'C', 60, 69,  'Merit',       3),
        (NEW.id, 'D', 50, 59,  'Pass',        4),
        (NEW.id, 'F',  0, 49,  'Fail',        5);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_seed_grading_scale
    AFTER INSERT ON schools
    FOR EACH ROW EXECUTE FUNCTION seed_default_grading_scale();

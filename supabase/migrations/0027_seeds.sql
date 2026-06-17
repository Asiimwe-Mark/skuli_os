-- =============================================================================
-- SKULI SaaS: Seeds
-- Migration 0027
--
-- One row per key in platform_settings, Uganda active in
-- country_configs, the 8 marketplace templates, default
-- sms_templates, and a sample school group for the chain-admin demo.
-- ------------------------------------------------------------------------===

-- ---------------------------------------------------------------------------
-- 1. platform_settings (one row per key)
-- ---------------------------------------------------------------------------
INSERT INTO platform_settings (key, value) VALUES
    ('sms_rate_ugx',          '25'::jsonb),
    ('transaction_fee_pct',   '1.5'::jsonb),
    ('feature_flags',
     '{
        "starter": { "mobile_money": false, "report_cards": true },
        "growth":  { "mobile_money": true,  "report_cards": true },
        "pro":     { "mobile_money": true,  "report_cards": true, "payroll": true }
      }'::jsonb),
    ('plan_prices_ugx',
     '{
        "trial":   0,
        "starter": 150000,
        "growth":  350000,
        "pro":     750000
      }'::jsonb)
ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. country_configs (Uganda active; Kenya + Tanzania inactive stubs)
-- ---------------------------------------------------------------------------
INSERT INTO country_configs (code, name, currency_code, currency_symbol, phone_prefix, term_structure, is_active) VALUES
    ('UG', 'Uganda',   'UGX', 'UGX', '+256', 'three_term', true),
    ('KE', 'Kenya',    'KES', 'KES', '+254', 'three_term', false),
    ('TZ', 'Tanzania', 'TZS', 'TZS', '+255', 'three_term', false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. marketplace_templates (8 curated templates)
-- ---------------------------------------------------------------------------
INSERT INTO marketplace_templates (category, name, description, body, variables, tags, is_featured)
SELECT * FROM (VALUES
    (
        'sms_template'::marketplace_category,
        'Term Opening Reminder',
        'Standard term opening SMS sent to all parents with key information',
        '{"text": "Dear {parent_name}, {school_name} opens for {term} on {date}. {student_name} should report by {time} with full school requirements. Thank you."}'::jsonb,
        ARRAY['parent_name', 'school_name', 'term', 'date', 'student_name', 'time'],
        ARRAY['term', 'general'],
        true
    ),
    (
        'sms_template'::marketplace_category,
        'Fee Balance Alert',
        'Polite fee reminder with balance and deadline',
        '{"text": "Dear {parent_name}, {student_name}''s outstanding fee balance is {balance}. Kindly clear by {due_date} to avoid disruption. Pay via Mobile Money or visit the bursar. Thank you, {school_name}."}'::jsonb,
        ARRAY['parent_name', 'student_name', 'balance', 'due_date', 'school_name'],
        ARRAY['fees', 'reminder'],
        true
    ),
    (
        'sms_template'::marketplace_category,
        'Exam Results Published',
        'Notify parents when report cards are available',
        '{"text": "Dear {parent_name}, {student_name}''s {term} results are now available on the SKULI Parent Portal. Average: {average}%. Position: {position}/{class_size}. Login at {portal_url}"}'::jsonb,
        ARRAY['parent_name', 'student_name', 'term', 'average', 'position', 'class_size', 'portal_url'],
        ARRAY['academics', 'results'],
        true
    ),
    (
        'sms_template'::marketplace_category,
        'School Closure Notice',
        'Emergency or planned school closure notification',
        '{"text": "URGENT: Dear parents, {school_name} will be closed on {date} due to {reason}. Normal operations resume on {resume_date}. Apologies for any inconvenience."}'::jsonb,
        ARRAY['school_name', 'date', 'reason', 'resume_date'],
        ARRAY['emergency', 'closure'],
        false
    ),
    (
        'fee_structure'::marketplace_category,
        'Primary School Standard',
        'Typical fee structure for a Ugandan private primary school',
        '{"items": [{"name": "Tuition", "is_mandatory": true, "amount": 250000}, {"name": "Development Levy", "is_mandatory": true, "amount": 50000}, {"name": "Lunch", "is_mandatory": false, "amount": 80000}, {"name": "PTA Contribution", "is_mandatory": true, "amount": 20000}, {"name": "ICT Levy", "is_mandatory": true, "amount": 15000}, {"name": "Sports Levy", "is_mandatory": false, "amount": 15000}]}'::jsonb,
        ARRAY[]::text[],
        ARRAY['primary', 'standard'],
        true
    ),
    (
        'fee_structure'::marketplace_category,
        'Secondary School Standard',
        'Common fee structure for Ugandan private secondary school',
        '{"items": [{"name": "Tuition", "is_mandatory": true, "amount": 450000}, {"name": "Development Levy", "is_mandatory": true, "amount": 75000}, {"name": "Lunch", "is_mandatory": false, "amount": 90000}, {"name": "PTA Contribution", "is_mandatory": true, "amount": 30000}, {"name": "Exam Fees", "is_mandatory": true, "amount": 45000}, {"name": "Library Fee", "is_mandatory": true, "amount": 20000}]}'::jsonb,
        ARRAY[]::text[],
        ARRAY['secondary', 'standard'],
        true
    ),
    (
        'report_comment'::marketplace_category,
        'Excellent Performance',
        'Headmaster comment for top-performing students',
        '{"text": "{student_name} has demonstrated exceptional academic dedication this term. Keep up the outstanding work and continue to inspire your peers."}'::jsonb,
        ARRAY['student_name'],
        ARRAY['report_card', 'excellent'],
        false
    ),
    (
        'report_comment'::marketplace_category,
        'Needs Improvement',
        'Encouraging comment for students who need to work harder',
        '{"text": "{student_name} has potential but needs to apply more effort consistently. We encourage more engagement in class and regular revision at home. We believe in your ability to improve."}'::jsonb,
        ARRAY['student_name'],
        ARRAY['report_card', 'improvement'],
        false
    )
) AS seed(category, name, description, body, variables, tags, is_featured)
WHERE NOT EXISTS (SELECT 1 FROM marketplace_templates);

-- ---------------------------------------------------------------------------
-- 4. sample school group for the chain-admin demo
-- ---------------------------------------------------------------------------
INSERT INTO school_groups (id, name, code, created_at, is_deleted) VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid,
     'SKULI Demo Chain', 'DEMO', now(), false)
ON CONFLICT (code) DO NOTHING;

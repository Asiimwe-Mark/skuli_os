CREATE TABLE platform_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid REFERENCES users(id)
);

INSERT INTO platform_settings (key, value) VALUES
    ('sms_rate_ugx', '25'),
    ('transaction_fee_pct', '1.5'),
    ('feature_flags', '{"starter": {"mobile_money": false, "report_cards": true}, "growth": {"mobile_money": true, "report_cards": true}, "pro": {"mobile_money": true, "report_cards": true, "payroll": true}}');

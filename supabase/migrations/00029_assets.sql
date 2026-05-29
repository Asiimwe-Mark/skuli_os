-- =============================================================================
-- Assets & Inventory Management
-- Migration 00029
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. asset_condition enum
-- ---------------------------------------------------------------------------
CREATE TYPE asset_condition AS ENUM ('excellent', 'good', 'fair', 'poor', 'written_off');

-- ---------------------------------------------------------------------------
-- 2. assets
-- ---------------------------------------------------------------------------
CREATE TABLE assets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    asset_code      text,
    category        text,
    purchase_date   date,
    purchase_price  numeric,
    current_value   numeric,
    condition       asset_condition NOT NULL DEFAULT 'good',
    location        text,
    assigned_to     uuid REFERENCES users(id),
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 3. asset_maintenance
-- ---------------------------------------------------------------------------
CREATE TABLE asset_maintenance (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id          uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    maintenance_date  date NOT NULL,
    description       text NOT NULL,
    cost              numeric,
    next_service_date date,
    performed_by      text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. RLS Policies: assets
-- ---------------------------------------------------------------------------
CREATE POLICY "school_manage_assets" ON assets FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- 6. RLS Policies: asset_maintenance
-- ---------------------------------------------------------------------------
CREATE POLICY "school_manage_maintenance" ON asset_maintenance FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_maintenance
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_assets_school ON assets(school_id) WHERE is_deleted = false;
CREATE INDEX idx_assets_category ON assets(category) WHERE is_deleted = false;
CREATE INDEX idx_assets_code ON assets(asset_code) WHERE asset_code IS NOT NULL;
CREATE INDEX idx_asset_maintenance_asset ON asset_maintenance(asset_id);
CREATE INDEX idx_asset_maintenance_school ON asset_maintenance(school_id);
CREATE INDEX idx_asset_maintenance_next_service ON asset_maintenance(next_service_date) WHERE next_service_date IS NOT NULL;

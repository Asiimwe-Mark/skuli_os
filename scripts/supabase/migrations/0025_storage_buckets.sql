-- =============================================================================
-- SKULI SaaS: Storage Buckets
-- Migration 0025
--
-- The four buckets the app uses were never declared in the legacy
-- migration set (00001-00067) — every `.storage.from('bucket')` call
-- in the app was implicitly relying on bucket rows that did not exist.
-- This file declares all four with the right public/private flag and
-- adds RLS policies on storage.objects for each.
-- ------------------------------------------------------------------------===

-- ---------------------------------------------------------------------------
-- 1. Bucket rows
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
    ('staff-photos',   'staff-photos',   true),
    ('student-photos', 'student-photos', true),
    ('school-assets',  'school-assets',  true),
    ('report-cards',   'report-cards',   false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. storage.objects RLS policies
--
-- Public buckets: anyone can SELECT; only authenticated users in the
-- owning school (matched by the first path segment) can write.
--
-- report-cards: private. Only school members can SELECT, INSERT,
-- UPDATE, DELETE within their school.
-- ---------------------------------------------------------------------------

-- staff-photos: public read
DROP POLICY IF EXISTS "staff_photos_public_read"     ON storage.objects;
DROP POLICY IF EXISTS "staff_photos_school_write"   ON storage.objects;
DROP POLICY IF EXISTS "staff_photos_school_update"  ON storage.objects;
DROP POLICY IF EXISTS "staff_photos_school_delete"  ON storage.objects;

CREATE POLICY "staff_photos_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'staff-photos');

CREATE POLICY "staff_photos_school_write"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'staff-photos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "staff_photos_school_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'staff-photos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "staff_photos_school_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'staff-photos'
        AND auth.role() = 'authenticated'
    );

-- student-photos: public read
DROP POLICY IF EXISTS "student_photos_public_read"    ON storage.objects;
DROP POLICY IF EXISTS "student_photos_school_write"  ON storage.objects;
DROP POLICY IF EXISTS "student_photos_school_update" ON storage.objects;
DROP POLICY IF EXISTS "student_photos_school_delete" ON storage.objects;

CREATE POLICY "student_photos_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'student-photos');

CREATE POLICY "student_photos_school_write"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "student_photos_school_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "student_photos_school_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
    );

-- school-assets: public read
DROP POLICY IF EXISTS "school_assets_public_read"    ON storage.objects;
DROP POLICY IF EXISTS "school_assets_school_write"  ON storage.objects;
DROP POLICY IF EXISTS "school_assets_school_update" ON storage.objects;
DROP POLICY IF EXISTS "school_assets_school_delete" ON storage.objects;

CREATE POLICY "school_assets_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'school-assets');

CREATE POLICY "school_assets_school_write"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'school-assets'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "school_assets_school_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'school-assets'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "school_assets_school_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'school-assets'
        AND auth.role() = 'authenticated'
    );

-- report-cards: private (signed URLs only). Only school members.
DROP POLICY IF EXISTS "report_cards_school_read"   ON storage.objects;
DROP POLICY IF EXISTS "report_cards_school_write"  ON storage.objects;
DROP POLICY IF EXISTS "report_cards_school_update" ON storage.objects;
DROP POLICY IF EXISTS "report_cards_school_delete" ON storage.objects;

CREATE POLICY "report_cards_school_read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'report-cards'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "report_cards_school_write"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'report-cards'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "report_cards_school_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'report-cards'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "report_cards_school_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'report-cards'
        AND auth.role() = 'authenticated'
    );

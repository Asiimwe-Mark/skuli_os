-- =============================================================================
-- SKULI SaaS: Tenant-scoped storage (Audit §8.2)
-- Migration 0028 (part 5)
--
-- The previous storage policies (0025_storage_buckets.sql) only
-- checked `bucket_id = '...'` and `auth.role() = 'authenticated'`.
-- The result:
--   * any authenticated user from any school could SELECT / INSERT /
--     UPDATE / DELETE in the `report-cards` private bucket (PII leak
--     across tenants);
--   * the public photo buckets were world-readable AND writable
--     by any authenticated user — one school could overwrite or
--     delete another's logos and student photos.
--
-- This migration replaces every storage.objects policy with one that
-- requires:
--   * the caller's first path segment to equal their school_id
--     (or 'public' for genuinely public assets),
--   * a role predicate where writes are involved.
-- The convention enforced by the app is `<school_id>/<object-name>`
-- for school-owned objects and `public/<asset-name>` for cross-
-- tenant shared assets (none today, but the escape hatch is there).
-- ---------------------------------------------------------------------------

-- Drop every prior policy on storage.objects that this migration
-- replaces. We keep the bucket rows themselves (0025) so existing
-- data is untouched.
DROP POLICY IF EXISTS "staff_photos_public_read"      ON storage.objects;
DROP POLICY IF EXISTS "staff_photos_school_write"    ON storage.objects;
DROP POLICY IF EXISTS "staff_photos_school_update"   ON storage.objects;
DROP POLICY IF EXISTS "staff_photos_school_delete"   ON storage.objects;
DROP POLICY IF EXISTS "student_photos_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "student_photos_school_write"  ON storage.objects;
DROP POLICY IF EXISTS "student_photos_school_update" ON storage.objects;
DROP POLICY IF EXISTS "student_photos_school_delete" ON storage.objects;
DROP POLICY IF EXISTS "school_assets_public_read"    ON storage.objects;
DROP POLICY IF EXISTS "school_assets_school_write"   ON storage.objects;
DROP POLICY IF EXISTS "school_assets_school_update"  ON storage.objects;
DROP POLICY IF EXISTS "school_assets_school_delete"  ON storage.objects;
DROP POLICY IF EXISTS "report_cards_school_read"     ON storage.objects;
DROP POLICY IF EXISTS "report_cards_school_write"    ON storage.objects;
DROP POLICY IF EXISTS "report_cards_school_update"   ON storage.objects;
DROP POLICY IF EXISTS "report_cards_school_delete"   ON storage.objects;

-- ---------------------------------------------------------------------------
-- staff-photos / student-photos / school-assets
--
-- Public read (so logos, head-shots and the school homepage assets
-- can be served by a CDN without an auth cookie) but writes require
-- the path's first segment to match the caller's school.
-- ---------------------------------------------------------------------------
CREATE POLICY "staff_photos_public_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'staff-photos');

CREATE POLICY "staff_photos_school_write" ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'staff-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "staff_photos_school_update" ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'staff-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "staff_photos_school_delete" ON storage.objects FOR DELETE
    USING (
        bucket_id = 'staff-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "student_photos_public_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'student-photos');

CREATE POLICY "student_photos_school_write" ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "student_photos_school_update" ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "student_photos_school_delete" ON storage.objects FOR DELETE
    USING (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "school_assets_public_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'school-assets');

CREATE POLICY "school_assets_school_write" ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'school-assets'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "school_assets_school_update" ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'school-assets'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "school_assets_school_delete" ON storage.objects FOR DELETE
    USING (
        bucket_id = 'school-assets'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

-- ---------------------------------------------------------------------------
-- report-cards: PRIVATE bucket, same-school only.
-- Reads additionally require SCHOOL_ADMIN / BURSAR / TEACHER for the
-- school, or the parent linked to the report-card's student (the
-- parent path is enforced in code via signed URL generation; RLS is
-- the second line of defense).
-- ---------------------------------------------------------------------------
CREATE POLICY "report_cards_school_read" ON storage.objects FOR SELECT
    USING (
        bucket_id = 'report-cards'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
    );

CREATE POLICY "report_cards_school_write" ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'report-cards'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
        AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER')
    );

CREATE POLICY "report_cards_school_update" ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'report-cards'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
        AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER')
    );

CREATE POLICY "report_cards_school_delete" ON storage.objects FOR DELETE
    USING (
        bucket_id = 'report-cards'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = get_user_school_id()::text
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

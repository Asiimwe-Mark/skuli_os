-- =============================================================================
-- SKULI SaaS: Extensions
-- Migration 0001
--
-- All extensions live in the `extensions` schema (Supabase convention).
-- pgcrypto is required for encrypt_secret / decrypt_secret.
-- citext provides case-insensitive text columns.
-- pg_trgm enables trigram indexes for fuzzy text search.
-- btree_gin lets us build GIN indexes on a mix of types.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto   SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext     SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm    SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin  SCHEMA extensions;

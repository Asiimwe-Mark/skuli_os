import { NextRequest } from 'next/server';
import { z } from 'zod';
import type { Database } from '@/types/database';
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  AuthError,
} from '@/lib/api-helpers';

const KEY_FIELD_MAP: Record<string, { enc: string; plain: string | null }> = {
  // Migration 00040 drops the plaintext column once the vault key is
  // configured. We try `_enc` first; if that succeeds we use it. If
  // the migration has not yet been run we fall back to the plaintext
  // column so the reveal flow keeps working in dev.
  at_key: { enc: 'africas_talking_api_key_enc', plain: 'africas_talking_api_key' },
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN']);

    const url = new URL(request.url);
    const revealKey = url.searchParams.get('key');

    if (revealKey) {
      // Decrypt and return a specific credential
      const mapping = KEY_FIELD_MAP[revealKey];
      if (!mapping) {
        return errorResponse('Unknown credential key', 400);
      }

      // Build the SELECT column list defensively. Migration 00040 drops
      // the plaintext column, so the .plain read may 400 if the column
      // is gone. We always read the encrypted column; we only read
      // plaintext if it's still defined in the map.
      const selectColumns = mapping.plain
        ? `${mapping.enc}, ${mapping.plain}`
        : mapping.enc;
      const { data: school, error } = await ctx.supabase
        .from('schools')
        .select(selectColumns)
        .eq('id', schoolId)
        .single();

      if (error || !school) {
        return errorResponse('School not found', 404);
      }

      const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;
      const encValue = (school as unknown as Record<string, unknown>)[mapping.enc] as string | null;

      if (encValue && vaultKey) {
        const { data: decrypted } = await ctx.supabase.rpc('decrypt_secret', {
          encrypted: encValue,
          key: vaultKey,
        });
        if (decrypted) {
          // Audit the reveal
          await ctx.supabase.from('audit_logs').insert({
            school_id: schoolId,
            user_id: ctx.profile.id,
            action: 'CREDENTIAL_REVEALED',
            entity_type: 'school',
            entity_id: schoolId,
            old_value: null,
            new_value: { key: revealKey },
            ip_address: null,
          } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

          return successResponse({ value: decrypted as string });
        }
      }

      return successResponse({ value: null });
    }

    // Default: return masked status. Presence is derived from the *_enc (Vault)
    // columns so this keeps working after the plaintext columns are dropped.
    const { data: school, error } = await ctx.supabase
      .from('schools')
      .select('africas_talking_username, africas_talking_api_key_enc, africas_talking_username_enc, resend_api_key_enc')
      .eq('id', schoolId)
      .single();

    if (error || !school) {
      return errorResponse('School not found', 404);
    }

    const s = school as Record<string, unknown>;
    const masked = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

    return successResponse({
      africas_talking_username: s.africas_talking_username || null,
      has_at_key: !!s.africas_talking_api_key_enc,
      at_key_display: s.africas_talking_api_key_enc ? masked : null,
      has_resend: !!s.resend_api_key_enc,
    });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('GET /api/settings/api error:', e);
    return errorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'BURSAR']);

    const body = await request.json();
    const section = body.section as string;

    const updatePayload: Record<string, unknown> = {};

    const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;

    // Encrypt a secret into its *_enc column. Fails closed: if the vault key is
    // missing or encryption fails we throw, so a secret is NEVER written as
    // plaintext to the database.
    async function encryptInto(encColumn: string, value: string) {
      if (!vaultKey) {
        throw new AuthError('Secret storage is not configured (missing vault key)', 500);
      }
      const { data: enc, error } = await ctx.supabase.rpc('encrypt_secret', {
        secret: value,
        key: vaultKey,
      });
      if (error || !enc) {
        throw new AuthError('Failed to encrypt credential', 500);
      }
      updatePayload[encColumn] = enc as string;
    }

    if (section === 'africastalking') {
      if (body.africas_talking_username !== undefined) {
        updatePayload.africas_talking_username = body.africas_talking_username;
      }
      if (body.africas_talking_api_key && body.africas_talking_api_key !== MASK) {
        await encryptInto('africas_talking_api_key_enc', body.africas_talking_api_key);
      }
      if (body.sms_sender_id !== undefined) {
        updatePayload.sms_sender_id = body.sms_sender_id;
      }
    } else if (section === 'resend') {
      if (body.resend_api_key && body.resend_api_key !== MASK) {
        await encryptInto('resend_api_key_enc', body.resend_api_key);
      }
    } else {
      return errorResponse('Unknown section', 400);
    }

    if (Object.keys(updatePayload).length === 0) {
      return successResponse({ message: 'No changes to save' });
    }

    const { error: updateErr } = await ctx.supabase
      .from('schools')
      .update(updatePayload as unknown as Database["public"]["Tables"]["schools"]["Update"])
      .eq('id', schoolId);

    if (updateErr) {
      return errorResponse('Failed to save credentials', 500);
    }

    // Audit log
    await ctx.supabase.from('audit_logs').insert({
      school_id: schoolId,
      user_id: ctx.profile.id,
      action: 'CREDENTIALS_UPDATED',
      entity_type: 'school',
      entity_id: schoolId,
      old_value: null,
      new_value: { section, fields: Object.keys(updatePayload) },
      ip_address: null,
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return successResponse({ message: 'Credentials saved successfully' });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('POST /api/settings/api error:', e);
    return errorResponse('Internal server error', 500);
  }
}

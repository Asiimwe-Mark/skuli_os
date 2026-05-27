import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  AuthError,
} from '@/lib/api-helpers';

const KEY_FIELD_MAP: Record<string, { enc: string; plain: string }> = {
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

      const { data: school, error } = await ctx.supabase
        .from('schools')
        .select(`${mapping.enc}, ${mapping.plain}`)
        .eq('id', schoolId)
        .single();

      if (error || !school) {
        return errorResponse('School not found', 404);
      }

      const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;
      const encValue = (school as Record<string, unknown>)[mapping.enc] as string | null;

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
            new_value: { key: revealKey },
          } as Record<string, unknown>);

          return successResponse({ value: decrypted as string });
        }
      }

      // Fallback to plaintext
      const plainValue = (school as Record<string, unknown>)[mapping.plain] as string | null;
      if (plainValue) {
        return successResponse({ value: plainValue });
      }

      return successResponse({ value: null });
    }

    // Default: return masked status
    const { data: school, error } = await ctx.supabase
      .from('schools')
      .select('africas_talking_username, africas_talking_api_key, africas_talking_api_key_enc, africas_talking_username_enc, flutterwave_public_key, flutterwave_secret_key, flutterwave_encryption_key, resend_api_key')
      .eq('id', schoolId)
      .single();

    if (error || !school) {
      return errorResponse('School not found', 404);
    }

    const s = school as Record<string, unknown>;
    const masked = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

    return successResponse({
      africas_talking_username: s.africas_talking_username || null,
      has_at_key: !!(s.africas_talking_api_key_enc || s.africas_talking_api_key),
      at_key_display: (s.africas_talking_api_key_enc || s.africas_talking_api_key) ? masked : null,
      has_fw_public: !!s.flutterwave_public_key,
      has_fw_secret: !!s.flutterwave_secret_key,
      has_fw_enc: !!s.flutterwave_encryption_key,
      has_resend: !!s.resend_api_key,
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

    if (section === 'africastalking') {
      if (body.africas_talking_username !== undefined) {
        updatePayload.africas_talking_username = body.africas_talking_username;
      }
      if (body.africas_talking_api_key && body.africas_talking_api_key !== '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
        const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;
        if (vaultKey) {
          const { data: encryptedKey } = await ctx.supabase.rpc('encrypt_secret', {
            secret: body.africas_talking_api_key,
            key: vaultKey,
          });
          if (encryptedKey) {
            updatePayload.africas_talking_api_key_enc = encryptedKey;
          }
        }
        updatePayload.africas_talking_api_key = body.africas_talking_api_key;
      }
      if (body.sms_sender_id !== undefined) {
        (updatePayload as Record<string, unknown>).sms_sender_id = body.sms_sender_id;
      }
    } else if (section === 'flutterwave') {
      if (body.flutterwave_public_key && body.flutterwave_public_key !== '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
        updatePayload.flutterwave_public_key = body.flutterwave_public_key;
      }
      if (body.flutterwave_secret_key && body.flutterwave_secret_key !== '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
        updatePayload.flutterwave_secret_key = body.flutterwave_secret_key;
      }
      if (body.flutterwave_encryption_key && body.flutterwave_encryption_key !== '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
        updatePayload.flutterwave_encryption_key = body.flutterwave_encryption_key;
      }
    } else if (section === 'resend') {
      if (body.resend_api_key && body.resend_api_key !== '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
        updatePayload.resend_api_key = body.resend_api_key;
      }
    } else {
      return errorResponse('Unknown section', 400);
    }

    if (Object.keys(updatePayload).length === 0) {
      return successResponse({ message: 'No changes to save' });
    }

    const { error: updateErr } = await ctx.supabase
      .from('schools')
      .update(updatePayload)
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
      new_value: { section, fields: Object.keys(updatePayload) },
    } as Record<string, unknown>);

    return successResponse({ message: 'Credentials saved successfully' });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('POST /api/settings/api error:', e);
    return errorResponse('Internal server error', 500);
  }
}

'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSchoolStore } from '@/store/school';
import { createBrowserClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  Smartphone,
  CreditCard,
  Mail,
  Wifi,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

interface ApiCredentials {
  africas_talking_username: string;
  africas_talking_api_key: string;
  sms_sender_id: string;
  flutterwave_public_key: string;
  flutterwave_secret_key: string;
  flutterwave_encryption_key: string;
  resend_api_key: string;
}

export default function ApiKeysPage() {
  const { school, setSchool } = useSchoolStore();
  const { canManageSchool } = usePermissions();
  const supabase = createBrowserClient();
  const { toast } = useToast();

  const masked = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

  const [form, setForm] = useState<ApiCredentials>({
    africas_talking_username: '',
    africas_talking_api_key: masked,
    sms_sender_id: '',
    flutterwave_public_key: masked,
    flutterwave_secret_key: masked,
    flutterwave_encryption_key: masked,
    resend_api_key: masked,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [revealingKey, setRevealingKey] = useState<string | null>(null);

  const hasStoredKey = (field: string): boolean => {
    if (!school) return false;
    const schoolData = school as unknown as Record<string, unknown>;
    switch (field) {
      case 'at_key': return !!schoolData.africas_talking_api_key_enc || !!schoolData.africas_talking_api_key;
      case 'fw_public': return !!schoolData.flutterwave_public_key;
      case 'fw_secret': return !!schoolData.flutterwave_secret_key;
      case 'fw_enc': return !!schoolData.flutterwave_encryption_key;
      case 'resend': return !!schoolData.resend_api_key;
      default: return false;
    }
  };

  useEffect(() => {
    if (!school) return;
    const schoolData = school as unknown as Record<string, string>;
    setForm({
      africas_talking_username: school.africas_talking_username || '',
      africas_talking_api_key: school.africas_talking_api_key ? masked : '',
      sms_sender_id: schoolData.sms_sender_id || '',
      flutterwave_public_key: schoolData.flutterwave_public_key ? masked : '',
      flutterwave_secret_key: schoolData.flutterwave_secret_key ? masked : '',
      flutterwave_encryption_key: schoolData.flutterwave_encryption_key ? masked : '',
      resend_api_key: schoolData.resend_api_key ? masked : '',
    });
    setLoading(false);
  }, [school]);

  function toggleReveal(field: string) {
    const isRevealed = reveal[field];
    if (isRevealed) {
      setReveal((prev) => ({ ...prev, [field]: false }));
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return;
    }

    if (revealedValues[field]) {
      setReveal((prev) => ({ ...prev, [field]: true }));
      return;
    }

    // Fetch decrypted value from API
    setRevealingKey(field);
    fetch(`/api/settings/api?key=${field}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.value) {
          setRevealedValues((prev) => ({ ...prev, [field]: data.value }));
          setReveal((prev) => ({ ...prev, [field]: true }));
        } else {
          toast({ title: 'No value stored', description: 'This credential has not been set yet.' });
        }
      })
      .catch(() => {
        toast({ title: 'Error', description: 'Could not retrieve credential.', variant: 'destructive' });
      })
      .finally(() => setRevealingKey(null));
  }

  function getDisplayValue(field: string, formField: keyof ApiCredentials): string {
    if (reveal[field] && revealedValues[field]) return revealedValues[field];
    if (reveal[field]) return form[formField];
    if (hasStoredKey(field)) return masked;
    return form[formField];
  }

  async function handleSave(section: string) {
    if (!school) return;
    setSaving(true);
    try {
      const payload: Record<string, string | null> = {};

      if (section === 'africastalking') {
        payload.africas_talking_username = form.africas_talking_username || null;
        if (form.africas_talking_api_key !== masked) {
          payload.africas_talking_api_key = form.africas_talking_api_key || null;
        }
      } else if (section === 'flutterwave') {
        if (form.flutterwave_public_key !== masked) {
          payload.flutterwave_public_key = form.flutterwave_public_key || null;
        }
        if (form.flutterwave_secret_key !== masked) {
          payload.flutterwave_secret_key = form.flutterwave_secret_key || null;
        }
        if (form.flutterwave_encryption_key !== masked) {
          payload.flutterwave_encryption_key = form.flutterwave_encryption_key || null;
        }
      } else if (section === 'resend') {
        if (form.resend_api_key !== masked) {
          payload.resend_api_key = form.resend_api_key || null;
        }
      }

      // Save via API to encrypt sensitive fields
      const response = await fetch('/api/settings/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, ...payload }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');

      // Refresh school data
      const { data: updatedSchool } = await supabase
        .from('schools')
        .select('*')
        .eq('id', school.id)
        .single();

      if (updatedSchool) setSchool(updatedSchool);
      toast({ title: 'Credentials saved', description: `${section} credentials updated successfully.` });

      // Re-mask all fields
      setReveal({});
      setRevealedValues({});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSms() {
    if (!school) return;
    setTestingSms(true);
    try {
      const response = await fetch('/api/africas-talking/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: school.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Test failed');
      toast({ title: 'Test SMS sent', description: 'Check your phone for the test message.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send test SMS';
      toast({ title: 'Test failed', description: message, variant: 'destructive' });
    } finally {
      setTestingSms(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div {...fadeInUp}>
        <h1 className="text-2xl font-bold">API Keys & Integrations</h1>
        <p className="text-foreground/60 text-sm">Manage third-party service credentials. Keys are stored encrypted.</p>
      </motion.div>

      {/* Africa's Talking */}
      <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
        <Card className="border-border-subtle bg-surface">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-amber-400" />
              Africa&apos;s Talking (SMS)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={form.africas_talking_username}
                  onChange={(e) => setForm((f) => ({ ...f, africas_talking_username: e.target.value }))}
                  disabled={!canManageSchool}
                  placeholder="e.g. schoolname"
                />
              </div>
              <div className="space-y-2">
                <Label>SMS Sender ID</Label>
                <Input
                  value={form.sms_sender_id}
                  onChange={(e) => setForm((f) => ({ ...f, sms_sender_id: e.target.value }))}
                  disabled={!canManageSchool}
                  placeholder="e.g. SKULI"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={reveal.at_key ? 'text' : 'password'}
                  value={getDisplayValue('at_key', 'africas_talking_api_key')}
                  onChange={(e) => setForm((f) => ({ ...f, africas_talking_api_key: e.target.value }))}
                  disabled={!canManageSchool}
                  placeholder="atsk_..."
                  className="pr-10"
                />
                {canManageSchool && (
                  <button
                    type="button"
                    onClick={() => toggleReveal('at_key')}
                    disabled={revealingKey === 'at_key'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                  >
                    {reveal.at_key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageSchool && (
                <Button onClick={() => handleSave('africastalking')} disabled={saving}>
                  {saving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" />Save</>}
                </Button>
              )}
              {canManageSchool && (
                <Button variant="outline" onClick={handleTestSms} disabled={testingSms}>
                  <Wifi className="w-4 h-4 mr-2" />
                  {testingSms ? 'Testing...' : 'Test Connection'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Flutterwave */}
      <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
        <Card className="border-border-subtle bg-surface">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-400" />
              Flutterwave (Payments)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Public Key</Label>
              <div className="relative">
                <Input
                  type={reveal.fw_public ? 'text' : 'password'}
                  value={getDisplayValue('fw_public', 'flutterwave_public_key')}
                  onChange={(e) => setForm((f) => ({ ...f, flutterwave_public_key: e.target.value }))}
                  disabled={!canManageSchool}
                  placeholder="FLWPUBK-..."
                  className="pr-10"
                />
                {canManageSchool && (
                  <button
                    type="button"
                    onClick={() => toggleReveal('fw_public')}
                    disabled={revealingKey === 'fw_public'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                  >
                    {reveal.fw_public ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Secret Key</Label>
                <div className="relative">
                  <Input
                    type={reveal.fw_secret ? 'text' : 'password'}
                    value={getDisplayValue('fw_secret', 'flutterwave_secret_key')}
                    onChange={(e) => setForm((f) => ({ ...f, flutterwave_secret_key: e.target.value }))}
                    disabled={!canManageSchool}
                    placeholder="FLWSECK-..."
                    className="pr-10"
                  />
                  {canManageSchool && (
                    <button
                      type="button"
                      onClick={() => toggleReveal('fw_secret')}
                      disabled={revealingKey === 'fw_secret'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                    >
                      {reveal.fw_secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Encryption Key</Label>
                <div className="relative">
                  <Input
                    type={reveal.fw_enc ? 'text' : 'password'}
                    value={getDisplayValue('fw_enc', 'flutterwave_encryption_key')}
                    onChange={(e) => setForm((f) => ({ ...f, flutterwave_encryption_key: e.target.value }))}
                    disabled={!canManageSchool}
                    placeholder="FLWSECK_TEST..."
                    className="pr-10"
                  />
                  {canManageSchool && (
                    <button
                      type="button"
                      onClick={() => toggleReveal('fw_enc')}
                      disabled={revealingKey === 'fw_enc'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                    >
                      {reveal.fw_enc ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {canManageSchool && (
              <Button onClick={() => handleSave('flutterwave')} disabled={saving}>
                {saving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" />Save</>}
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Resend */}
      <motion.div {...fadeInUp} transition={{ delay: 0.15 }}>
        <Card className="border-border-subtle bg-surface">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-400" />
              Resend (Email)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={reveal.resend ? 'text' : 'password'}
                  value={getDisplayValue('resend', 'resend_api_key')}
                  onChange={(e) => setForm((f) => ({ ...f, resend_api_key: e.target.value }))}
                  disabled={!canManageSchool}
                  placeholder="re_..."
                  className="pr-10"
                />
                {canManageSchool && (
                  <button
                    type="button"
                    onClick={() => toggleReveal('resend')}
                    disabled={revealingKey === 'resend'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                  >
                    {reveal.resend ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
            {canManageSchool && (
              <Button onClick={() => handleSave('resend')} disabled={saving}>
                {saving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" />Save</>}
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

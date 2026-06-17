'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSchoolStore } from '@/store/school';
import { useSupabaseBrowser } from '@/lib/supabase/client';
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
  resend_api_key: string;
}

interface PesapalConfig {
  configured: boolean;
  has_ipn: boolean;
  sandbox: boolean;
}

export default function ApiKeysPage() {
  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const setSchool = useSchoolStore((s) => s.setSchool);
  const { canManageSchool } = usePermissions();
  const supabase = useSupabaseBrowser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const masked = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

  const [form, setForm] = useState<ApiCredentials>({
    africas_talking_username: '',
    africas_talking_api_key: masked,
    sms_sender_id: '',
    resend_api_key: masked,
  });
  const [saving, setSaving] = useState(false);
  const [testingSms, setTestingSms] = useState(false);

  // Pesapal section state
  const [pesapalKey, setPesapalKey] = useState('');
  const [pesapalSecret, setPesapalSecret] = useState('');
  const [pesapalSandbox, setPesapalSandbox] = useState(true);
  const [pesapalConfigured, setPesapalConfigured] = useState(false);
  const [pesapalHasIpn, setPesapalHasIpn] = useState(false);
  const [savingPesapal, setSavingPesapal] = useState(false);
  const [testingPesapal, setTestingPesapal] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [revealingKey, setRevealingKey] = useState<string | null>(null);

  const hasStoredKey = (field: string): boolean => {
    if (!school) return false;
    const schoolData = school as unknown as Record<string, unknown>;
    switch (field) {
      case 'at_key': return !!schoolData.africas_talking_api_key_enc || !!schoolData.africas_talking_api_key;
      case 'resend': return !!schoolData.resend_api_key;
      default: return false;
    }
  };

  // Derive form values from school store
  useEffect(() => {
    if (!school) return;
    const schoolData = school as unknown as Record<string, string>;
    setForm({
      africas_talking_username: schoolData.africas_talking_username || '',
      africas_talking_api_key: (schoolData.africas_talking_api_key_enc || schoolData.africas_talking_api_key) ? masked : '',
      sms_sender_id: schoolData.sms_sender_id || '',
      resend_api_key: schoolData.resend_api_key ? masked : '',
    });
  }, [school]);

  // Load Pesapal configuration status
  const { data: pesapalData, isLoading: pesapalLoading } = useQuery<PesapalConfig | null>({
    queryKey: ['settings-api', school?.id, 'pesapal'],
    queryFn: async () => {
      const res = await fetch('/api/settings/pesapal');
      const json = await res.json();
      return (json.data ?? null) as PesapalConfig | null;
    },
    enabled: !!school?.id,
  });

  useEffect(() => {
    if (pesapalData) {
      setPesapalConfigured(!!pesapalData.configured);
      setPesapalHasIpn(!!pesapalData.has_ipn);
      setPesapalSandbox(pesapalData.sandbox !== false);
      if (pesapalData.configured) {
        setPesapalKey(masked);
        setPesapalSecret(masked);
      }
    }
  }, [pesapalData]);

  const loading = !school || pesapalLoading;

  async function handleSavePesapal() {
    setSavingPesapal(true);
    try {
      const payload: Record<string, unknown> = { sandbox: pesapalSandbox };
      if (pesapalKey && pesapalKey !== masked) payload.consumer_key = pesapalKey;
      if (pesapalSecret && pesapalSecret !== masked) payload.consumer_secret = pesapalSecret;
      const res = await fetch('/api/settings/pesapal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Save failed');
      setPesapalConfigured(true);
      setPesapalHasIpn(!!result.data?.ipn_id);
      setPesapalKey(masked);
      setPesapalSecret(masked);
      queryClient.invalidateQueries({ queryKey: ['settings-api', school?.id, 'pesapal'] });
      toast({ title: 'Pesapal configured', description: 'Credentials saved and IPN registered.' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setSavingPesapal(false);
    }
  }

  async function handleTestPesapal() {
    setTestingPesapal(true);
    try {
      const res = await fetch('/api/settings/pesapal/test');
      const result = await res.json();
      if (result.data?.ok) {
        toast({ title: 'Connection successful', description: 'Pesapal credentials are valid.' });
      } else {
        throw new Error(result.data?.message || 'Connection failed');
      }
    } catch (err) {
      toast({ title: 'Test failed', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setTestingPesapal(false);
    }
  }

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
        .select('id, name, logo_url, address, district, phone, email, motto, school_code, school_type, subscription_plan, subscription_status, trial_ends_at, max_students, sms_sender_id')
        .eq('id', school.id)
        .single();

      if (updatedSchool) setSchool(updatedSchool as unknown as import("@/types").School);
      queryClient.invalidateQueries({ queryKey: ['settings-api', school?.id] });
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
        <p className="text-heading text-sm">Manage third-party service credentials. Keys are stored encrypted.</p>
      </motion.div>

      {/* Africa's Talking */}
      <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-secondary" />
              Africa's Talking (SMS)
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-heading hover:text-heading"
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

      {/* Pesapal */}
      <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-secondary" />
              Pesapal Integration (Payments & Payroll)
              <span
                className={
                  'ml-2 rounded-full px-2 py-0.5 text-xs font-medium ' +
                  (pesapalConfigured
                    ? 'bg-success-100 text-success-700'
                    : 'bg-warning-100 text-warning-700')
                }
              >
                {pesapalConfigured ? (pesapalHasIpn ? 'Configured' : 'Configured (no IPN)') : 'Not configured'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Consumer Key</Label>
                <Input
                  type="password"
                  value={pesapalKey}
                  onChange={(e) => setPesapalKey(e.target.value)}
                  disabled={!canManageSchool}
                  placeholder="Pesapal consumer key"
                />
              </div>
              <div className="space-y-2">
                <Label>Consumer Secret</Label>
                <Input
                  type="password"
                  value={pesapalSecret}
                  onChange={(e) => setPesapalSecret(e.target.value)}
                  disabled={!canManageSchool}
                  placeholder="Pesapal consumer secret"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-heading-500">
              <input
                type="checkbox"
                checked={pesapalSandbox}
                onChange={(e) => setPesapalSandbox(e.target.checked)}
                disabled={!canManageSchool}
                className="h-4 w-4 rounded border-border"
              />
              Use Sandbox / Test environment
            </label>
            {canManageSchool && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSavePesapal} disabled={savingPesapal}>
                  {savingPesapal ? 'Saving...' : <><Save className="w-4 h-4 mr-2" />Save & Register IPN</>}
                </Button>
                <Button variant="outline" onClick={handleTestPesapal} disabled={testingPesapal}>
                  <Wifi className="w-4 h-4 mr-2" />
                  {testingPesapal ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Resend */}
      <motion.div {...fadeInUp} transition={{ delay: 0.15 }}>
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5 text-secondary" />
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-heading hover:text-heading"
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

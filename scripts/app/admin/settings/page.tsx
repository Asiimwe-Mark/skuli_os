"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import {
  Settings,
  MessageSquare,
  DollarSign,
  Flag,
  Send,
  Loader2,
  Check,
  Globe,
} from "lucide-react";

interface PlatformSettings {
  sms_rate_ugx: number;
  transaction_fee_pct: number;
  feature_flags: Record<string, Record<string, boolean>>;
}

interface CountryConfig {
  code: string;
  name: string;
  currency_code: string;
  phone_prefix: string;
  term_structure: string;
  is_active: boolean;
}

function CountryManagement() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ code: string; name: string; next: boolean } | null>(null);

  const { data: countries, isLoading } = useQuery<CountryConfig[]>({
    queryKey: ["admin-countries"],
    queryFn: async () => {
      const res = await fetch("/api/admin/countries");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data.countries as CountryConfig[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (vars: { code: string; is_active: boolean }) => {
      await fetch("/api/admin/countries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-countries"] });
      setPending(null);
    },
  });

  function requestToggle(c: CountryConfig) {
    const next = !c.is_active;
    // Confirm only when activating a new market.
    if (next) {
      setPending({ code: c.code, name: c.name, next });
    } else {
      toggleMutation.mutate({ code: c.code, is_active: next });
    }
  }

  return (
    <Card className="border-border bg-bg-tertiary">
      <CardHeader>
        <CardTitle className="text-heading text-base flex items-center gap-2">
          <Globe className="w-5 h-5 text-secondary" />
          Country Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted mb-4">
          Activating a country makes it available on the signup page. Ensure pricing, mobile money, and SMS routing are configured first.
        </p>
        {isLoading ? (
          <Skeleton className="h-32 rounded-lg bg-bg-tertiary" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2">Country</th>
                  <th className="py-2">Currency</th>
                  <th className="py-2">Prefix</th>
                  <th className="py-2 text-center">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(countries ?? []).map((c) => (
                  <tr key={c.code} className="hover:bg-card-hover">
                    <td className="py-3 text-heading">{c.name} <span className="text-muted">({c.code})</span></td>
                    <td className="py-3 text-muted">{c.currency_code}</td>
                    <td className="py-3 text-muted">{c.phone_prefix}</td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => requestToggle(c)}
                        disabled={toggleMutation.isPending}
                        className={`w-10 h-6 rounded-full transition-colors relative ${c.is_active ? "bg-bg-tertiary" : "bg-bg-tertiary"}`}
                        aria-label={`Toggle ${c.name}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${c.is_active ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <ConfirmModal
        open={!!pending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title={`Activate ${pending?.name ?? ""}?`}
        description={`Activating ${pending?.name ?? "this country"} will make it available on the signup page. Ensure pricing, mobile money, and SMS routing are configured first.`}
        confirmText="Activate"
        onConfirm={() => {
          if (pending) {
            toggleMutation.mutate({ code: pending.code, is_active: true });
          }
        }}
      />
    </Card>
  );
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const [smsRate, setSmsRate] = useState("");
  const [txFee, setTxFee] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastDone, setBroadcastDone] = useState(false);

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["admin-platform-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/platform-settings");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const rows = json.data as { key: string; value: unknown }[];
      const result: PlatformSettings = {
        sms_rate_ugx: 25,
        transaction_fee_pct: 1.5,
        feature_flags: {},
      };

      for (const row of rows) {
        if (row.key === "sms_rate_ugx") result.sms_rate_ugx = Number(row.value);
        else if (row.key === "transaction_fee_pct") result.transaction_fee_pct = Number(row.value);
        else if (row.key === "feature_flags") result.feature_flags = row.value as Record<string, Record<string, boolean>>;
      }

      setSmsRate(String(result.sms_rate_ugx));
      setTxFee(String(result.transaction_fee_pct));
      return result;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "sms_rate_ugx", value: Number(smsRate) }),
      });
      await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "transaction_fee_pct", value: Number(txFee) }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
  });

  const handleBroadcast = async () => {
    if (!broadcast.trim()) return;
    setBroadcastSending(true);
    setBroadcastDone(false);

    try {
      await fetch("/api/admin/platform-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "broadcast", title: "Platform Announcement", message: broadcast }),
      });

      setBroadcastDone(true);
      setBroadcast("");
      setTimeout(() => setBroadcastDone(false), 3000);
    } finally {
      setBroadcastSending(false);
    }
  };

  const toggleFeatureFlag = async (plan: string, flag: string, value: boolean) => {
    if (!settings) return;
    const newFlags = { ...settings.feature_flags };
    if (!newFlags[plan]) newFlags[plan] = {};
    newFlags[plan][flag] = value;

    await fetch("/api/admin/platform-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "feature_flags", value: newFlags }),
    });
    queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-heading">Platform Settings</h1>
        <Skeleton className="h-64 rounded-xl bg-bg-tertiary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-heading">Platform Settings</h1>

      {/* SMS Rate & Transaction Fee */}
      <Card className="border-border bg-bg-tertiary">
        <CardHeader>
          <CardTitle className="text-heading text-base flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-secondary" />
            Pricing Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                SMS Rate (UGX per SMS)
              </label>
              <Input
                type="number"
                value={smsRate}
                onChange={(e) => setSmsRate(e.target.value)}
                className="bg-bg-tertiary border-border text-heading"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Transaction Fee (%)
              </label>
              <Input
                type="number"
                step="0.1"
                value={txFee}
                onChange={(e) => setTxFee(e.target.value)}
                className="bg-bg-tertiary border-border text-heading"
              />
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4 mr-2" />
            ) : null}
            {saveSuccess ? "Saved!" : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card className="border-border bg-bg-tertiary">
        <CardHeader>
          <CardTitle className="text-heading text-base flex items-center gap-2">
            <Flag className="w-5 h-5 text-secondary" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settings?.feature_flags && Object.keys(settings.feature_flags).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-muted font-medium py-2">Feature</th>
                    {Object.keys(settings.feature_flags).map((plan) => (
                      <th key={plan} className="text-center text-muted font-medium py-2 capitalize">
                        {plan}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(() => {
                    const allFlags = new Set<string>();
                    for (const plan of Object.values(settings.feature_flags)) {
                      for (const flag of Object.keys(plan)) {
                        allFlags.add(flag);
                      }
                    }
                    return Array.from(allFlags).map((flag) => (
                      <tr key={flag} className="hover:bg-card-hover">
                        <td className="py-3 text-heading capitalize">{flag.replace(/_/g, " ")}</td>
                        {Object.entries(settings.feature_flags).map(([plan, flags]) => (
                          <td key={plan} className="py-3 text-center">
                            <button
                              onClick={() => toggleFeatureFlag(plan, flag, !flags[flag])}
                              className={`w-10 h-6 rounded-full transition-colors relative ${ flags[flag] ? "bg-bg-tertiary" : "bg-bg-tertiary" }`}
                            >
                              <span
                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${ flags[flag] ? "left-[18px]" : "left-0.5" }`}
                              />
                            </button>
                          </td>
                        ))}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted text-center py-4">No feature flags configured</p>
          )}
        </CardContent>
      </Card>

      {/* Country Management */}
      <CountryManagement />

      {/* Platform Broadcast */}
      <Card className="border-border bg-bg-tertiary">
        <CardHeader>
          <CardTitle className="text-heading text-base flex items-center gap-2">
            <Send className="w-5 h-5 text-secondary" />
            Platform Broadcast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted">
            Send an in-app notification to all SCHOOL_ADMIN users on the platform.
          </p>
          <textarea
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            placeholder="Write your announcement..."
            rows={4}
            className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-heading placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={handleBroadcast}
              disabled={!broadcast.trim() || broadcastSending}
            >
              {broadcastSending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send to All Schools
            </Button>
            {broadcastDone && (
              <span className="text-sm text-secondary">Broadcast sent successfully!</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

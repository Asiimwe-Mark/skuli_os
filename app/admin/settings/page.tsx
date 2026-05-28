"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Settings,
  MessageSquare,
  DollarSign,
  Flag,
  Send,
  Loader2,
  Check,
} from "lucide-react";

interface PlatformSettings {
  sms_rate_ugx: number;
  transaction_fee_pct: number;
  feature_flags: Record<string, Record<string, boolean>>;
}

export default function AdminSettingsPage() {
  const supabase = createBrowserClient();
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
      const { data: rows } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["sms_rate_ugx", "transaction_fee_pct", "feature_flags"]);

      const result: PlatformSettings = {
        sms_rate_ugx: 25,
        transaction_fee_pct: 1.5,
        feature_flags: {},
      };

      if (rows) {
        for (const row of rows) {
          if (row.key === "sms_rate_ugx") result.sms_rate_ugx = Number(row.value);
          else if (row.key === "transaction_fee_pct") result.transaction_fee_pct = Number(row.value);
          else if (row.key === "feature_flags") result.feature_flags = row.value as Record<string, Record<string, boolean>>;
        }
      }

      setSmsRate(String(result.sms_rate_ugx));
      setTxFee(String(result.transaction_fee_pct));
      return result;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("platform_settings").upsert([
        { key: "sms_rate_ugx", value: Number(smsRate) },
        { key: "transaction_fee_pct", value: Number(txFee) },
      ] as Record<string, unknown>[], { onConflict: "key" });
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
      const { data: admins } = await supabase
        .from("users")
        .select("id, school_id")
        .eq("role", "SCHOOL_ADMIN")
        .eq("is_active", true);

      if (admins && admins.length > 0) {
        const notifications = admins.map((admin: { school_id: string; id: string }) => ({
          school_id: admin.school_id,
          recipient_user_id: admin.id,
          title: "Platform Announcement",
          body: broadcast,
          type: "info",
        }));
        await supabase.from("in_app_notifications").insert(notifications as Record<string, unknown>[]);
      }

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

    await supabase.from("platform_settings").upsert(
      { key: "feature_flags", value: newFlags } as Record<string, unknown>,
      { onConflict: "key" }
    );
    queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
        <Skeleton className="h-64 rounded-xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Platform Settings</h1>

      {/* SMS Rate & Transaction Fee */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            Pricing Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-white/60 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                SMS Rate (UGX per SMS)
              </label>
              <Input
                type="number"
                value={smsRate}
                onChange={(e) => setSmsRate(e.target.value)}
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/60 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Transaction Fee (%)
              </label>
              <Input
                type="number"
                step="0.1"
                value={txFee}
                onChange={(e) => setTxFee(e.target.value)}
                className="bg-white/5 border-white/20 text-white"
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
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-400" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settings?.feature_flags && Object.keys(settings.feature_flags).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 font-medium py-2">Feature</th>
                    {Object.keys(settings.feature_flags).map((plan) => (
                      <th key={plan} className="text-center text-white/60 font-medium py-2 capitalize">
                        {plan}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(() => {
                    const allFlags = new Set<string>();
                    for (const plan of Object.values(settings.feature_flags)) {
                      for (const flag of Object.keys(plan)) {
                        allFlags.add(flag);
                      }
                    }
                    return Array.from(allFlags).map((flag) => (
                      <tr key={flag} className="hover:bg-white/5">
                        <td className="py-3 text-white capitalize">{flag.replace(/_/g, " ")}</td>
                        {Object.entries(settings.feature_flags).map(([plan, flags]) => (
                          <td key={plan} className="py-3 text-center">
                            <button
                              onClick={() => toggleFeatureFlag(plan, flag, !flags[flag])}
                              className={`w-10 h-6 rounded-full transition-colors relative ${
                                flags[flag] ? "bg-emerald-500" : "bg-white/20"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                                  flags[flag] ? "left-[18px]" : "left-0.5"
                                }`}
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
            <p className="text-white/40 text-center py-4">No feature flags configured</p>
          )}
        </CardContent>
      </Card>

      {/* Platform Broadcast */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Send className="w-5 h-5 text-amber-400" />
            Platform Broadcast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-white/60">
            Send an in-app notification to all SCHOOL_ADMIN users on the platform.
          </p>
          <textarea
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            placeholder="Write your announcement..."
            rows={4}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
              <span className="text-sm text-emerald-400">Broadcast sent successfully!</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

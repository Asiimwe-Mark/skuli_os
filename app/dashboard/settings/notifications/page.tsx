"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSchoolStore } from "@/store/school";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Bell,
  MessageSquare,
  AlertTriangle,
  Clock,
  FileText,
  Calendar,
} from "lucide-react";
import type { Database } from "@/types/database";

type NotifPrefs = Database['public']['Tables']['notification_preferences']['Row'];

const DAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: `${i.toString().padStart(2, "0")}:00`,
}));

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function NotificationPreferencesPage() {
  const { school } = useSchoolStore();
  const supabase = createClient();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create default preferences
        const { data: created, error: createErr } = await supabase
          .from("notification_preferences")
          .insert({ school_id: school!.id })
          .select()
          .single();
        if (createErr) throw createErr;
        return created as NotifPrefs;
      }

      return data as NotifPrefs;
    },
    enabled: !!school?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<NotifPrefs>) => {
      if (!prefs?.id) throw new Error("Preferences not loaded");
      const { error } = await supabase
        .from("notification_preferences")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", prefs.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast({ title: "Preference saved", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save",
        variant: "destructive",
      });
    },
  });

  function toggle(field: keyof NotifPrefs) {
    if (!prefs) return;
    updateMutation.mutate({ [field]: !prefs[field] } as Partial<NotifPrefs>);
  }

  if (isLoading || !prefs) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div {...fadeInUp}>
        <h1 className="text-2xl font-bold">Notification Preferences</h1>
        <p className="text-foreground/60 text-sm">
          Configure automatic SMS and notification triggers
        </p>
      </motion.div>

      <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
        <Card className="border-border-subtle bg-surface">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-400" />
              Auto-SMS Triggers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Receipt SMS */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-navy-900/50">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Send receipt SMS on payment</p>
                  <p className="text-sm text-foreground/50 mt-0.5">
                    Automatically send an SMS confirmation to parents when a fee payment is recorded.
                  </p>
                </div>
              </div>
              <Switch
                checked={prefs.send_receipt_sms}
                onCheckedChange={() => toggle("send_receipt_sms")}
                disabled={updateMutation.isPending}
              />
            </div>

            {/* Absent Alert */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-navy-900/50">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Send absent alert SMS to parents</p>
                  <p className="text-sm text-foreground/50 mt-0.5">
                    Notify parents via SMS when their child is marked absent.
                  </p>
                </div>
              </div>
              <Switch
                checked={prefs.send_absence_sms}
                onCheckedChange={() => toggle("send_absence_sms")}
                disabled={updateMutation.isPending}
              />
            </div>

            {/* Defaulter Reminder */}
            <div className="p-4 rounded-lg bg-navy-900/50 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Send weekly defaulter reminder</p>
                    <p className="text-sm text-foreground/50 mt-0.5">
                      Send a weekly SMS to parents with outstanding fee balances.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={prefs.send_weekly_defaulter}
                  onCheckedChange={() => toggle("send_weekly_defaulter")}
                  disabled={updateMutation.isPending}
                />
              </div>

              {prefs.send_weekly_defaulter && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  className="pl-12 grid grid-cols-1 sm:grid-cols-2 gap-4"
                >
                  <div className="space-y-2">
                    <Label className="text-xs text-foreground/50">Day of Week</Label>
                    <Select
                      value={prefs.defaulter_reminder_day.toString()}
                      onValueChange={(v) =>
                        updateMutation.mutate({ defaulter_reminder_day: parseInt(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-foreground/50">Hour</Label>
                    <Select
                      value={prefs.defaulter_reminder_hour.toString()}
                      onValueChange={(v) =>
                        updateMutation.mutate({ defaulter_reminder_hour: parseInt(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map((h) => (
                          <SelectItem key={h.value} value={h.value}>
                            {h.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Report Card Notification */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-navy-900/50">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Report card publication notification</p>
                  <p className="text-sm text-foreground/50 mt-0.5">
                    Notify parents via SMS when report cards are published.
                  </p>
                </div>
              </div>
              <Switch
                checked={prefs.send_report_card_sms}
                onCheckedChange={() => toggle("send_report_card_sms")}
                disabled={updateMutation.isPending}
              />
            </div>

            {/* Term Start SMS */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-navy-900/50">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Calendar className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Term start notification</p>
                  <p className="text-sm text-foreground/50 mt-0.5">
                    Notify parents when a new term begins.
                  </p>
                </div>
              </div>
              <Switch
                checked={prefs.send_term_start_sms}
                onCheckedChange={() => toggle("send_term_start_sms")}
                disabled={updateMutation.isPending}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

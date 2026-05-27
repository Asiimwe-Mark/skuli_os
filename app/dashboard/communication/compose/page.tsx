"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  Send,
  Users,
  AlertTriangle,
  MessageSquare,
  Loader2,
  DollarSign,
  Clock,
  Type,
  Wallet,
} from "lucide-react";

const SMS_COST_PER_SEGMENT = 25; // UGX per SMS segment
const MAX_SMS_CHARS = 160;

const VARIABLE_TOKENS = [
  { label: "Parent Name", token: "{parent_name}" },
  { label: "Student Name", token: "{student_name}" },
  { label: "Balance", token: "{balance}" },
  { label: "School Name", token: "{school_name}" },
  { label: "Term", token: "{term}" },
  { label: "Deadline", token: "{deadline}" },
  { label: "Results Link", token: "{results_link}" },
];

const TEMPLATES = [
  {
    name: "Fee Reminder",
    body: "Dear {parent_name}, {student_name}'s fee balance is {balance}. Please clear by the deadline. - {school_name}",
  },
  {
    name: "Exam Results Ready",
    body: "Dear {parent_name}, {student_name}'s exam results are ready. Log in to view at {results_link} - {school_name}",
  },
  {
    name: "School Closure",
    body: "Dear {parent_name}, please note that {school_name} will be closed on {deadline}. Normal classes resume soon.",
  },
  {
    name: "Event Reminder",
    body: "Dear {parent_name}, this is a reminder about an upcoming event at {school_name}. - {school_name}",
  },
];

export default function ComposePage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [targetAudience, setTargetAudience] = useState<"all" | "class" | "defaulters" | "custom">("all");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [customPhones, setCustomPhones] = useState("");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState({ sms: true, in_app: false });
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recipientCount, setRecipientCount] = useState(0);

  // Load classes
  const { data: classes = [] } = useQuery({
    queryKey: ["classes", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!school?.id,
  });

  // Fetch SMS balance
  const { data: smsBalance } = useQuery({
    queryKey: ["sms-balance", school?.id],
    queryFn: async () => {
      const res = await fetch("/api/communication/sms-balance");
      const result = await res.json();
      if (!result.success) return null;
      return result.data as { balance: string; currency: string; account: string };
    },
    enabled: !!school?.id && channels.sms,
    staleTime: 60_000,
  });

  // Fetch scheduled announcements
  const { data: scheduledAnnouncements = [] } = useQuery({
    queryKey: ["scheduled-announcements", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, scheduled_at, scheduled_status, created_at")
        .eq("school_id", school!.id)
        .not("scheduled_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!school?.id,
  });

  // Estimate recipient count
  useEffect(() => {
    async function countRecipients() {
      if (!school?.id) return;

      if (targetAudience === "all") {
        const { count } = await supabase
          .from("students")
          .select("*", { count: "exact", head: true })
          .eq("school_id", school.id)
          .eq("status", "active");
        setRecipientCount(count || 0);
      } else if (targetAudience === "class" && selectedClasses.length > 0) {
        const { count } = await supabase
          .from("class_enrollments")
          .select("*", { count: "exact", head: true })
          .in("class_id", selectedClasses);
        setRecipientCount(count || 0);
      } else if (targetAudience === "defaulters") {
        const { count } = await supabase
          .from("fee_accounts")
          .select("*", { count: "exact", head: true })
          .eq("school_id", school.id)
          .gt("balance", 0);
        setRecipientCount(count || 0);
      } else if (targetAudience === "custom") {
        const phones = customPhones.split("\n").filter((p) => p.trim()).length;
        setRecipientCount(phones);
      } else {
        setRecipientCount(0);
      }
    }
    countRecipients();
  }, [targetAudience, selectedClasses, customPhones, school, supabase]);

  const smsSegments = message.length > 0 ? Math.ceil(message.length / MAX_SMS_CHARS) : 0;
  const estimatedCost = recipientCount * smsSegments * SMS_COST_PER_SEGMENT;
  const balanceNum = smsBalance ? parseFloat(String(smsBalance.balance).replace(/[^0-9.]/g, "")) : null;
  const hasInsufficientBalance = balanceNum !== null && channels.sms && estimatedCost > 0 && balanceNum < estimatedCost;

  const insertVariable = (token: string) => {
    setMessage((prev) => prev + token);
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!message.trim()) throw new Error("Message cannot be empty");
      if (!channels.sms && !channels.in_app) throw new Error("Select at least one channel");
      if (recipientCount === 0) throw new Error("No recipients selected");

      const response = await fetch("/api/communication/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || undefined,
          target_audience: targetAudience,
          target_class_ids: targetAudience === "class" ? selectedClasses : undefined,
          custom_phones: targetAudience === "custom" ? customPhones.split("\n").filter((p) => p.trim()) : undefined,
          message_body: message,
          channels,
          schedule: scheduleType,
          scheduled_at: scheduleType === "later" ? scheduledAt : undefined,
        }),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Failed to send");
      return result;
    },
    onSuccess: (result) => {
      if (result.data?.scheduled) {
        toast({
          title: "Message scheduled!",
          description: `SMS will be sent at ${new Date(result.data.scheduled_at).toLocaleString()}.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Messages sent!",
          description: `${result.data?.sent || recipientCount} recipient(s) received the message.`,
          variant: "success",
        });
      }
      setMessage("");
      setTitle("");
    },
    onError: (err) => {
      toast({
        title: "Failed to send",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold font-display">Compose Message</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Send SMS and in-app announcements to parents
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Composer */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title */}
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-4">
              <div className="space-y-1">
                <Label className="text-xs">Title (optional)</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Term 2 Fee Reminder"
                />
              </div>
            </CardContent>
          </Card>

          {/* Target Audience */}
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-base">Target Audience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: "all" as const, label: "All Parents", icon: Users },
                  { value: "class" as const, label: "By Class", icon: Users },
                  { value: "defaulters" as const, label: "Fee Defaulters", icon: AlertTriangle },
                  { value: "custom" as const, label: "Custom List", icon: MessageSquare },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTargetAudience(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                      targetAudience === opt.value
                        ? "border-amber-400 bg-amber-400/5"
                        : "border-navy-600 hover:border-navy-500"
                    )}
                  >
                    <opt.icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>

              {targetAudience === "class" && (
                <div className="space-y-2">
                  <Label>Select Classes</Label>
                  <div className="flex flex-wrap gap-2">
                    {classes.map((cls: { id: string; name: string }) => (
                      <button
                        key={cls.id}
                        onClick={() =>
                          setSelectedClasses((prev) =>
                            prev.includes(cls.id)
                              ? prev.filter((id) => id !== cls.id)
                              : [...prev, cls.id]
                          )
                        }
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm border transition-all",
                          selectedClasses.includes(cls.id)
                            ? "border-amber-400 bg-amber-400/10 text-amber-400"
                            : "border-navy-600 text-foreground/60 hover:border-navy-500"
                        )}
                      >
                        {cls.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {targetAudience === "custom" && (
                <div className="space-y-2">
                  <Label>Phone Numbers (one per line)</Label>
                  <Textarea
                    value={customPhones}
                    onChange={(e) => setCustomPhones(e.target.value)}
                    placeholder="+256700000001&#10;+256700000002"
                    rows={4}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Channel */}
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-base">Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={channels.sms}
                    onCheckedChange={(checked) =>
                      setChannels((prev) => ({ ...prev, sms: !!checked }))
                    }
                  />
                  <span className="text-sm font-medium">SMS</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={channels.in_app}
                    onCheckedChange={(checked) =>
                      setChannels((prev) => ({ ...prev, in_app: !!checked }))
                    }
                  />
                  <span className="text-sm font-medium">In-App Notification</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Message */}
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Type className="w-4 h-4 text-amber-400" />
                Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Variable buttons */}
              <div className="flex flex-wrap gap-2">
                {VARIABLE_TOKENS.map((v) => (
                  <button
                    key={v.token}
                    onClick={() => insertVariable(v.token)}
                    className="px-2.5 py-1 rounded-lg bg-navy-700 text-xs text-amber-400 hover:bg-navy-600 transition-colors border border-navy-600"
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here... Use {student_name}, {balance}, etc. for personalization"
                rows={6}
              />

              <div className="flex items-center justify-between text-xs text-foreground/50">
                <span>
                  {message.length} characters &middot; {smsSegments} SMS
                  {smsSegments !== 1 ? "s" : ""} per recipient
                </span>
                {message.length > MAX_SMS_CHARS && (
                  <span className="text-amber-400">
                    Multi-SMS ({smsSegments} segments)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-4">
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    checked={scheduleType === "now"}
                    onChange={() => setScheduleType("now")}
                    className="accent-amber-400"
                  />
                  <span className="text-sm font-medium">Send Now</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    checked={scheduleType === "later"}
                    onChange={() => setScheduleType("later")}
                    className="accent-amber-400"
                  />
                  <span className="text-sm font-medium">Schedule for Later</span>
                </label>
                {scheduleType === "later" && (
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-56"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* SMS Balance */}
          {channels.sms && smsBalance && (
            <Card className={cn("border bg-surface", hasInsufficientBalance ? "border-rose-500/40" : "border-emerald-500/20")}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", hasInsufficientBalance ? "bg-rose-500/10" : "bg-emerald-500/10")}>
                    <Wallet className={cn("w-5 h-5", hasInsufficientBalance ? "text-rose-400" : "text-emerald-400")} />
                  </div>
                  <div>
                    <p className="text-xs text-foreground/60">SMS Balance</p>
                    <p className={cn("text-lg font-bold", hasInsufficientBalance ? "text-rose-400" : "text-emerald-400")}>
                      {smsBalance.currency} {smsBalance.balance}
                    </p>
                  </div>
                </div>
                {hasInsufficientBalance && (
                  <p className="mt-2 text-xs text-rose-400">
                    Insufficient SMS balance. Top up at africaistalking.com
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cost Estimator */}
          <Card className="border-amber-400/20 bg-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                Cost Estimate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">Recipients</span>
                <span className="font-medium">{recipientCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">SMS per recipient</span>
                <span className="font-medium">{smsSegments}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">Cost per SMS</span>
                <span className="font-medium">UGX {SMS_COST_PER_SEGMENT}</span>
              </div>
              <div className="border-t border-navy-600 pt-3 flex justify-between">
                <span className="font-medium">Estimated Total</span>
                <span className="text-lg font-bold text-amber-400">
                  {formatUGX(estimatedCost)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-base">Quick Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setMessage(t.body)}
                  className="w-full text-left p-3 rounded-lg bg-navy-700/50 hover:bg-navy-700 border border-navy-600 transition-all"
                >
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-foreground/50 truncate mt-1">
                    {t.body.slice(0, 60)}...
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Scheduled History */}
          {scheduledAnnouncements.length > 0 && (
            <Card className="border-border-subtle bg-surface">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Scheduled Messages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {scheduledAnnouncements.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-navy-700/30 border border-navy-600"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.title || "Scheduled SMS"}</p>
                      <p className="text-xs text-foreground/50">
                        {a.scheduled_at ? new Date(a.scheduled_at).toLocaleString() : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        a.scheduled_status === "sent"
                          ? "success"
                          : a.scheduled_status === "failed"
                          ? "destructive"
                          : "warning"
                      }
                    >
                      {a.scheduled_status || "pending"}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Send Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !message.trim() || recipientCount === 0 || hasInsufficientBalance}
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {scheduleType === "now" ? "Send Now" : "Schedule Message"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

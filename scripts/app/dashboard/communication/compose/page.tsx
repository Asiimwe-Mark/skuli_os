"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();

  const [title, setTitle] = useState("");
  const [targetAudience, setTargetAudience] = useState<"all" | "class" | "defaulters" | "custom">("all");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [customPhones, setCustomPhones] = useState("");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState({ sms: true, in_app: false });
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recipientCount, setRecipientCount] = useState(0);
  // Audit 5.14: when target_audience is "all" the API sends to every
  // parent in the school. A misclick here is an expensive, embarrassing
  // blast. Surface a confirm dialog when (a) the audience is "all" or
  // (b) the recipient count crosses 100. The dialog shows the actual
  // recipient count and the estimated UGX cost so the user can sanity
  // check before commit.
  const [showBlastConfirm, setShowBlastConfirm] = useState(false);
  const blastThreshold = 100;
  const isBlast = targetAudience === "all" || recipientCount > blastThreshold;

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
  // AP-1 fix: useQuery replaces useEffect+supabase.from('students')
  const { data: students = [] } = useQuery({
    queryKey: ["students-for-compose"],
    queryFn: async () => {
      const res = await fetch("/api/students", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load students");
      const json = await res.json();
      return json.data?.items ?? json.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

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
      // Cross-page: dashboard "SMS Sent" KPI, logs page, scheduled list,
      // and balance cache all depend on the new sms_logs + announcement rows.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sms-logs"] });
      queryClient.invalidateQueries({ queryKey: ["sms-balance"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
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
        <p className="text-muted text-sm mt-1">
          Send SMS and in-app announcements to parents
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Composer */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title */}
          <Card className="bg-card">
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
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-base">Target Audience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                        ? "border-border bg-warning-50"
                        : "border-border hover:border-border"
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
                            ? "border-warning-500 bg-warning-100 text-warning-700"
                            : "border-border text-text-muted hover:border-border hover:text-text-heading"
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
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-base">Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4 sm:gap-8">
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
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Type className="w-4 h-4 text-text-heading" />
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
                    className="px-2.5 py-1 rounded-lg bg-bg-tertiary text-xs text-text-heading hover:bg-card-hover transition-colors border border-border"
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

              <div className="flex items-center justify-between text-xs text-heading">
                <span>
                  {message.length} characters - {smsSegments} SMS
                  {smsSegments !== 1 ? "s" : ""} per recipient
                </span>
                {message.length > MAX_SMS_CHARS && (
                  <span className="text-warning-700 font-medium">
                    Multi-SMS ({smsSegments} segments)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card className="bg-card">
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
                    className="w-full sm:w-56"
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
            <Card className={cn("border bg-card", hasInsufficientBalance ? "border-danger-500" : "border-success-500")}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", hasInsufficientBalance ? "bg-danger-100 text-danger-700" : "bg-success-100 text-success-700")}>
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">SMS Balance</p>
                    <p className={cn("text-lg font-bold", hasInsufficientBalance ? "text-danger-700" : "text-success-700")}>
                      {smsBalance.currency} {smsBalance.balance}
                    </p>
                  </div>
                </div>
                {hasInsufficientBalance && (
                  <p className="mt-2 text-xs text-danger-700 font-medium">
                    Insufficient SMS balance. Top up at africaistalking.com
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cost Estimator */}
          <Card className="border-warning-500 bg-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-warning-700" />
                Cost Estimate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Recipients</span>
                <span className="font-medium text-text-heading">{recipientCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">SMS per recipient</span>
                <span className="font-medium text-text-heading">{smsSegments}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Cost per SMS</span>
                <span className="font-medium text-text-heading">UGX {SMS_COST_PER_SEGMENT}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="font-medium">Estimated Total</span>
                <span className="text-lg font-bold text-warning-700">
                  {formatUGX(estimatedCost)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-base">Quick Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setMessage(t.body)}
                  className="w-full text-left p-3 rounded-lg bg-bg-tertiary hover:bg-card-hover border border-border transition-all"
                >
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-heading truncate mt-1">
                    {t.body.slice(0, 60)}...
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Scheduled History */}
          {scheduledAnnouncements.length > 0 && (
            <Card className="bg-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-text-heading" />
                  Scheduled Messages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {scheduledAnnouncements.map((a: { id: string; title: string; scheduled_at: string; scheduled_status: string }) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-bg-tertiary border border-border"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.title || "Scheduled SMS"}</p>
                      <p className="text-xs text-heading">
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
            onClick={() => {
              if (isBlast) {
                setShowBlastConfirm(true);
              } else {
                sendMutation.mutate();
              }
            }}
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

      {/* Audit 5.14: blast confirmation. The "All Parents" audience
          and any audience that crosses the recipient threshold need
          an explicit second click to send. */}
      <Dialog open={showBlastConfirm} onOpenChange={setShowBlastConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning-700" />
              Confirm bulk send
            </DialogTitle>
            <DialogDescription>
              {targetAudience === "all"
                ? "You are about to send a message to every parent in the school."
                : `This will send to ${recipientCount.toLocaleString()} recipients, which is more than the ${blastThreshold} recommended for an unsanctioned blast.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Recipients</span>
              <span className="font-medium">{recipientCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">SMS per recipient</span>
              <span className="font-medium">{smsSegments}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Estimated cost</span>
              <span className="font-semibold text-warning-700">{formatUGX(estimatedCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Channel</span>
              <span className="font-medium">
                {[channels.sms && "SMS", channels.in_app && "In-App"].filter(Boolean).join(" + ") || "—"}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBlastConfirm(false)}
              disabled={sendMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowBlastConfirm(false);
                sendMutation.mutate();
              }}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Yes, send to {recipientCount.toLocaleString()} {recipientCount === 1 ? "parent" : "parents"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

"use client";

import { useState, useMemo, useEffect} from "react";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { formatUGX } from "@/lib/utils/currency";
import { getDaysSince } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle,
  Send,
  Download,
  Phone,
  Users,
  TrendingDown,
  Search,
  CheckCircle2,
} from "lucide-react";

interface DefaulterRow {
  id: string;
  student_id: string;
  balance: number;
  total_expected: number;
  total_paid: number;
  student: {
    id: string;
    full_name: string;
    admission_number: string;
    parent_phone: string;
    parent_name: string;
    current_class: { name: string } | null;
  } | null;
  last_payment_date: string | null;
}

export default function DefaultersPage() {
  useDocumentTitle("Defaulters");
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { canSendSMS } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [remindAllOpen, setRemindAllOpen] = useState(false);
  const [remindSelectedOpen, setRemindSelectedOpen] = useState(false);

  // ?"EUR?"EUR Query ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const { data: defaulters = [], isLoading } = useQuery({
    queryKey: ["fee-defaulters", school?.id, currentTerm?.id],
    queryFn: async () => {
      // Load accounts with balance > 0
      const { data: accounts, error } = await supabase
        .from("fee_accounts")
        .select(
          `id, student_id, balance, total_expected, total_paid,
           student:students(id, full_name, admission_number, parent_phone, parent_name, current_class:classes(name))`
        )
        .eq("school_id", school!.id)
        .eq("term_id", currentTerm!.id)
        .gt("balance", 0)
        .eq("is_deleted", false)
        .order("balance", { ascending: false });
      if (error) throw error;
      if (!accounts?.length) return [];

      // Get last payment dates
      const studentIds = accounts.map((a: any) => a.student_id).filter(Boolean);
      const { data: lastPayments } = await supabase
        .from("fee_payments")
        .select("student_id, payment_date")
        .in("student_id", studentIds)
        .eq("is_deleted", false)
        .order("payment_date", { ascending: false });

      const lastPaymentMap = new Map<string, string>();
      if (lastPayments) {
        for (const lp of lastPayments) {
          if (!lastPaymentMap.has(lp.student_id)) {
            lastPaymentMap.set(lp.student_id, lp.payment_date);
          }
        }
      }

      return (accounts as any[]).map((a) => ({
        ...a,
        student: Array.isArray(a.student) ? a.student[0] : a.student,
        last_payment_date: lastPaymentMap.get(a.student_id) || null,
      })) as DefaulterRow[];
    },
    enabled: !!school?.id && !!currentTerm?.id,
  });

  // ?"EUR?"EUR SMS Mutations ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const sendRemindersMutation = useMutation({
    mutationFn: async (targetDefaulters: DefaulterRow[]) => {
      const phones = targetDefaulters
        .map((d) => d.student?.parent_phone)
        .filter(Boolean) as string[];
      if (phones.length === 0) throw new Error("No phone numbers found");

      let sent = 0;
      for (const d of targetDefaulters) {
        if (!d.student?.parent_phone) continue;
        const message = `Dear ${d.student.parent_name}, this is a reminder that ${d.student.full_name} has an outstanding balance of ${formatUGX(d.balance)} for ${currentTerm?.name ?? "the current term"}. Please clear the balance. Thank you, ${school?.name}.`;
        const { error } = await supabase.from("sms_logs").insert({
          school_id: school!.id,
          recipient_phone: d.student.parent_phone,
          message_body: message,
          message_type: "fee_reminder",
          status: "pending",
          africa_talking_message_id: null,
          cost: null,
          sent_at: null,
          related_entity_type: null,
          related_entity_id: null,
        } as any);
        if (!error) sent++;
      }
      return { sent, total: phones.length };
    },
    onSuccess: (result) => {
      toast({
        title: "Reminders sent",
        description: `${result.sent} SMS reminders sent to parents.`,
      });
      setRemindAllOpen(false);
      setRemindSelectedOpen(false);
      setSelectedIds(new Set());
      // Cross-page: dashboard "SMS Sent" KPI + sms-balance + sms logs.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sms-logs"] });
      queryClient.invalidateQueries({ queryKey: ["sms-balance"] });
    },
    onError: (err) => {
      toast({
        title: "Error sending reminders",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // ?"EUR?"EUR Filtering ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const filtered = useMemo(() => {
    if (!search) return defaulters;
    const q = search.toLowerCase();
    return defaulters.filter(
      (d) =>
        d.student?.full_name?.toLowerCase().includes(q) ||
        d.student?.admission_number?.toLowerCase().includes(q)
    );
  }, [defaulters, search]);

  // ?"EUR?"EUR Summary ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const summary = useMemo(() => {
    const totalOutstanding = defaulters.reduce((s, d) => s + d.balance, 0);
    const count = defaulters.length;
    const avgBalance = count > 0 ? Math.round(totalOutstanding / count) : 0;
    return { totalOutstanding, count, avgBalance };
  }, [defaulters]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((d) => d.id)));
    }
  }

  function handleExportCSV() {
    const headers = ["Student", "Admission No", "Class", "Parent Phone", "Balance (UGX)", "Days Since Last Payment"];
    const rows = filtered.map((d) => [
      d.student?.full_name || "",
      d.student?.admission_number || "",
      d.student?.current_class?.name || "",
      d.student?.parent_phone || "",
      String(d.balance),
      d.last_payment_date ? String(getDaysSince(d.last_payment_date)) : "Never",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `defaulters-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ?"EUR?"EUR Render ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Defaulters</h1>
          <p className="text-sm text-disabled">
            Students with outstanding fee balances
          </p>
        </div>
        <div className="flex gap-2">
          {canSendSMS && selectedIds.size > 0 && (
            <Button variant="outline" onClick={() => setRemindSelectedOpen(true)}>
              <Send className="w-4 h-4 mr-2" />
              Remind Selected ({selectedIds.size})
            </Button>
          )}
          {canSendSMS && defaulters.length > 0 && (
            <Button variant="outline" onClick={() => setRemindAllOpen(true)}>
              <Send className="w-4 h-4 mr-2" />
              Remind All ({defaulters.length})
            </Button>
          )}
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <div className="bg-bg-tertiary border border-border rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-disabled">Total Outstanding</p>
                <p className="text-xl font-bold text-danger-700">
                  {formatUGX(summary.totalOutstanding)}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-danger-50">
                <AlertTriangle className="w-5 h-5 text-danger-600" />
              </div>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="bg-bg-tertiary border border-border rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-disabled">Number of Defaulters</p>
                <p className="text-xl font-bold text-warning-700">{summary.count}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-warning-50">
                <Users className="w-5 h-5 text-warning-700" />
              </div>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="bg-bg-tertiary border border-border rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-disabled">Average Balance</p>
                <p className="text-xl font-bold text-text-heading">
                  {formatUGX(summary.avgBalance)}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-bg-tertiary">
                <TrendingDown className="w-5 h-5 text-text-muted" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <Input
          placeholder="Search by name or admission no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="bg-bg-tertiary border border-border rounded-xl overflow-hidden table-mobile-cards">
        {filtered.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No defaulters found"
            description="All students have cleared their fees."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {canSendSMS && (
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={
                          selectedIds.size === filtered.length &&
                          filtered.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase">
                    Student
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase">
                    Class
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase">
                    Parent Phone
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase">
                    Balance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase">
                    Days Since Payment
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((defaulter, i) => {
                  const daysSince = defaulter.last_payment_date
                    ? getDaysSince(defaulter.last_payment_date)
                    : null;

                  return (
                    <motion.tr
                      key={defaulter.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-border hover:bg-card-hover transition-colors"
                    >
                      {canSendSMS && (
                        <td className="px-4 py-3" data-label="Select">
                          <Checkbox
                            checked={selectedIds.has(defaulter.id)}
                            onCheckedChange={() => toggleSelect(defaulter.id)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3" data-label="Student">
                        <p className="text-sm font-medium">
                          {defaulter.student?.full_name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted font-mono">
                          {defaulter.student?.admission_number}
                        </p>
                      </td>
                      <td className="px-4 py-3" data-label="Class">
                        <Badge variant="secondary">
                          {defaulter.student?.current_class?.name || "\u2014"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3" data-label="Parent Phone">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Phone className="w-3 h-3 text-muted" />
                          <span className="font-mono text-muted">
                            {defaulter.student?.parent_phone || "\u2014"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right" data-label="Balance">
                        <span className="text-sm font-bold text-danger-700">
                          {formatUGX(defaulter.balance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" data-label="Days Since Payment">
                        {daysSince !== null ? (
                          <Badge
                            variant={
                              daysSince > 60
                                ? "destructive"
                                : daysSince > 30
                                ? "warning"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {daysSince} day{daysSince !== 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Never
                          </Badge>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted">
            Showing {filtered.length} of {defaulters.length} defaulters
          </p>
        </div>
      </div>

      {/* Remind Selected Dialog */}
      <AlertDialog
        open={remindSelectedOpen}
        onOpenChange={setRemindSelectedOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Reminders to Selected</AlertDialogTitle>
            <AlertDialogDescription>
              Send SMS reminders to parents of{" "}
              <strong>{selectedIds.size} selected students</strong>. Estimated
              cost: {formatUGX(selectedIds.size * 50)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRemindSelectedOpen(false)}
              disabled={sendRemindersMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                sendRemindersMutation.mutate(
                  defaulters.filter((d) => selectedIds.has(d.id))
                )
              }
              loading={sendRemindersMutation.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              Send Reminders
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remind All Dialog */}
      <AlertDialog open={remindAllOpen} onOpenChange={setRemindAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send Reminders to All Defaulters
            </AlertDialogTitle>
            <AlertDialogDescription>
              Send SMS reminders to parents of{" "}
              <strong>all {defaulters.length} defaulting students</strong>.
              Estimated cost: {formatUGX(defaulters.length * 50)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRemindAllOpen(false)}
              disabled={sendRemindersMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => sendRemindersMutation.mutate(defaulters)}
              loading={sendRemindersMutation.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              Send to All
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

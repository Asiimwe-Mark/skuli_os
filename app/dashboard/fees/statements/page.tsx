"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, FileText, Printer, Send, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StatementEntry {
  id: string;
  term_name: string;
  academic_year: string;
  fee_items: { name: string; amount: number }[];
  total_expected: number;
  payments: { date: string; amount: number; method: string; receipt: string }[];
  total_paid: number;
  balance: number;
}

interface StudentWithFeeAccounts {
  id: string;
  full_name: string;
  admission_number: string;
  current_class_id: string | null;
  parent_name: string;
  parent_phone: string;
  class?: { name: string } | null;
  fee_accounts?: unknown[];
}

export default function FeeStatementsPage() {
  const supabase = useSupabaseBrowser();
  const school = useSchoolStore((s) => s.school);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);

  // Fetch students with fee accounts
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["fee-statements-students", school?.id],
    queryFn: async () => {
      if (!school?.id) return [];
      const { data } = await supabase
        .from("students")
        .select(`
          id, full_name, admission_number, current_class_id, parent_name, parent_phone,
          class:classes(name),
          fee_accounts(
            id, term_id, total_expected, total_paid, balance, status,
            term:terms(name, academic_year_id, academic_years(name))
          )
        `)
        .eq("school_id", school.id)
        .eq("is_deleted", false)
        .order("full_name");
      return (data || []) as StudentWithFeeAccounts[];
    },
    enabled: !!school?.id,
  });

  // Fetch full statement for selected student
  const { data: statement = [], isLoading: statementLoading } = useQuery<StatementEntry[]>({
    queryKey: ["fee-statement", selectedStudent],
    queryFn: async () => {
      if (!selectedStudent || !school?.id) return [];

      // Get all fee accounts for this student
      const { data: accounts } = await supabase
        .from("fee_accounts")
        .select(`
          id, term_id, total_expected, total_paid, balance, status,
          term:terms(name, academic_year_id, academic_years(name))
        `)
        .eq("student_id", selectedStudent)
        .eq("school_id", school.id)
        .eq("is_deleted", false)
        .order("created_at");

      if (!accounts || accounts.length === 0) return [];

      // ?"EUR?"EUR Batch the two dependent reads instead of looping per account ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
      // (was 2 serial queries per account - an N+1 pattern). Fetch all fee
      // structures for the involved terms and all payments for the involved
      // accounts in ONE query each, in parallel, then group in memory.
      const termIds = Array.from(new Set(accounts.map((a) => a.term_id).filter(Boolean)));
      const accountIds = accounts.map((a) => a.id);

      const [structuresRes, paymentsRes] = await Promise.all([
        termIds.length > 0
          ? supabase
              .from("fee_structures")
              .select("term_id, name, amount")
              .in("term_id", termIds)
              .eq("school_id", school.id)
              .eq("is_deleted", false)
          : Promise.resolve({ data: [] }),
        accountIds.length > 0
          ? supabase
              .from("fee_payments")
              .select("fee_account_id, payment_date, amount, payment_method, receipt_number")
              .in("fee_account_id", accountIds)
              .eq("is_deleted", false)
              .order("payment_date")
          : Promise.resolve({ data: [] }),
      ]);

      // Group structures by term_id and payments by fee_account_id.
      const structuresByTerm = new Map<string, { name: string; amount: number }[]>();
      for (const s of (structuresRes.data || []) as Array<{ term_id: string; name: string; amount: number }>) {
        const list = structuresByTerm.get(s.term_id) ?? [];
        list.push({ name: s.name, amount: s.amount });
        structuresByTerm.set(s.term_id, list);
      }

      const paymentsByAccount = new Map<string, StatementEntry["payments"]>();
      for (const p of (paymentsRes.data || []) as Array<{
        fee_account_id: string;
        payment_date: string;
        amount: number;
        payment_method: string;
        receipt_number: string;
      }>) {
        const list = paymentsByAccount.get(p.fee_account_id) ?? [];
        list.push({
          date: p.payment_date,
          amount: p.amount,
          method: p.payment_method,
          receipt: p.receipt_number,
        });
        paymentsByAccount.set(p.fee_account_id, list);
      }

      return accounts.map((account) => {
        const term = account.term as unknown as {
          name: string;
          academic_years: { name: string };
        } | null;
        return {
          id: account.id,
          term_name: term?.name || "Unknown Term",
          academic_year: term?.academic_years?.name || "Unknown",
          fee_items: structuresByTerm.get(account.term_id) || [],
          total_expected: account.total_expected,
          payments: paymentsByAccount.get(account.id) || [],
          total_paid: account.total_paid,
          balance: account.balance,
        } as StatementEntry;
      });
    },
    enabled: !!selectedStudent && !!school?.id,
  });

  const filteredStudents = students.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.admission_number?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedStudentData = students.find((s) => s.id === selectedStudent);

  async function shareStatementViaSMS() {
    if (!selectedStudentData || !school) return;
    setSendingSms(true);
    try {
      const parentPhone = selectedStudentData.parent_phone;
      if (!parentPhone) {
        toast({ title: "No parent phone number", description: "This student has no parent phone on file.", variant: "destructive" });
        return;
      }
      const statementUrl = `${window.location.origin}/dashboard/fees/statements?student=${selectedStudent}`;
      const parentName = selectedStudentData.parent_name || "Parent";
      const studentName = selectedStudentData.full_name;
      const message = `Dear ${parentName}, ${studentName}'s fee statement is ready. View at: ${statementUrl} - ${school.name}`;
      const response = await fetch("/api/communication/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, channel: "sms", target_type: "custom", custom_phones: [parentPhone] }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to send SMS");
      }
      toast({ title: "SMS Sent", description: `Fee statement shared with ${parentName} via SMS.`, variant: "success" });
    } catch (err) {
      toast({ title: "SMS Failed", description: err instanceof Error ? err.message : "Failed to send SMS", variant: "destructive" });
    } finally {
      setSendingSms(false);
    }
  }

  function getStudentTotals(s: any) {
    const accounts = (s.fee_accounts as Array<Record<string, number>>) || [];
    return {
      expected: accounts.reduce((sum, a) => sum + (a.total_expected || 0), 0),
      paid: accounts.reduce((sum, a) => sum + (a.total_paid || 0), 0),
      balance: accounts.reduce((sum, a) => sum + (a.balance || 0), 0),
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Fee Statements</h1>
          <p className="text-sm text-muted mt-1">
            Generate and view detailed fee statements per student
          </p>
        </div>
      </div>

      <Card className="border-border bg-bg-tertiary">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input
              placeholder="Search by name or admission number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-bg-tertiary border-border text-heading"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg bg-bg-tertiary" />
          ))}
        </div>
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No students found"
          description="No students match your search criteria."
        />
      ) : (
        <Card className="border-border bg-bg-tertiary">
          <CardContent className="p-0 table-mobile-cards">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adm No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Total Expected</TableHead>
                  <TableHead>Total Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((s) => {
                  const totals = getStudentTotals(s);
                  return (
                    <TableRow key={s.id as string}>
                      <TableCell className="font-mono text-sm" data-label="Adm No.">{s.admission_number as string}</TableCell>
                      <TableCell data-label="Student Name">{s.full_name as string}</TableCell>
                      <TableCell data-label="Class">{(s.class as Record<string, string>)?.name || "-"}</TableCell>
                      <TableCell data-label="Total Expected">{formatUGX(totals.expected)}</TableCell>
                      <TableCell className="text-success-700" data-label="Total Paid">{formatUGX(totals.paid)}</TableCell>
                      <TableCell className={totals.balance > 0 ? "text-danger-700" : "text-text-heading"} data-label="Balance">
                        {formatUGX(totals.balance)}
                      </TableCell>
                      <TableCell data-label="Actions">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedStudent(s.id as string);
                            setStatementOpen(true);
                          }}
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Statement
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Statement Dialog */}
      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-bg-tertiary border-border">
          <DialogHeader>
            <DialogTitle className="text-heading flex items-center justify-between">
              <span>Fee Statement - {selectedStudentData?.full_name}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </Button>
                <Button size="sm" variant="outline" onClick={shareStatementViaSMS} disabled={sendingSms}>
                  {sendingSms ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-1" />
                  )}
                  Share via SMS
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {statementLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg bg-bg-tertiary" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Student Info */}
              <Card className="border-border bg-bg-tertiary">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted">Student</p>
                      <p className="text-heading font-medium">
                        {selectedStudentData?.full_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Admission No.</p>
                      <p className="text-heading font-mono">
                        {selectedStudentData?.admission_number}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Class</p>
                      <p className="text-heading">
                        {selectedStudentData?.class?.name || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Generated</p>
                      <p className="text-heading">{formatDate(new Date().toISOString())}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Statement per term */}
              {statement.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No fee records"
                  description="This student has no fee accounts yet."
                />
              ) : (
                statement.map((entry) => (
                  <Card key={entry.id} className="border-border bg-bg-tertiary">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-heading flex items-center justify-between">
                        <span>
                          {entry.term_name} - {entry.academic_year}
                        </span>
                        <Badge
                          variant={
                            entry.balance === 0
                              ? "default"
                              : entry.balance < 0
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {entry.balance === 0
                            ? "PAID"
                            : entry.balance < 0
                            ? "OVERPAID"
                            : "BALANCE DUE"}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Fee Items */}
                      <div>
                        <h4 className="text-sm font-medium text-heading mb-2">
                          Fee Items
                        </h4>
                        <div className="space-y-1">
                          {entry.fee_items.map((item, i) => (
                            <div
                              key={i}
                              className="flex justify-between text-sm text-muted"
                            >
                              <span>{item.name}</span>
                              <span>{formatUGX(item.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm font-medium text-heading border-t border-border pt-1">
                            <span>Total Expected</span>
                            <span>{formatUGX(entry.total_expected)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Payments */}
                      <div>
                        <h4 className="text-sm font-medium text-heading mb-2">
                          Payments ({entry.payments.length})
                        </h4>
                        {entry.payments.length === 0 ? (
                          <p className="text-sm text-muted">No payments recorded</p>
                        ) : (
                          <div className="space-y-1">
                            {entry.payments.map((p, i) => (
                              <div
                                key={i}
                                className="flex justify-between text-sm text-muted"
                              >
                                <span>
                                  {formatDate(p.date)} - {p.method} - {p.receipt}
                                </span>
                                <span className="text-success-700">
                                  {formatUGX(p.amount)}
                                </span>
                              </div>
                            ))}
                            <div className="flex justify-between text-sm font-medium text-heading border-t border-border pt-1">
                              <span>Total Paid</span>
                              <span className="text-success-700">
                                {formatUGX(entry.total_paid)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Balance */}
                      <div className="flex justify-between items-center p-3 rounded-lg bg-bg-tertiary">
                        <span className="font-medium text-heading">Balance</span>
                        <span
                          className={`text-lg font-bold ${ entry.balance > 0 ? "text-danger-700" : entry.balance < 0 ? "text-warning-700" : "text-text-heading" }`}
                        >
                          {formatUGX(Math.abs(entry.balance))}
                          {entry.balance < 0 && " (credit)"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              {/* Grand Total */}
              {statement.length > 0 && (
                <Card className="border-warning-100 bg-warning-50">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-heading">
                        Grand Total Balance
                      </span>
                      <span
                        className={`text-2xl font-bold ${ statement.reduce((sum, e) => sum + e.balance, 0) > 0 ? "text-danger-700" : "text-text-heading" }`}
                      >
                        {formatUGX(
                          Math.abs(statement.reduce((sum, e) => sum + e.balance, 0))
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

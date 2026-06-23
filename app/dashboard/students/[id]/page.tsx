"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import { formatUGX } from "@/lib/utils/currency";
import {
  normalizePhone,
  isValidUgandaPhone,
  formatPhoneDisplay,
} from "@/lib/utils/phone";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Phone,
  Mail,
  User,
  CreditCard,
  BookOpen,
  CalendarCheck,
  Edit2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Download,
  PhoneCall,
  TrendingUp,
  Clock,
  Wallet,
  Send,
  ShieldAlert,
  FileText,
  MessageSquare,
} from "lucide-react";
import type {
  Student,
  Class,
  FeeAccount,
  FeePayment,
  Mark,
  AttendanceRecord,
  AttendanceStatus,
  Term,
  AcademicYear,
  Subject,
  PaymentMethod,
} from "@/types";
import type { Tables } from "@/types/database";
import { DisciplineTab } from "./discipline-tab";
import { ApplyDiscountDialog } from "@/components/fees/apply-discount-dialog";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

function AttendanceCalendar({
  attendance,
}: {
  attendance: AttendanceRecord[];
}) {
  // Build map: date string -> status
  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    for (const record of attendance) {
      map.set(record.date, record.status);
    }
    return map;
  }, [attendance]);

  // Determine date range from attendance records
  const dateRange = useMemo(() => {
    if (attendance.length === 0) {
      const now = new Date();
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    }
    const dates = attendance.map((r) => new Date(r.date));
    const from = new Date(Math.min(...dates.map((d) => d.getTime())));
    const to = new Date(Math.max(...dates.map((d) => d.getTime())));
    return { from, to };
  }, [attendance]);

  function getDayClass(date: Date): string {
    const dateStr = date.toISOString().split("T")[0];
    const status = attendanceMap.get(dateStr);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (status === "present") return "bg-bg-tertiary text-white";
    if (status === "absent") return "bg-bg-tertiary text-white";
    if (status === "late") return "bg-bg-tertiary text-heading";
    if (status === "excused") return "bg-bg-tertiary text-white";
    if (isWeekend) return "bg-bg-tertiary text-heading";
    return "bg-bg-tertiary text-heading";
  }

  return (
    <div className="flex justify-center">
      <style>{`.rdp { --rdp-cell-size: 40px; margin: 0; } .rdp-caption_label { font-size: 14px; font-weight: 600; color: var(--foreground); } .rdp-nav_button { color: var(--foreground); } .rdp-day { border-radius: 6px; font-size: 12px; font-weight: 500; } .rdp-day_selected { background-color: transparent !important; color: inherit !important; } .rdp-day:hover { opacity: 0.8; }`}</style>
      <DayPicker
        mode="single"
        defaultMonth={dateRange.from}
        fromMonth={dateRange.from}
        toMonth={dateRange.to}
        modifiers={{
          attended: (date) => {
            const dateStr = date.toISOString().split("T")[0];
            return attendanceMap.get(dateStr) === "present";
          },
          absent: (date) => {
            const dateStr = date.toISOString().split("T")[0];
            return attendanceMap.get(dateStr) === "absent";
          },
          late: (date) => {
            const dateStr = date.toISOString().split("T")[0];
            return attendanceMap.get(dateStr) === "late";
          },
          excused: (date) => {
            const dateStr = date.toISOString().split("T")[0];
            return attendanceMap.get(dateStr) === "excused";
          },
        }}
        components={{
          Day: ({ date }) => {
            return (
              <div
                className={cn(
                  "rdp-day flex items-center justify-center",
                  getDayClass(date),
                )}
                style={{ width: 40, height: 40 }}
              >
                {date.getDate()}
              </div>
            );
          },
        }}
      />
    </div>
  );
}

export default function StudentProfilePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const studentId = params.id as string;
  const initialTab = searchParams.get("tab") || "overview";

  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const currentAcademicYear = useSchoolStore((s) => s.currentAcademicYear);
  const schoolId = school?.id;
  const { canEditStudents, canViewFees, canRecordPayments } = usePermissions();
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [feeAccount, setFeeAccount] = useState<FeeAccount | null>(null);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [marks, setMarks] = useState<(Mark & { subject?: Subject })[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [terms, setTerms] = useState<
    (Term & { academic_years?: AcademicYear })[]
  >([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");

  // Payment modal
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [sharingReportCard, setSharingReportCard] = useState(false);
  const [downloadingCert, setDownloadingCert] = useState(false);

  // Discount dialog
  const [discountOpen, setDiscountOpen] = useState(false);
  const [studentDiscounts, setStudentDiscounts] = useState<
    (Tables<"student_discounts"> & {
      discount: Tables<"fee_discounts"> | null;
    })[]
  >([]);

  // Edit form
  const [editForm, setEditForm] = useState({
    full_name: "",
    date_of_birth: "",
    gender: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    current_class_id: "",
    status: "",
    exit_date: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function loadStudent() {
    if (!school) return;

    const { data, error } = await supabase
      .from("students")
      .select("*, current_class:classes(*)")
      .eq("id", studentId)
      .single();

    if (error || !data) {
      toast({
        title: "Error",
        description: "Student not found.",
        variant: "destructive",
      });
      router.push("/dashboard/students");
      return;
    }

    setStudent(data as Student);
    setEditForm({
      full_name: data.full_name,
      date_of_birth: data.date_of_birth || "",
      gender: data.gender || "",
      parent_name: data.parent_name || "",
      parent_phone: data.parent_phone || "",
      parent_email: data.parent_email || "",
      current_class_id: data.current_class_id || "",
      status: data.status,
      exit_date: data.exit_date || "",
    });
    setLoading(false);
  }

  async function loadClasses() {
    if (!school) return;
    const { data } = await supabase
      .from("classes")
      .select("id, name, level, stream, capacity, class_teacher_id")
      .eq("school_id", school.id)
      .eq("is_deleted", false)
      .order("name");

    if (data) setClasses(data as Class[]);
  }

  async function loadTerms() {
    if (!school) return;
    const { data } = await supabase
      .from("terms")
      .select(
        "id, name, start_date, end_date, is_current, school_id, academic_year_id, academic_years(id, name)",
      )
      .eq("school_id", school.id)
      .order("start_date", { ascending: false });

    if (data) {
      const list = data as (Term & { academic_years?: AcademicYear })[];
      setTerms(list);
      // Default to current term
      const current = list.find((t) => t.is_current);
      if (current) setSelectedTermId(current.id);
      else if (list.length > 0) setSelectedTermId(list[0].id);
    }
  }

  async function loadFeeData() {
    if (!school || !selectedTermId) return;

    const { data: account } = await supabase
      .from("fee_accounts")
      .select(
        "id, student_id, term_id, total_expected, total_paid, balance, status, created_at",
      )
      .eq("student_id", studentId)
      .eq("term_id", selectedTermId)
      .single();

    setFeeAccount((account || null) as FeeAccount | null);

    if (account) {
      const { data: paymentData } = await supabase
        .from("fee_payments")
        .select(
          "id, fee_account_id, amount, payment_date, payment_method, receipt_number, notes, created_at",
        )
        .eq("fee_account_id", account.id)
        .order("payment_date", { ascending: false });

      setPayments((paymentData || []) as FeePayment[]);
    } else {
      setPayments([]);
    }

    // Fetch student discounts
    const { data: discountsData } = await supabase
      .from("student_discounts")
      .select(
        `
        *,
        discount:fee_discounts(*)
      `,
      )
      .eq("student_id", studentId)
      .eq("is_deleted", false)
      .or(`term_id.eq.${selectedTermId},term_id.is.null`);
    setStudentDiscounts(discountsData || []);
  }

  async function loadMarks() {
    if (!school || !selectedTermId) return;

    const { data } = await supabase
      .from("marks")
      .select("*, subject:subjects(*)")
      .eq("student_id", studentId)
      .eq("term_id", selectedTermId)
      .order("created_at");

    setMarks(data || []);
  }

  async function loadAttendance() {
    if (!school) return;

    let query = supabase
      .from("attendance_records")
      .select("id, student_id, class_id, date, status, notes, created_at")
      .eq("student_id", studentId);

    // Use current term dates if available, otherwise last 90 days
    if (currentTerm) {
      query = query
        .gte("date", currentTerm.start_date)
        .lte("date", currentTerm.end_date);
    } else {
      query = query.gte(
        "date",
        new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
      );
    }

    const { data } = await query.order("date", { ascending: false });
    setAttendance((data || []) as AttendanceRecord[]);
  }

  useEffect(() => {
    loadStudent();
    loadClasses();
    loadTerms();
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, school]);

  useEffect(() => {
    if (selectedTermId) {
      loadFeeData();
      loadMarks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTermId]);

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function getGrade(score: number, maxScore: number): string {
    const pct = (score / maxScore) * 100;
    if (pct >= 80) return "D1";
    if (pct >= 70) return "D2";
    if (pct >= 65) return "C3";
    if (pct >= 60) return "C4";
    if (pct >= 55) return "C5";
    if (pct >= 50) return "C6";
    if (pct >= 45) return "P7";
    if (pct >= 40) return "P8";
    return "F9";
  }

  function getAttendanceStats() {
    const total = attendance.length;
    const present = attendance.filter((r) => r.status === "present").length;
    const absent = attendance.filter((r) => r.status === "absent").length;
    const late = attendance.filter((r) => r.status === "late").length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, pct };
  }

  async function shareReportCardViaSMS() {
    if (!student || !school) return;
    setSharingReportCard(true);

    try {
      if (!student.parent_phone) {
        toast({
          title: "No parent phone",
          description: "This student has no parent phone on file.",
          variant: "destructive",
        });
        return;
      }

      const reportUrl = `${window.location.origin}/dashboard/students/${studentId}?tab=academic`;
      const parentName = student.parent_name || "Parent";
      const message = `Dear ${parentName}, ${student.full_name}'s report card is ready. View at: ${reportUrl} - ${school.name}`;

      const response = await fetch("/api/communication/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          channel: "sms",
          target_type: "custom",
          custom_phones: [student.parent_phone],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to send SMS");
      }

      toast({
        title: "SMS Sent",
        description: `Report card link shared with ${parentName}.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "SMS Failed",
        description: err instanceof Error ? err.message : "Failed to send SMS",
        variant: "destructive",
      });
    } finally {
      setSharingReportCard(false);
    }
  }

  async function handleRecordPayment() {
    if (!feeAccount || !paymentAmount) return;
    setSavingPayment(true);

    try {
      const amount = parseFloat(paymentAmount);
      if (isNaN(amount) || amount <= 0)
        throw new Error("Enter a valid amount.");

      const receiptNum = `RCP-${Date.now().toString(36).toUpperCase()}`;

      const { error: payError } = await supabase.from("fee_payments").insert({
        school_id: school!.id,
        fee_account_id: feeAccount.id,
        student_id: studentId,
        amount,
        payment_method: paymentMethod as PaymentMethod,
        payment_date: new Date().toISOString().split("T")[0],
        receipt_number: receiptNum,
        notes: paymentNotes || null,
      });

      if (payError) throw payError;

      // §4.2: do NOT recompute balance / status client-side. The
      // AFTER INSERT trigger on fee_payments (trg_fee_payment_recalc)
      // calls recalculate_fee_account(), which is the single source
      // of truth for total_expected (gross − discount), total_paid,
      // balance, and status. Doing it twice here would risk a
      // mismatch if the JS path skipped a discount or used a stale
      // fee_account row. We just refresh the local state below.

      toast({
        title: "Payment Recorded",
        description: `${formatUGX(amount)} recorded. Receipt: ${receiptNum}`,
        variant: "success",
      });

      setPaymentOpen(false);
      setPaymentAmount("");
      setPaymentNotes("");
      loadFeeData();
      // Cross-page: payment now appears in the receipts list, defaulters,
      // statements, the dashboard KPI, and the student's own profile.
      queryClient.invalidateQueries({ queryKey: ["fee-payments"] });
      queryClient.invalidateQueries({ queryKey: ["fee-payments-all"] });
      queryClient.invalidateQueries({ queryKey: ["fee-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["fee-defaulters"] });
      queryClient.invalidateQueries({ queryKey: ["fee-statements-students"] });
      queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["fee-accounts-for-payment"] });
      queryClient.invalidateQueries({ queryKey: ["fees-index"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sms-logs"] });
      queryClient.invalidateQueries({ queryKey: ["sms-balance"] });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to record payment.",
        variant: "destructive",
      });
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleSaveEdit() {
    if (!student) return;
    setSavingEdit(true);

    try {
      if (!editForm.full_name.trim()) throw new Error("Name is required.");
      if (editForm.parent_phone && !isValidUgandaPhone(editForm.parent_phone)) {
        throw new Error("Invalid Uganda phone number.");
      }

      const res = await fetch(`/api/students/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editForm.full_name.trim(),
          date_of_birth: editForm.date_of_birth || undefined,
          gender: editForm.gender || undefined,
          parent_name: editForm.parent_name.trim(),
          parent_phone: normalizePhone(editForm.parent_phone),
          parent_email: editForm.parent_email.trim() || undefined,
          current_class_id: editForm.current_class_id || undefined,
          status: editForm.status,
          exit_date:
            editForm.status === "left" || editForm.status === "graduated"
              ? editForm.exit_date || null
              : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update student");

      toast({
        title: "Updated",
        description: "Student information has been updated.",
        variant: "success",
      });

      loadStudent();
      // Cross-page: class roster, students directory, dashboard, marks,
      // attendance, and fee accounts all depend on the student row.
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["classes-with-meta"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["fee-defaulters"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-students"] });
      queryClient.invalidateQueries({ queryKey: ["marks-sheet"] });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to update student.",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/students/${studentId}`, { method: "DELETE" });
    const result = await res.json();

    if (!res.ok) {
      toast({
        title: "Error",
        description: "Failed to delete student.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Deleted",
        description: "Student has been removed.",
        variant: "success",
      });
      // Cross-page: students directory, classes roster, dashboard KPIs,
      // defaulters, and the fee accounts list all change on delete.
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["classes-with-meta"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["fee-defaulters"] });
      queryClient.invalidateQueries({ queryKey: ["fees-index"] });
      router.push("/dashboard/students");
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!student) return null;

  const attStats = getAttendanceStats();
  const selectedTerm = terms.find((t) => t.id === selectedTermId);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <motion.div {...fadeInUp}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/students")}
          className="mb-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Students
        </Button>
      </motion.div>

      {/* Student Header Card */}
      <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
        <Card className="bg-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {/* Photo / Avatar */}
              {student.photo_url ? (
                <img
                  src={student.photo_url}
                  alt={student.full_name}
                  className="w-20 h-20 rounded-xl object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-warning-100 flex items-center justify-center text-warning-700 text-2xl font-bold">
                  {getInitials(student.full_name)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                  <h1 className="text-2xl font-bold">{student.full_name}</h1>
                  <Badge
                    variant={
                      student.status === "active"
                        ? "success"
                        : student.status === "graduated"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {student.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-heading">
                  <span className="font-mono text-secondary">
                    {student.admission_number}
                  </span>
                  <span>{student.current_class?.name || "No class"}</span>
                  <span>Enrolled {formatDate(student.enrollment_date)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}
      <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList className="w-full flex overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="fees">Fees</TabsTrigger>
            <TabsTrigger value="academic">Academic</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="discipline">Discipline</TabsTrigger>
            {canEditStudents && <TabsTrigger value="edit">Edit</TabsTrigger>}
          </TabsList>

          {/* ===== TAB: OVERVIEW ===== */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Quick Stats */}
              <div className="space-y-4">
                <Card className="bg-card">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-warning-100 flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-warning-700" />
                      </div>
                      <div>
                        <p className="text-xs text-heading">Current Balance</p>
                        <p className="text-lg font-bold">
                          {feeAccount ? formatUGX(feeAccount.balance) : "---"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-success-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-success-700" />
                      </div>
                      <div>
                        <p className="text-xs text-heading">Last Payment</p>
                        <p className="text-lg font-bold">
                          {payments.length > 0
                            ? formatUGX(payments[0].amount)
                            : "---"}
                        </p>
                        {payments.length > 0 && (
                          <p className="text-xs text-heading">
                            {formatDate(payments[0].payment_date)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-info-100 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-info-700" />
                      </div>
                      <div>
                        <p className="text-xs text-heading">Attendance Rate</p>
                        <p className="text-lg font-bold">{attStats.pct}%</p>
                        <p className="text-xs text-heading">Last 90 days</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Parent Contact */}
              <div className="lg:col-span-2">
                <Card className="bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Parent / Guardian Contact
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                          <User className="w-5 h-5 text-brand-700" />
                        </div>
                        <div>
                          <p className="font-medium">{student.parent_name}</p>
                          <p className="text-sm text-heading">
                            {student.parent_email || "No email"}
                          </p>
                        </div>
                      </div>

                      <Separator />

                      <div className="flex flex-wrap gap-3">
                        <a
                          href={`tel:${student.parent_phone}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success-100 text-success-700 hover:bg-card-hover transition-colors text-sm font-medium"
                        >
                          <PhoneCall className="w-4 h-4" />
                          {formatPhoneDisplay(student.parent_phone)}
                        </a>
                        {student.parent_email && (
                          <a
                            href={`mailto:${student.parent_email}`}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary text-heading hover:bg-card-hover transition-colors text-sm font-medium"
                          >
                            <Mail className="w-4 h-4" />
                            Send Email
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ===== TAB: FEES ===== */}
          <TabsContent value="fees">
            {/* Term Selector */}
            <div className="flex items-center gap-3 mb-6">
              <Label>Term:</Label>
              <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{" "}
                      {t.academic_years ? `(${t.academic_years.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fee Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-heading mb-1">Expected</p>
                  <p className="text-xl font-bold">
                    {feeAccount ? formatUGX(feeAccount.total_expected) : "---"}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-heading mb-1">Paid</p>
                  <p className="text-xl font-bold text-secondary">
                    {feeAccount ? formatUGX(feeAccount.total_paid) : "---"}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-heading mb-1">Balance</p>
                  <p
                    className={cn(
                      "text-xl font-bold",
                      feeAccount && feeAccount.balance > 0
                        ? "text-secondary"
                        : "text-secondary",
                    )}
                  >
                    {feeAccount ? formatUGX(feeAccount.balance) : "---"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mb-6">
              {canRecordPayments && feeAccount && feeAccount.balance > 0 && (
                <Button onClick={() => setPaymentOpen(true)}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Record Payment
                </Button>
              )}
              {canRecordPayments && (
                <Button variant="outline" onClick={() => setDiscountOpen(true)}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Apply Discount
                </Button>
              )}
              <Button
                variant="outline"
                onClick={async () => {
                  if (!feeAccount || !school) return;
                  try {
                    const res = await fetch("/api/fees/statements", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        student_id: studentId,
                        term_id: selectedTermId,
                      }),
                    });
                    if (!res.ok)
                      throw new Error("Failed to generate statement");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `fee-statement-${student.admission_number}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    toast({
                      title: "Error",
                      description: "Failed to generate statement.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Generate Statement
              </Button>
            </div>

            {/* Discounts section */}
            {studentDiscounts.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-muted mb-2">
                  Applied Discounts
                </h4>
                <div className="space-y-2">
                  {studentDiscounts.map((sd) => (
                    <div
                      key={sd.id}
                      className="flex items-center justify-between bg-bg-tertiary rounded-lg px-4 py-2"
                    >
                      <div>
                        <span className="font-medium">{sd.discount?.name}</span>
                        <span className="text-muted ml-2 text-sm">
                          {sd.discount?.discount_type === "percentage"
                            ? `${sd.discount.value}%`
                            : `UGX ${sd.discount?.value?.toLocaleString()}`}
                        </span>
                        {sd.term_id && (
                          <span className="text-muted ml-2 text-sm">
                            --{" "}
                            {terms?.find((t) => t.id === sd.term_id)?.name ||
                              "Specific Term"}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-600 hover:text-danger-600"
                        onClick={async () => {
                          await fetch(
                            `/api/fees/student-discounts?id=${sd.id}`,
                            { method: "DELETE" },
                          );
                          loadFeeData();
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment History */}
            <Card className="bg-card">
              <CardHeader>
                <CardTitle className="text-lg">Payment History</CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <p className="text-center py-8 text-heading">
                    No payments recorded for this term.
                  </p>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-bg-tertiary border-b border-border">
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Date
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Amount
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Method
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Receipt
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Notes
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {payments.map((p) => (
                            <tr key={p.id} className="bg-bg-tertiary">
                              <td className="px-4 py-2 text-sm">
                                {formatDate(p.payment_date)}
                              </td>
                              <td className="px-4 py-2 text-sm font-medium text-secondary">
                                {formatUGX(p.amount)}
                              </td>
                              <td className="px-4 py-2 text-sm capitalize">
                                {p.payment_method.replace("_", " ")}
                              </td>
                              <td className="px-4 py-2 text-sm font-mono text-secondary">
                                {p.receipt_number}
                              </td>
                              <td className="px-4 py-2 text-sm text-heading">
                                {p.notes || "---"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="sm:hidden space-y-2">
                      {payments.map((p) => (
                        <div
                          key={p.id}
                          className="bg-bg-tertiary rounded-lg p-3 border border-border"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-secondary">
                              {formatUGX(p.amount)}
                            </span>
                            <span className="text-xs text-heading">
                              {formatDate(p.payment_date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-heading">
                            <span className="capitalize">
                              {p.payment_method.replace("_", " ")}
                            </span>
                            <span className="text-secondary font-mono">
                              {p.receipt_number}
                            </span>
                          </div>
                          {p.notes && (
                            <p className="text-xs text-heading mt-1">
                              {p.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== TAB: ACADEMIC ===== */}
          <TabsContent value="academic">
            {/* Term Selector */}
            <div className="flex items-center gap-3 mb-6">
              <Label>Term:</Label>
              <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{" "}
                      {t.academic_years ? `(${t.academic_years.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Overall Stats */}
            {marks.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card className="bg-card">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-heading mb-1">Total Marks</p>
                    <p className="text-xl font-bold">
                      {marks.reduce((s, m) => s + (m.score ?? 0), 0)} /{" "}
                      {marks.reduce((s, m) => s + (m.max_score ?? 0), 0)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-heading mb-1">Average</p>
                    <p className="text-xl font-bold text-secondary">
                      {marks.length > 0
                        ? (
                            (marks.reduce((s, m) => s + (m.score ?? 0), 0) /
                              marks.reduce(
                                (s, m) => s + (m.max_score ?? 0),
                                0,
                              )) *
                            100
                          ).toFixed(1)
                        : 0}
                      %
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-heading mb-1">Subjects</p>
                    <p className="text-xl font-bold">{marks.length}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Marks Table */}
            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Marks</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(
                          "/api/academics/report-cards/generate",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              student_id: studentId,
                              term_id: selectedTermId,
                            }),
                          },
                        );
                        if (!res.ok)
                          throw new Error("Failed to generate report card");
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `report-card-${student.admission_number}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        toast({
                          title: "Error",
                          description: "Failed to generate report card.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Report Card
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={shareReportCardViaSMS}
                    disabled={sharingReportCard}
                  >
                    {sharingReportCard ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Share via SMS
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {marks.length === 0 ? (
                  <p className="text-center py-8 text-heading">
                    No marks recorded for this term.
                  </p>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-bg-tertiary border-b border-border">
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Subject
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Exam Type
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Score
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-heading uppercase">
                              Grade
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {marks.map((m) => (
                            <tr key={m.id} className="bg-bg-tertiary">
                              <td className="px-4 py-2 text-sm font-medium">
                                {m.subject?.name || "Subject"}
                              </td>
                              <td className="px-4 py-2 text-sm capitalize">
                                {m.exam_type.replace("_", " ")}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {m.score} / {m.max_score}
                              </td>
                              <td className="px-4 py-2">
                                <Badge variant="default">
                                  {getGrade(m.score ?? 0, m.max_score)}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="sm:hidden space-y-2">
                      {marks.map((m) => (
                        <div
                          key={m.id}
                          className="bg-bg-tertiary rounded-lg p-3 border border-border flex items-center justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {m.subject?.name || "Subject"}
                            </p>
                            <p className="text-xs text-heading capitalize">
                              {m.exam_type.replace("_", " ")}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 ml-3">
                            <span className="text-sm font-medium">
                              {m.score}/{m.max_score}
                            </span>
                            <Badge variant="default" className="text-xs">
                              {getGrade(m.score ?? 0, m.max_score)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== TAB: ATTENDANCE ===== */}
          <TabsContent value="attendance">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-heading mb-1">Total Days</p>
                  <p className="text-xl font-bold">{attStats.total}</p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-heading mb-1">Present</p>
                  <p className="text-xl font-bold text-secondary">
                    {attStats.present}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-heading mb-1">Absent</p>
                  <p className="text-xl font-bold text-secondary">
                    {attStats.absent}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-heading mb-1">Late</p>
                  <p className="text-xl font-bold text-secondary">
                    {attStats.late}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-heading mb-1">Attendance Rate</p>
                  <p
                    className={cn(
                      "text-xl font-bold",
                      attStats.pct >= 80
                        ? "text-secondary"
                        : attStats.pct >= 50
                          ? "text-secondary"
                          : "text-secondary",
                    )}
                  >
                    {attStats.pct}%
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Attendance Rate Bar + Download Certificate */}
            <Card className="bg-card mb-6">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Attendance Rate</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setDownloadingCert(true);
                      try {
                        const termParam = selectedTermId
                          ? `&term_id=${selectedTermId}`
                          : "";
                        const res = await fetch(
                          `/api/attendance/certificate-pdf?student_id=${studentId}${termParam}`,
                        );
                        if (!res.ok)
                          throw new Error("Failed to generate certificate");
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `attendance-certificate-${student.admission_number}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        toast({
                          title: "Error",
                          description: "Failed to generate certificate.",
                          variant: "destructive",
                        });
                      } finally {
                        setDownloadingCert(false);
                      }
                    }}
                    disabled={downloadingCert}
                  >
                    {downloadingCert ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    Download Certificate
                  </Button>
                </div>
                <div className="w-full bg-bg-tertiary rounded-full h-3">
                  <div
                    className={cn(
                      "h-3 rounded-full transition-all duration-700",
                      attStats.pct >= 80
                        ? "bg-bg-tertiary"
                        : attStats.pct >= 50
                          ? "bg-bg-tertiary"
                          : "bg-bg-tertiary",
                    )}
                    style={{ width: `${attStats.pct}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Calendar Heatmap */}
            <Card className="bg-card">
              <CardHeader>
                <CardTitle className="text-lg">Attendance Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                {attendance.length === 0 ? (
                  <p className="text-center py-8 text-heading">
                    No attendance records found.
                  </p>
                ) : (
                  <>
                    {/* Build attendance map for calendar */}
                    <AttendanceCalendar attendance={attendance} />
                    {/* Legend */}
                    <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-border">
                      {[
                        { color: "bg-bg-tertiary", label: "Present" },
                        { color: "bg-bg-tertiary", label: "Absent" },
                        { color: "bg-bg-tertiary", label: "Late" },
                        { color: "bg-bg-tertiary", label: "Excused" },
                        { color: "bg-bg-tertiary", label: "No Record" },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center gap-2"
                        >
                          <div
                            className={cn("w-3 h-3 rounded-sm", item.color)}
                          />
                          <span className="text-xs text-heading">
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== TAB: DISCIPLINE ===== */}
          <TabsContent value="discipline">
            <DisciplineTab studentId={studentId} schoolId={schoolId!} />
          </TabsContent>

          {/* ===== TAB: EDIT ===== */}
          {canEditStudents && (
            <TabsContent value="edit">
              <div className="space-y-6">
                <Card className="bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg">Edit Student Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Full Name *</Label>
                        <Input
                          value={editForm.full_name}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              full_name: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Date of Birth</Label>
                        <Input
                          type="date"
                          value={editForm.date_of_birth}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              date_of_birth: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Gender</Label>
                        <Select
                          value={editForm.gender}
                          onValueChange={(v) =>
                            setEditForm((f) => ({ ...f, gender: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Class</Label>
                        <Select
                          value={editForm.current_class_id}
                          onValueChange={(v) =>
                            setEditForm((f) => ({
                              ...f,
                              current_class_id: v,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select class" />
                          </SelectTrigger>
                          <SelectContent>
                            {classes.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Parent Name</Label>
                        <Input
                          value={editForm.parent_name}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              parent_name: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Parent Phone</Label>
                        <Input
                          value={editForm.parent_phone}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              parent_phone: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Parent Email</Label>
                        <Input
                          value={editForm.parent_email}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              parent_email: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={editForm.status}
                          onValueChange={(v) =>
                            setEditForm((f) => ({ ...f, status: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="left">Left</SelectItem>
                            <SelectItem value="graduated">Graduated</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(editForm.status === "left" ||
                      editForm.status === "graduated") && (
                      <div className="space-y-2">
                        <Label>Exit Date</Label>
                        <Input
                          type="date"
                          value={editForm.exit_date}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              exit_date: e.target.value,
                            }))
                          }
                        />
                        <p className="text-xs text-heading">
                          Date the student{" "}
                          {editForm.status === "graduated"
                            ? "graduated"
                            : "left the school"}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button onClick={handleSaveEdit} disabled={savingEdit}>
                        {savingEdit ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="border-danger-50 bg-danger-50">
                  <CardHeader>
                    <CardTitle className="text-lg text-secondary">
                      Danger Zone
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Delete Student</p>
                        <p className="text-sm text-heading">
                          This will permanently remove the student and all
                          associated records.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </motion.div>

      {/* Record Payment Modal */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a fee payment for {student.full_name}.
              {feeAccount && (
                <span className="block mt-1">
                  Outstanding balance:{" "}
                  <span className="font-medium text-secondary">
                    {formatUGX(feeAccount.balance)}
                  </span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (UGX) *</Label>
              <Input
                type="number"
                placeholder="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="waiver">Waiver</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input
                placeholder="Any notes..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPaymentOpen(false)}
              disabled={savingPayment}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={!paymentAmount || savingPayment}
            >
              {savingPayment ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Record Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Student"
        description={`This will permanently delete ${student.full_name} and all associated records. This action cannot be undone.`}
        confirmText="Delete Student"
        variant="destructive"
        requireTyping={student.full_name}
        onConfirm={handleDelete}
      />

      {/* Apply Discount Dialog */}
      <ApplyDiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        studentId={studentId}
        studentName={student?.full_name}
        currentTermId={selectedTermId}
      />
    </div>
  );
}

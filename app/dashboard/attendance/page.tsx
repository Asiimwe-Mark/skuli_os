"use client";

import { useState, useCallback, useEffect} from "react";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatDate, todayLocalISODate } from "@/lib/utils/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarCheck,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Link as LinkIcon,
  Download,
  Loader2,
  Send,
} from "lucide-react";

interface ClassAttendance {
  class_id: string;
  class_name: string;
  total_students: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  percentage: number;
}

interface ChronicAbsenter {
  student_id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  parent_phone: string;
  total_days: number;
  absent_days: number;
  percentage: number;
}

export default function AttendanceOverviewPage() {
  useDocumentTitle("Attendance");
  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const supabase = useSupabaseBrowser();
  const { toast } = useToast();

  const notifyParentMutation = useMutation({
    mutationFn: async (student: ChronicAbsenter) => {
      const message = `Dear Parent, ${student.student_name} has attended ${student.percentage}% of school days this term (${student.absent_days} days absent out of ${student.total_days}). Please contact ${school?.name || "the school"} urgently.`;

      const res = await fetch("/api/communication/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_audience: "custom",
          custom_phones: [student.parent_phone],
          message_body: message,
          channels: { sms: true, in_app: false },
          schedule: "now",
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed to send SMS");
      return result;
    },
    onSuccess: () => {
      toast({ title: "Notification sent", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Failed to send", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    },
  });

  const [selectedDate, setSelectedDate] = useState(
    // Audit 10.14: use the user's local YYYY-MM-DD, not UTC.
    // toISOString() returns UTC; for users east of UTC the day
    // rolls over earlier in the day and the date input showed
    // "yesterday" until local midnight.
    todayLocalISODate()
  );
  const [classFilter, setClassFilter] = useState("all");
  const [exportingRegister, setExportingRegister] = useState(false);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  async function handleExportRegister() {
    if (classFilter === "all") {
      alert("Please select a specific class to export the register.");
      return;
    }
    setExportingRegister(true);
    try {
      const res = await fetch(
        `/api/attendance/register-pdf?class_id=${classFilter}&month=${currentMonth}&year=${currentYear}`
      );
      if (!res.ok) throw new Error("Failed to generate register");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-register-${currentMonth}-${currentYear}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to generate attendance register PDF.");
    } finally {
      setExportingRegister(false);
    }
  }

  // Load class attendance for date
  const { data: classSummary = [], isLoading } = useQuery({
    queryKey: ["attendance-overview", school?.id, selectedDate, currentTerm?.id],
    queryFn: async () => {
      const { data: classes } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (!classes) return [];

      const { data: attendance } = await supabase
        .from("attendance_records")
        .select("class_id, status, student_id")
        .eq("school_id", school!.id)
        .eq("date", selectedDate);

      const { data: enrollments } = await supabase
        .from("class_enrollments")
        .select("class_id, student_id")
        .in("class_id", classes.map((c: { id: string }) => c.id))
        .eq("term_id", currentTerm?.id || "");

      const attMap = new Map<string, Record<string, string[]>>();
      (attendance || []).forEach((a: { class_id: string; status: string; student_id: string }) => {
        if (!attMap.has(a.class_id)) {
          attMap.set(a.class_id, { present: [], absent: [], late: [], excused: [] });
        }
        const statusKey = a.status as 'present' | 'absent' | 'late' | 'excused';
        if (attMap.get(a.class_id)![statusKey]) {
          attMap.get(a.class_id)![statusKey].push(a.student_id);
        }
      });

      const enrollCounts = new Map<string, number>();
      (enrollments || []).forEach((e: { class_id: string }) => {
        enrollCounts.set(e.class_id, (enrollCounts.get(e.class_id) || 0) + 1);
      });

      const summary: ClassAttendance[] = classes.map((c: { id: string; name: string }) => {
        const rec = attMap.get(c.id) || { present: [], absent: [], late: [], excused: [] };
        const total = enrollCounts.get(c.id) || 0;
        const marked = rec.present.length + rec.absent.length + rec.late.length + rec.excused.length;
        return {
          class_id: c.id,
          class_name: c.name,
          total_students: total,
          present: rec.present.length,
          absent: rec.absent.length,
          late: rec.late.length,
          excused: rec.excused.length,
          percentage: marked > 0 ? Math.round((rec.present.length / marked) * 100) : 0,
        };
      });

      return summary;
    },
    enabled: !!school?.id && !!currentTerm?.id,
  });

  // Load chronic absenters (below 75%)
  const { data: chronicAbsenters = [] } = useQuery({
    queryKey: ["chronic-absenters", school?.id, currentTerm?.id],
    queryFn: async () => {
      if (!currentTerm?.id) return [];

      const { data: termDates } = await supabase
        .from("attendance_records")
        .select("date")
        .eq("school_id", school!.id)
        .gte("date", currentTerm.start_date)
        .lte("date", currentTerm.end_date);

      const uniqueDays = new Set((termDates || []).map((r: { date: string }) => r.date));
      const totalDays = uniqueDays.size || 1;

      type AttendanceWithStudent = {
        student_id: string;
        status: string;
        students?: { full_name?: string; admission_number?: string; parent_phone?: string; classes?: { name?: string } };
      };

      const { data: records } = await supabase
        .from("attendance_records")
        .select("student_id, status, students(full_name, admission_number, parent_phone, current_class_id, classes:current_class_id(name))")
        .eq("school_id", school!.id)
        .gte("date", currentTerm.start_date)
        .lte("date", currentTerm.end_date);

      const studentMap = new Map<string, { name: string; adm: string; cls: string; phone: string; absent: number; total: number }>();
      ((records || []) as AttendanceWithStudent[]).forEach((r) => {
        const sid = r.student_id;
        if (!studentMap.has(sid)) {
          studentMap.set(sid, {
            name: r.students?.full_name || "Unknown",
            adm: r.students?.admission_number || "",
            cls: r.students?.classes?.name || "",
            phone: r.students?.parent_phone || "",
            absent: 0,
            total: 0,
          });
        }
        const entry = studentMap.get(sid)!;
        entry.total++;
        if (r.status === "absent") entry.absent++;
      });

      const absenters: ChronicAbsenter[] = [];
      studentMap.forEach((val, sid) => {
        const pct = totalDays > 0 ? Math.round(((totalDays - val.absent) / totalDays) * 100) : 100;
        if (pct < 75) {
          absenters.push({
            student_id: sid,
            student_name: val.name,
            admission_number: val.adm,
            class_name: val.cls,
            parent_phone: val.phone,
            total_days: totalDays,
            absent_days: val.absent,
            percentage: pct,
          });
        }
      });

      return absenters.sort((a, b) => a.percentage - b.percentage).slice(0, 10);
    },
    enabled: !!school?.id && !!currentTerm?.id,
  });

  const filteredSummary =
    classFilter === "all"
      ? classSummary
      : classSummary.filter((c) => c.class_id === classFilter);

  const totalPresent = filteredSummary.reduce((s, c) => s + c.present, 0);
  const totalAbsent = filteredSummary.reduce((s, c) => s + c.absent, 0);
  const totalLate = filteredSummary.reduce((s, c) => s + c.late, 0);
  const totalStudents = filteredSummary.reduce((s, c) => s + c.total_students, 0);
  const overallPct =
    totalPresent + totalAbsent > 0
      ? Math.round((totalPresent / (totalPresent + totalAbsent)) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Attendance Overview</h1>
          <p className="text-muted text-sm mt-1">
            Track daily student attendance across classes
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={handleExportRegister}
            disabled={exportingRegister || classFilter === "all"}
          >
            {exportingRegister ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            <span className="hidden sm:inline">Export Register</span> PDF
          </Button>
          <a href="/dashboard/attendance/take">
            <Button>
              <CalendarCheck className="w-4 h-4 mr-2" />
              Take Attendance
            </Button>
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Class</Label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-10 px-3 rounded-lg bg-bg-tertiary border border-border text-heading text-sm"
          >
            <option value="all">All Classes</option>
            {classSummary.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.class_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Total Students</p>
              <p className="text-xl font-bold text-text-heading">{totalStudents}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-success-500 bg-success-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success-100 text-success-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-success-700">Present</p>
              <p className="text-xl font-bold text-success-700">{totalPresent}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-danger-500 bg-danger-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-danger-100 text-danger-700 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-danger-700">Absent</p>
              <p className="text-xl font-bold text-danger-700">{totalAbsent}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-warning-500 bg-warning-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning-100 text-warning-700 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-warning-700">Attendance Rate</p>
              <p className="text-xl font-bold text-warning-700">{overallPct}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Class Attendance Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filteredSummary.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No attendance data"
          description="Take attendance to see class-wise attendance summaries here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSummary.map((cls, i) => (
            <motion.div
              key={cls.class_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="bg-card transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">{cls.class_name}</h3>
                    <Badge
                      variant={
                        cls.percentage >= 80
                          ? "success"
                          : cls.percentage >= 60
                          ? "warning"
                          : "destructive"
                      }
                    >
                      {cls.percentage}%
                    </Badge>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-bg-tertiary rounded-full mb-4 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${cls.percentage}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className={cn(
                        "h-full rounded-full",
                        cls.percentage >= 80
                          ? "bg-success-600"
                          : cls.percentage >= 60
                          ? "bg-warning-600"
                          : "bg-danger-600"
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-success-600 dark:text-success-400">{cls.present}</p>
                      <p className="text-[10px] text-muted">Present</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-danger-600 dark:text-danger-400">{cls.absent}</p>
                      <p className="text-[10px] text-muted">Absent</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-warning-600 dark:text-warning-400">{cls.late}</p>
                      <p className="text-[10px] text-muted">Late</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-text-heading">{cls.excused}</p>
                      <p className="text-[10px] text-text-muted">Excused</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-heading">
                      {cls.total_students} enrolled
                    </span>
                    {cls.percentage < 75 && cls.percentage > 0 && (
                      <span className="text-xs text-danger-700 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Low attendance
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Chronic Absenters Table */}
      {chronicAbsenters.length > 0 && (
        <Card className="border-danger-500 bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-danger-700" />
              Chronic Absentees (Below 75%)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Admission No.</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Days Absent</TableHead>
                    <TableHead>Attendance %</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chronicAbsenters.map((s) => (
                    <TableRow key={s.student_id}>
                      <TableCell className="font-medium">{s.student_name}</TableCell>
                      <TableCell className="text-heading">{s.admission_number}</TableCell>
                      <TableCell>{s.class_name}</TableCell>
                      <TableCell className="text-danger-700 font-semibold">
                        {s.absent_days}/{s.total_days}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{s.percentage}%</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!s.parent_phone || notifyParentMutation.isPending}
                          onClick={() => notifyParentMutation.mutate(s)}
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          Notify Parent
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-border/50">
              {chronicAbsenters.map((s) => (
                <div key={s.student_id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.student_name}</p>
                      <p className="text-xs text-heading font-mono">{s.admission_number}</p>
                    </div>
                    <Badge variant="destructive" className="ml-2 shrink-0">{s.percentage}%</Badge>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <Badge variant="secondary" className="text-xs">{s.class_name}</Badge>
                    <span className="text-xs text-danger-700 font-semibold">
                      {s.absent_days}/{s.total_days} days absent
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs"
                    disabled={!s.parent_phone || notifyParentMutation.isPending}
                    onClick={() => notifyParentMutation.mutate(s)}
                  >
                    <Send className="w-3 h-3 mr-1.5" />
                    Notify Parent
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

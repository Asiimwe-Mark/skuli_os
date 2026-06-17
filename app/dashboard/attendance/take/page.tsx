"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatDate, todayLocalISODate } from "@/lib/utils/dates";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Users,
  Send,
  Loader2,
  MessageSquare,
  UserCheck,
} from "lucide-react";
import type { AttendanceStatus } from "@/types";

interface StudentEntry {
  student_id: string;
  full_name: string;
  admission_number: string;
  photo_url: string | null;
  parent_phone: string;
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  {
    label: string;
    shortLabel: string;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  present: {
    label: "Present",
    shortLabel: "P",
    color: "text-success-700",
    bgColor: "bg-success-100",
    borderColor: "border-success-500",
  },
  absent: {
    label: "Absent",
    shortLabel: "A",
    color: "text-danger-700",
    bgColor: "bg-danger-100",
    borderColor: "border-danger-500",
  },
  late: {
    label: "Late",
    shortLabel: "L",
    color: "text-warning-700",
    bgColor: "bg-warning-100",
    borderColor: "border-warning-500",
  },
  excused: {
    label: "Excused",
    shortLabel: "E",
    color: "text-text-muted",
    bgColor: "bg-bg-tertiary",
    borderColor: "border-border",
  },
};

export default function TakeAttendancePage() {
  // QW-1: selector-based store reads so a change to any unrelated
  // store field (sidebar, command-palette, etc.) doesn't re-render
  // this whole page.
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { toast } = useToast();
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    // Audit 10.14: local YYYY-MM-DD, not UTC.
    todayLocalISODate()
  );
  const [records, setRecords] = useState<Map<string, AttendanceStatus>>(new Map());
  const [showSmsPreview, setShowSmsPreview] = useState(false);
  const [absentStudents, setAbsentStudents] = useState<StudentEntry[]>([]);
  const [submitProgress, setSubmitProgress] = useState<Map<string, "saving" | "saved" | "error">>(new Map());

  const todayStr = todayLocalISODate();

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

  // Load students + existing attendance
  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ["attendance-students", selectedClassId, selectedDate, currentTerm?.id],
    queryFn: async () => {
      const { data: enrollments, error: enrollErr } = await supabase
        .from("class_enrollments")
        .select(
          "student_id, students(id, full_name, admission_number, photo_url, parent_phone)"
        )
        .eq("class_id", selectedClassId)
        .eq("term_id", currentTerm!.id);
      if (enrollErr) throw enrollErr;

      const { data: existing } = await supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("class_id", selectedClassId)
        .eq("date", selectedDate);

      const existingMap = new Map<string, AttendanceStatus>(
        (existing || []).map((r: { student_id: string; status: string }) => [r.student_id, r.status as AttendanceStatus])
      );

      type EnrollmentWithStudent = {
        student_id: string;
        students?: { id?: string; full_name?: string; admission_number?: string; photo_url?: string | null; parent_phone?: string };
      };

      const list: StudentEntry[] =
        ((enrollments || []) as EnrollmentWithStudent[]).map((e) => ({
          student_id: e.student_id,
          full_name: e.students?.full_name || "Unknown",
          admission_number: e.students?.admission_number || "",
          photo_url: e.students?.photo_url || null,
          parent_phone: e.students?.parent_phone || "",
        })) || [];

      const init = new Map<string, AttendanceStatus>();
      list.forEach((s) => {
        init.set(s.student_id, (existingMap.get(s.student_id) || "present") as AttendanceStatus);
      });
      setRecords(init);

      return list;
    },
    enabled: !!selectedClassId && !!currentTerm?.id,
  });

  const setStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setRecords((prev) => {
      const next = new Map(prev);
      next.set(studentId, status);
      return next;
    });
  }, []);

  const markAllPresent = useCallback(() => {
    setRecords((prev) => {
      const next = new Map(prev);
      students.forEach((s) => next.set(s.student_id, "present"));
      return next;
    });
  }, [students]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school context");

      const entries = Array.from(records.entries());
      const progress = new Map<string, "saving" | "saved" | "error">();
      entries.forEach(([id]) => progress.set(id, "saving"));
      setSubmitProgress(new Map(progress));

      const attendanceRecords = entries.map(([studentId, status]) => ({
        student_id: studentId,
        status,
      }));

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: selectedClassId,
          date: selectedDate,
          records: attendanceRecords,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        // Mark all as error
        entries.forEach(([id]) => progress.set(id, "error"));
        setSubmitProgress(new Map(progress));
        throw new Error(result.error || "Failed to save attendance");
      }

      // Mark all as saved
      entries.forEach(([id]) => progress.set(id, "saved"));
      setSubmitProgress(new Map(progress));

      // Clear progress after 2s
      setTimeout(() => setSubmitProgress(new Map()), 2000);

      const absent = students.filter((s) => {
        const st = records.get(s.student_id);
        return st === "absent" || st === "late";
      });
      setAbsentStudents(absent);

      return { count: entries.length, absentCount: absent.length };
    },
    onSuccess: (result) => {
      toast({
        title: "Attendance saved",
        description: `${result.count} records saved. ${result.absentCount} absent/late.`,
        variant: "success",
      });
      if (result.absentCount > 0) setShowSmsPreview(true);
      queryClient.invalidateQueries({ queryKey: ["attendance-students"] });
      // Cross-page: the dashboard's "Present Today" KPI and the
      // attendance overview page both read attendance_records.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["sms-logs"] });
      queryClient.invalidateQueries({ queryKey: ["sms-balance"] });
    },
    onError: (err) => {
      toast({
        title: "Error saving attendance",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const presentCount = Array.from(records.values()).filter((s) => s === "present").length;
  const absentCount = Array.from(records.values()).filter((s) => s === "absent").length;
  const lateCount = Array.from(records.values()).filter((s) => s === "late").length;
  const excusedCount = Array.from(records.values()).filter((s) => s === "excused").length;
  const totalCount = records.size;
  const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold font-display">Take Attendance</h1>
        <p className="text-muted text-sm mt-1">
          Mark student attendance for today or a selected date
        </p>
      </div>

      {/* Filters */}
      <Card className="bg-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Class</Label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-bg-tertiary border border-border text-heading text-sm"
              >
                <option value="">Select class</option>
                {classes.map((c: { id: string; name: string }) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={todayStr}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={markAllPresent}
                disabled={!selectedClassId || students.length === 0}
                className="w-full"
              >
                <UserCheck className="w-4 h-4 mr-2" />
                Mark All Present
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {selectedClassId && students.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-3"
        >
          {[
            { label: "Total", value: totalCount, cls: "" },
            { label: "Present", value: presentCount, cls: "border-success-500 bg-success-100 text-success-700" },
            { label: "Absent", value: absentCount, cls: "border-danger-500 bg-danger-100 text-danger-700" },
            { label: "Late", value: lateCount, cls: "border-warning-500 bg-warning-100 text-warning-700" },
            { label: "Excused", value: excusedCount, cls: "border-border-strong bg-bg-tertiary text-text-muted" },
          ].map((s) => (
            <Card
              key={s.label}
              className={cn(" bg-card", s.cls)}
            >
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-text-heading">{s.value}</p>
                <p className={cn("text-xs font-medium", s.cls.includes("text-") ? s.cls.split(" ").find((c) => c.startsWith("text-")) : "text-text-muted")}>{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Student List */}
      {!selectedClassId ? (
        <EmptyState
          icon={ClipboardList}
          title="Select a class"
          description="Choose a class above to begin taking attendance."
        />
      ) : loadingStudents ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students enrolled"
          description="There are no students enrolled in this class for the current term."
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {students.map((student, i) => {
              const currentStatus = records.get(student.student_id) || "present";
              const cfg = STATUS_CONFIG[currentStatus];

              return (
                <motion.div
                  key={student.student_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <Card
                    className={cn(
                      "border-2 transition-all duration-200",
                      currentStatus === "present" && "border-success-500 bg-success-100",
                      currentStatus === "absent" && "border-danger-500 bg-danger-100",
                      currentStatus === "late" && "border-warning-500 bg-warning-100",
                      currentStatus === "excused" && "border-border bg-bg-tertiary"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center shrink-0 overflow-hidden">
                            {student.photo_url ? (
                              <img
                                src={student.photo_url}
                                alt={student.full_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-sm font-semibold text-heading">
                                {student.full_name.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{student.full_name}</p>
                              {submitProgress.get(student.student_id) === "saving" && (
                                <Loader2 className="w-3.5 h-3.5 text-brand-600 animate-spin flex-shrink-0" />
                              )}
                              {submitProgress.get(student.student_id) === "saved" && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-success-700 flex-shrink-0" />
                              )}
                              {submitProgress.get(student.student_id) === "error" && (
                                <XCircle className="w-3.5 h-3.5 text-danger-700 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-heading">{student.admission_number}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((status) => {
                            const s = STATUS_CONFIG[status];
                            const isActive = currentStatus === status;
                            return (
                              <button
                                key={status}
                                onClick={() => setStatus(student.student_id, status)}
                                className={cn(
                                  "w-11 h-11 rounded-lg flex items-center justify-center text-xs font-bold border-2 transition-all duration-200 active:scale-95",
                                  isActive
                                    ? cn(s.bgColor, s.color, s.borderColor, "scale-105 shadow-lg")
                                    : "border-border bg-bg-tertiary text-text-muted hover:border-border-strong hover:text-text-heading"
                                )}
                                title={s.label}
                              >
                                {s.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Sticky Submit Bar */}
      {selectedClassId && students.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky bottom-4 z-10"
        >
          <Card className="border-warning-500 bg-warning-100 backdrop-blur-sm shadow-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {presentCount}/{totalCount} present
                    <span className="text-heading ml-2">({pct}%)</span>
                  </p>
                  <p className="text-xs text-heading">
                    {formatDate(selectedDate)} -{" "}
                    {classes.find((c: { id: string; name: string }) => c.id === selectedClassId)?.name}
                  </p>
                </div>
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                  size="lg"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Submit Attendance
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* SMS Preview Dialog */}
      <Dialog open={showSmsPreview} onOpenChange={setShowSmsPreview}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-text-heading" />
              Notify Parents
            </DialogTitle>
            <DialogDescription>
              These students were marked absent or late. Send SMS to their parents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {absentStudents.map((student) => {
                const st = records.get(student.student_id);
                return (
                  <div
                    key={student.student_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary"
                  >
                    <div>
                      <p className="text-sm font-medium">{student.full_name}</p>
                      <p className="text-xs text-heading">
                        {formatPhoneDisplay(student.parent_phone)}
                      </p>
                    </div>
                    <Badge variant={st === "absent" ? "destructive" : "warning"}>
                      {st === "absent" ? "Absent" : "Late"}
                    </Badge>
                  </div>
                );
              })}
            </div>

            <Card className="border-border bg-bg-tertiary">
              <CardContent className="p-3">
                <p className="text-xs text-heading mb-1">Message Preview:</p>
                <p className="text-sm">
                  Dear Parent, your child{" "}
                  {absentStudents[0]?.full_name || "[Name]"} was marked{" "}
                  {absentStudents[0] &&
                  records.get(absentStudents[0].student_id) === "absent"
                    ? "ABSENT"
                    : "LATE"}{" "}
                  on {formatDate(selectedDate)}. Please contact the school if you have
                  any concerns. - {school?.name || "School"}
                </p>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSmsPreview(false)}>
              Skip
            </Button>
            <Button
              onClick={() => {
                toast({
                  title: "SMS queued",
                  description: `${absentStudents.length} notification(s) will be sent.`,
                  variant: "success",
                });
                setShowSmsPreview(false);
              }}
            >
              <Send className="w-4 h-4 mr-2" />
              Send SMS ({absentStudents.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

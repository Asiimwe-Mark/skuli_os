"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { formatDate } from "@/lib/utils/dates";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  ClipboardCheck,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface MarkGroup {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  teacher_name: string;
  exam_type: string;
  student_count: number;
  review_status: string;
  reviewed_at: string | null;
  review_comment: string | null;
  entered_by: string | null;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  not_started: { label: "Not Started", variant: "secondary", color: "text-gray-400" },
  draft: { label: "Draft", variant: "outline", color: "text-yellow-400" },
  submitted: { label: "Submitted", variant: "default", color: "text-blue-400" },
  approved: { label: "Approved", variant: "default", color: "text-emerald-400" },
  rejected: { label: "Rejected", variant: "destructive", color: "text-rose-400" },
};

export default function MarksReviewPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const { school, currentTerm } = useSchoolStore();

  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedTerm, setSelectedTerm] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectingGroup, setRejectingGroup] = useState<MarkGroup | null>(null);

  // Load classes
  const { data: classes = [] } = useQuery({
    queryKey: ["classes", school?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      return data || [];
    },
    enabled: !!school?.id,
  });

  // Load subjects
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects", school?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      return data || [];
    },
    enabled: !!school?.id,
  });

  // Load terms
  const { data: terms = [] } = useQuery({
    queryKey: ["terms", school?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: !!school?.id,
  });

  // Load mark groups (aggregated view)
  const { data: markGroups = [], isLoading } = useQuery({
    queryKey: ["mark-groups", school?.id, selectedClass, selectedSubject, selectedTerm, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("marks")
        .select(`
          class_id,
          classes(name),
          subject_id,
          subjects(name),
          exam_type,
          review_status,
          reviewed_at,
          review_comment,
          entered_by,
          updated_at
        `)
        .eq("school_id", school!.id)
        .eq("is_deleted", false);

      if (selectedClass !== "all") query = query.eq("class_id", selectedClass);
      if (selectedSubject !== "all") query = query.eq("subject_id", selectedSubject);
      if (selectedTerm !== "all") query = query.eq("term_id", selectedTerm);

      const { data } = await query;

      if (!data) return [];

      // Group by class+subject+exam_type
      const grouped = new Map<string, MarkGroup>();
      for (const row of data) {
        const key = `${row.class_id}-${row.subject_id}-${row.exam_type}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.student_count++;
          if (row.updated_at > existing.updated_at) {
            existing.updated_at = row.updated_at;
            existing.review_status = row.review_status;
            existing.reviewed_at = row.reviewed_at;
            existing.review_comment = row.review_comment;
          }
        } else {
          grouped.set(key, {
            class_id: row.class_id,
            class_name: (row.classes as unknown as { name: string })?.name || "Unknown",
            subject_id: row.subject_id,
            subject_name: (row.subjects as unknown as { name: string })?.name || "Unknown",
            teacher_name: "",
            exam_type: row.exam_type,
            student_count: 1,
            review_status: row.review_status,
            reviewed_at: row.reviewed_at,
            review_comment: row.review_comment,
            entered_by: row.entered_by,
            updated_at: row.updated_at,
          });
        }
      }

      // Load teacher names for entered_by IDs
      const teacherIds = [...new Set([...grouped.values()].map((g) => g.entered_by).filter(Boolean))] as string[];
      if (teacherIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", teacherIds);

        const nameMap = new Map<string, string>();
        if (users) {
          for (const u of users) nameMap.set(u.id, u.full_name);
        }
        for (const g of grouped.values()) {
          if (g.entered_by) g.teacher_name = nameMap.get(g.entered_by) || "Unknown";
        }
      }

      let results = Array.from(grouped.values());

      if (statusFilter !== "all") {
        results = results.filter((g) => g.review_status === statusFilter);
      }

      return results;
    },
    enabled: !!school?.id,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (group: MarkGroup) => {
      const { error } = await supabase
        .from("marks")
        .update({
          review_status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("school_id", school!.id)
        .eq("class_id", group.class_id)
        .eq("subject_id", group.subject_id)
        .eq("exam_type", group.exam_type)
        .eq("review_status", "submitted");
      if (error) throw error;

      // Audit log
      await supabase.from("audit_logs").insert({
        school_id: school!.id,
        action: "MARKS_APPROVED",
        entity_type: "marks",
        entity_id: `${group.class_id}-${group.subject_id}-${group.exam_type}`,
        new_value: { review_status: "approved" },
      });

      // Notify teacher
      if (group.entered_by) {
        await supabase.from("in_app_notifications").insert({
          school_id: school!.id,
          recipient_user_id: group.entered_by,
          title: "Marks Approved",
          body: `Your marks for ${group.subject_name} in ${group.class_name} (${group.exam_type}) have been approved.`,
          type: "success",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mark-groups"] });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ group, reason }: { group: MarkGroup; reason: string }) => {
      const { error } = await supabase
        .from("marks")
        .update({
          review_status: "rejected",
          review_comment: reason,
          reviewed_at: new Date().toISOString(),
        })
        .eq("school_id", school!.id)
        .eq("class_id", group.class_id)
        .eq("subject_id", group.subject_id)
        .eq("exam_type", group.exam_type)
        .eq("review_status", "submitted");
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        school_id: school!.id,
        action: "MARKS_REJECTED",
        entity_type: "marks",
        entity_id: `${group.class_id}-${group.subject_id}-${group.exam_type}`,
        new_value: { review_status: "rejected", reason },
      });

      if (group.entered_by) {
        await supabase.from("in_app_notifications").insert({
          school_id: school!.id,
          recipient_user_id: group.entered_by,
          title: "Marks Rejected",
          body: `Your marks for ${group.subject_name} in ${group.class_name} (${group.exam_type}) were rejected. Reason: ${reason}`,
          type: "error",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mark-groups"] });
      setRejectDialogOpen(false);
      setRejectionReason("");
      setRejectingGroup(null);
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: async (group: MarkGroup) => {
      const { error } = await supabase
        .from("marks")
        .update({ review_status: "submitted", reviewed_at: null })
        .eq("school_id", school!.id)
        .eq("class_id", group.class_id)
        .eq("subject_id", group.subject_id)
        .eq("exam_type", group.exam_type)
        .eq("review_status", "approved");
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        school_id: school!.id,
        action: "MARKS_REVOKED",
        entity_type: "marks",
        entity_id: `${group.class_id}-${group.subject_id}-${group.exam_type}`,
        new_value: { review_status: "submitted" },
      });

      if (group.entered_by) {
        await supabase.from("in_app_notifications").insert({
          school_id: school!.id,
          recipient_user_id: group.entered_by,
          title: "Approval Revoked",
          body: `Your approval for ${group.subject_name} in ${group.class_name} (${group.exam_type}) has been revoked. The marks are back in submitted status.`,
          type: "warning",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mark-groups"] });
    },
  });

  const handleRejectClick = (group: MarkGroup) => {
    setRejectingGroup(group);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = () => {
    if (!rejectingGroup || !rejectionReason.trim()) return;
    rejectMutation.mutate({ group: rejectingGroup, reason: rejectionReason.trim() });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Review Marks</h1>
        <p className="text-foreground/60 text-sm mt-1">
          Review, approve, or reject marks submitted by teachers
        </p>
      </div>

      {/* Filters */}
      <Card className="border-border-subtle bg-surface">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((cls: { id: string; name: string }) => (
                  <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger>
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjects.map((subj: { id: string; name: string }) => (
                  <SelectItem key={subj.id} value={subj.id}>{subj.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTerm} onValueChange={setSelectedTerm}>
              <SelectTrigger>
                <SelectValue placeholder="All Terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Terms</SelectItem>
                {terms.map((term: { id: string; name: string }) => (
                  <SelectItem key={term.id} value={term.id}>{term.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Status Summary */}
      <div className="flex flex-wrap gap-2">
        {["all", "not_started", "draft", "submitted", "approved", "rejected"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className={cn(
              "text-xs",
              statusFilter === s && s === "submitted" && "bg-blue-600 hover:bg-blue-700",
              statusFilter === s && s === "approved" && "bg-emerald-600 hover:bg-emerald-700",
              statusFilter === s && s === "rejected" && "bg-rose-600 hover:bg-rose-700"
            )}
          >
            {s === "all" ? "All" : statusConfig[s]?.label || s}
          </Button>
        ))}
      </div>

      {/* Main Table */}
      <Card className="border-border-subtle bg-surface">
        <CardHeader>
          <CardTitle className="text-lg">Mark Submissions</CardTitle>
          <CardDescription>
            {markGroups.length} submission{markGroups.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : markGroups.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-foreground/30" />
              <p className="text-foreground/60 font-medium">No mark submissions found</p>
              <p className="text-foreground/40 text-sm mt-1">
                {statusFilter !== "all"
                  ? "Try changing the status filter"
                  : "Marks will appear here once teachers start entering them"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-3 px-2 font-medium text-foreground/60">Class</th>
                    <th className="text-left py-3 px-2 font-medium text-foreground/60">Subject</th>
                    <th className="text-left py-3 px-2 font-medium text-foreground/60">Teacher</th>
                    <th className="text-left py-3 px-2 font-medium text-foreground/60">Exam Type</th>
                    <th className="text-center py-3 px-2 font-medium text-foreground/60">Students</th>
                    <th className="text-center py-3 px-2 font-medium text-foreground/60">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-foreground/60">Last Updated</th>
                    <th className="text-right py-3 px-2 font-medium text-foreground/60">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {markGroups.map((group, i) => {
                    const status = statusConfig[group.review_status] || statusConfig.not_started;
                    return (
                      <tr
                        key={`${group.class_id}-${group.subject_id}-${group.exam_type}`}
                        className={cn(
                          "border-b border-border-subtle/50 transition-colors hover:bg-navy-900/30",
                          i % 2 === 0 && "bg-navy-900/10"
                        )}
                      >
                        <td className="py-3 px-2 font-medium">{group.class_name}</td>
                        <td className="py-3 px-2">{group.subject_name}</td>
                        <td className="py-3 px-2 text-foreground/70">{group.teacher_name || "—"}</td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {group.exam_type}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-center">{group.student_count}</td>
                        <td className="py-3 px-2 text-center">
                          <Badge variant={status.variant} className="text-xs">
                            {status.label}
                          </Badge>
                          {group.review_comment && (
                            <p className="text-[10px] text-foreground/40 mt-1 truncate max-w-[120px]" title={group.review_comment}>
                              {group.review_comment}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-2 text-foreground/60 text-xs">
                          {formatDate(group.updated_at)}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center justify-end gap-1">
                            {group.review_status === "submitted" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"
                                  onClick={() => approveMutation.mutate(group)}
                                  disabled={approveMutation.isPending}
                                >
                                  {approveMutation.isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  <span className="ml-1 hidden sm:inline">Approve</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-rose-400 hover:text-rose-300 hover:bg-rose-400/10"
                                  onClick={() => handleRejectClick(group)}
                                  disabled={rejectMutation.isPending}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span className="ml-1 hidden sm:inline">Reject</span>
                                </Button>
                              </>
                            )}
                            {group.review_status === "approved" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-amber hover:text-amber-300 hover:bg-amber/10"
                                onClick={() => revokeMutation.mutate(group)}
                                disabled={revokeMutation.isPending}
                              >
                                {revokeMutation.isPending ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                                <span className="ml-1 hidden sm:inline">Revoke</span>
                              </Button>
                            )}
                            {(group.review_status === "not_started" || group.review_status === "draft") && (
                              <span className="text-xs text-foreground/30">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Marks</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting the marks for{" "}
              <strong>{rejectingGroup?.subject_name}</strong> in{" "}
              <strong>{rejectingGroup?.class_name}</strong> ({rejectingGroup?.exam_type}).
              The teacher will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReject}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Reject Marks"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

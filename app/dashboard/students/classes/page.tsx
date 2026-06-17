"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { getClassLevels } from "@/lib/utils/class-levels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  School,
  Plus,
  Users,
  UserCheck,
  MoreVertical,
  Edit2,
  Archive,
  ArchiveRestore,
  Search,
  Loader2,
  BookOpen,
} from "lucide-react";
import type { Class, UserProfile, Student } from "@/types";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

interface ClassWithMeta extends Class {
  student_count: number;
  attendance_pct: number;
  teacher_name: string | null;
}

interface ClassFormData {
  name: string;
  level: string;
  stream: string;
  class_teacher_id: string;
  capacity: number | null;
}

const STREAMS = ["A", "B", "C", "D", "E", "Red", "Blue", "Green", "Yellow"];

function ClassCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-bg-tertiary p-5 space-y-4">
      <div className="flex items-start justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-32" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    </div>
  );
}

export default function ClassesPage() {
  const { school } = useSchoolStore();
  const { canEditStudents } = usePermissions();
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Class levels are driven by the school's `school_type`. A primary
  // school sees (Baby..P.7), a nursery school sees (DayCare..Top), a
  // secondary school sees (S.1..S.6), and a 'both' school sees the
  // union. This is also the source of truth used by the onboard API
  // to seed defaults.
  const levels = useMemo(
    () => getClassLevels(school?.school_type),
    [school?.school_type]
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassWithMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassWithMeta | null>(null);
  const [rosterStudents, setRosterStudents] = useState<Student[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [formData, setFormData] = useState<ClassFormData>({
    name: "",
    level: "",
    stream: "",
    class_teacher_id: "",
    capacity: null,
  });

  // Classes directory + teacher dropdown are now powered by react-query so
  // creating/editing/archiving a class invalidates the list and refetches
  // without a hard refresh.
  const classesQuery = useQuery({
    queryKey: ["classes-with-meta", school?.id],
    enabled: !!school?.id,
    queryFn: async (): Promise<ClassWithMeta[]> => {
      const { data: classData, error } = await supabase
        .from("classes")
        .select("*, class_teacher:users(id, full_name)")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) {
        toast({ title: "Error", description: "Failed to load classes.", variant: "destructive" });
        throw error;
      }

      const enriched: ClassWithMeta[] = await Promise.all(
        ((classData as unknown[]) || []).map(async (cls: any) => {
          const { count } = await supabase
            .from("students")
            .select("*", { count: "exact", head: true })
            .eq("current_class_id", cls.id)
            .eq("status", "active")
            .eq("is_deleted", false);

          const { data: attendanceData } = await supabase
            .from("attendance_records")
            .select("status")
            .eq("class_id", cls.id)
            .gte(
              "date",
              new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]
            );

          const total = attendanceData?.length || 0;
          const present =
            (attendanceData || []).filter((r: { status: string }) => r.status === "present").length || 0;
          const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;

          return {
            ...cls,
            student_count: count || 0,
            attendance_pct: attendancePct,
            teacher_name: cls.class_teacher?.full_name || null,
          };
        })
      );
      return enriched;
    },
  });

  const teachersQuery = useQuery({
    queryKey: ["users-teachers", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, school_id, full_name, role, role_title, phone, email, avatar_url, is_active, created_at, updated_at, is_deleted")
        .eq("school_id", school!.id)
        .eq("role", "TEACHER")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const classes = (classesQuery.data ?? []) as ClassWithMeta[];
  const teachers = (teachersQuery.data ?? []) as UserProfile[];
  const loading = classesQuery.isLoading || teachersQuery.isLoading;

  // Filter the loaded class list to the rows that belong to this
  // school's `school_type`. We keep classes whose `level` is null
  // (legacy / hand-entered rows) so we never silently hide data.
  const visibleClasses = useMemo(
    () =>
      classes.filter((cls) => !cls.level || levels.includes(cls.level)),
    [classes, levels]
  );

  function openAddDialog() {
    setEditingClass(null);
    setFormData({ name: "", level: "", stream: "", class_teacher_id: "", capacity: null });
    setDialogOpen(true);
  }

  function openEditDialog(cls: ClassWithMeta) {
    setEditingClass(cls);
    setFormData({
      name: cls.name,
      level: cls.level || "",
      stream: cls.stream || "",
      class_teacher_id: cls.class_teacher_id || "",
      capacity: cls.capacity ?? null,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!school || !formData.name.trim()) return;
    setSaving(true);

    // Reject levels that don't belong to this school's school type. This
    // stops an admin (e.g. a primary school) from creating an "S.3" row
    // because the dropdown was momentarily unfiltered. The free-text
    // `name` column is still allowed (some schools type "P.1A" or
    // "S.3 Science") — only the structured `level` is constrained.
    const chosenLevel = formData.level || null;
    if (chosenLevel && !levels.includes(chosenLevel)) {
      toast({
        title: "Invalid level",
        description: `"${chosenLevel}" is not a valid level for a ${
          school.school_type ?? "school"
        } school.`,
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    // Coerce capacity to a number or null. Empty strings (from a blank
    // input) should become NULL so the column can store "no cap".
    const rawCapacity = formData.capacity;
    const capacityValue =
      rawCapacity === null || rawCapacity === undefined || Number.isNaN(rawCapacity)
        ? null
        : Number(rawCapacity);

    const payload = {
      name: formData.name.trim(),
      level: chosenLevel,
      stream: formData.stream || null,
      class_teacher_id: formData.class_teacher_id && formData.class_teacher_id !== "none" ? formData.class_teacher_id : null,
      capacity: capacityValue,
      school_id: school.id,
    };

    if (editingClass) {
      const { error } = await supabase
        .from("classes")
        .update(payload)
        .eq("id", editingClass.id);

      if (error) {
        toast({ title: "Error", description: "Failed to update class.", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Class updated successfully.", variant: "success" });
        // Invalidate every query key that depends on classes so the
        // students directory, dashboard, classes roster, and the
        // onboarding checklist all refresh without a hard reload.
        queryClient.invalidateQueries({ queryKey: ["classes-with-meta"] });
        queryClient.invalidateQueries({ queryKey: ["classes"] });
        queryClient.invalidateQueries({ queryKey: ["students"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["attendance-students"] });
      }
    } else {
      const { error } = await supabase.from("classes").insert(payload as any);

      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to create class.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Success", description: "Class created successfully.", variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["classes-with-meta"] });
        queryClient.invalidateQueries({ queryKey: ["classes"] });
        queryClient.invalidateQueries({ queryKey: ["students"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["attendance-students"] });
      }
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleArchive(cls: ClassWithMeta) {
    const { error } = await supabase
      .from("classes")
      .update({ is_deleted: true })
      .eq("id", cls.id);

    if (error) {
      toast({ title: "Error", description: "Failed to archive class.", variant: "destructive" });
    } else {
      toast({ title: "Archived", description: `${cls.name} has been archived.`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["classes-with-meta"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }

  async function handleRestore(cls: ClassWithMeta) {
    const { error } = await supabase
      .from("classes")
      .update({ is_deleted: false })
      .eq("id", cls.id);

    if (error) {
      toast({ title: "Error", description: "Failed to restore class.", variant: "destructive" });
    } else {
      toast({ title: "Restored", description: `${cls.name} has been restored.`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["classes-with-meta"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }

  async function openRoster(cls: ClassWithMeta) {
    setSelectedClass(cls);
    setSheetOpen(true);
    setRosterLoading(true);

    const { data, error } = await supabase
      .from("students")
      .select("id, full_name, admission_number, gender, current_class_id, status, photo_url, parent_name, parent_phone")
      .eq("current_class_id", cls.id)
      .eq("status", "active")
      .eq("is_deleted", false)
      .order("full_name");

    if (error) {
      toast({ title: "Error", description: "Failed to load student roster.", variant: "destructive" });
    } else {
      setRosterStudents((data || []) as unknown as Student[]);
    }
    setRosterLoading(false);
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        {...fadeInUp}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold">Classes</h1>
          <p className="text-heading text-sm">
            Manage classes, assign teachers, and view student rosters.
          </p>
        </div>
        {canEditStudents && (
          <Button onClick={openAddDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Add Class
          </Button>
        )}
      </motion.div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ClassCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && visibleClasses.length === 0 && (
        <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
          <EmptyState
            icon={School}
            title="No classes yet"
            description="Create your first class to start enrolling students and tracking attendance."
            action={
              canEditStudents ? (
                <Button onClick={openAddDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Class
                </Button>
              ) : undefined
            }
          />
        </motion.div>
      )}

      {/* Hidden-rows notice: some rows exist for this school but they
          belong to a different school type. We surface the count so the
          admin understands why the list looks empty. */}
      {!loading && visibleClasses.length === 0 && classes.length > 0 && (
        <p className="text-center text-sm text-heading mt-4">
          {classes.length} archived or out-of-type classes are hidden.
        </p>
      )}

      {/* Class Grid */}
      {!loading && visibleClasses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleClasses.map((cls, i) => (
            <motion.div
              key={cls.id}
              {...fadeInUp}
              transition={{ delay: i * 0.05 }}
            >
              <Card
                className="bg-card transition-all duration-300 cursor-pointer"
                onClick={() => openRoster(cls)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold">{cls.name}</h3>
                      <p className="text-sm text-heading">
                        {cls.level && cls.stream
                          ? `${cls.level} ${cls.stream}`
                          : cls.level || cls.stream || "No level set"}
                      </p>
                    </div>
                    {canEditStudents && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(cls);
                            }}
                          >
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(cls);
                            }}
                            className="text-danger-600"
                          >
                            <Archive className="w-4 h-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Teacher */}
                  <div className="flex items-center gap-2 mb-4">
                    <UserCheck className="w-4 h-4 text-heading" />
                    <span className="text-sm text-heading">
                      {cls.teacher_name || "No teacher assigned"}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-bg-tertiary text-center">
                      <Users className="w-5 h-5 text-brand-700 mx-auto mb-1" />
                      <p className="text-xl font-bold text-text-heading">{cls.student_count}</p>
                      <p className="text-[10px] text-text-muted uppercase tracking-wider">
                        Students
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-bg-tertiary text-center">
                      <div
                        className={cn(
                          "w-5 h-5 mx-auto mb-1 rounded-full flex items-center justify-center text-[10px] font-bold",
                          cls.attendance_pct >= 80
                            ? "bg-success-100 text-success-700"
                            : cls.attendance_pct >= 50
                            ? "bg-warning-100 text-warning-700"
                            : "bg-danger-100 text-danger-700"
                        )}
                      >
                        %
                      </div>
                      <p className="text-xl font-bold text-text-heading">{cls.attendance_pct}%</p>
                      <p className="text-[10px] text-text-muted uppercase tracking-wider">
                        Attendance
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingClass ? "Edit Class" : "Add New Class"}
            </DialogTitle>
            <DialogDescription>
              {editingClass
                ? "Update the class details below."
                : "Fill in the details to create a new class."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Class Name *</Label>
              <Input
                id="name"
                placeholder="e.g. P.1A, S.3 Science"
                value={formData.name}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Level</Label>
                <Select
                  value={formData.level}
                  onValueChange={(v) =>
                    setFormData((f) => ({ ...f, level: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-heading">
                  Levels available for a {school?.school_type ?? "school"}{" "}
                  school.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Stream</Label>
                <Select
                  value={formData.stream}
                  onValueChange={(v) =>
                    setFormData((f) => ({ ...f, stream: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stream" />
                  </SelectTrigger>
                  <SelectContent>
                    {STREAMS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity (max students)</Label>
              <Input
                id="capacity"
                type="number"
                min={0}
                placeholder="e.g. 40 (leave blank for no cap)"
                value={formData.capacity ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setFormData((f) => ({
                    ...f,
                    capacity: v === "" ? null : Number(v),
                  }));
                }}
              />
              <p className="text-[11px] text-heading">
                Optional. Used to warn when enrolment approaches the cap.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Class Teacher</Label>
              <Select
                value={formData.class_teacher_id}
                onValueChange={(v) =>
                  setFormData((f) => ({ ...f, class_teacher_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign a teacher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name.trim() || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingClass ? (
                "Update Class"
              ) : (
                "Create Class"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Roster Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selectedClass?.name} - Student Roster</SheetTitle>
            <SheetDescription>
              {selectedClass?.student_count} students enrolled
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-2">
            {rosterLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!rosterLoading && rosterStudents.length === 0 && (
              <div className="text-center py-12 text-heading">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No students enrolled in this class.</p>
              </div>
            )}

            {!rosterLoading &&
              rosterStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary hover:bg-card-hover transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-warning-100 text-warning-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {getInitials(student.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {student.full_name}
                    </p>
                    <p className="text-xs text-heading">
                      {student.admission_number}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

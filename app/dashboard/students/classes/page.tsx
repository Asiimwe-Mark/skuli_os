"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { usePermissions } from "@/lib/hooks/usePermissions";
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
}

const LEVELS = [
  "P.1", "P.2", "P.3", "P.4", "P.5", "P.6", "P.7",
  "S.1", "S.2", "S.3", "S.4", "S.5", "S.6",
];

const STREAMS = ["A", "B", "C", "D", "E", "Red", "Blue", "Green", "Yellow"];

function ClassCardSkeleton() {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-5 space-y-4">
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
  const supabase = createBrowserClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassWithMeta[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
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
  });

  async function loadClasses() {
    if (!school) return;

    const { data: classData, error } = await supabase
      .from("classes")
      .select("*, class_teacher:users(id, full_name)")
      .eq("school_id", school.id)
      .eq("is_deleted", false)
      .order("name");

    if (error) {
      toast({ title: "Error", description: "Failed to load classes.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const enriched: ClassWithMeta[] = await Promise.all(
      (classData || []).map(async (cls: { id: string; name: string; class_teacher?: { id: string; full_name: string } | null; [key: string]: unknown }) => {
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

    setClasses(enriched);
    setLoading(false);
  }

  async function loadTeachers() {
    if (!school) return;
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("school_id", school.id)
      .eq("role", "TEACHER")
      .eq("is_active", true)
      .order("full_name");

    if (data) setTeachers(data);
  }

  useEffect(() => {
    loadClasses();
    loadTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school]);

  function openAddDialog() {
    setEditingClass(null);
    setFormData({ name: "", level: "", stream: "", class_teacher_id: "" });
    setDialogOpen(true);
  }

  function openEditDialog(cls: ClassWithMeta) {
    setEditingClass(cls);
    setFormData({
      name: cls.name,
      level: cls.level || "",
      stream: cls.stream || "",
      class_teacher_id: cls.class_teacher_id || "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!school || !formData.name.trim()) return;
    setSaving(true);

    const payload = {
      name: formData.name.trim(),
      level: formData.level || null,
      stream: formData.stream || null,
      class_teacher_id: formData.class_teacher_id || null,
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
        loadClasses();
      }
    } else {
      const { error } = await supabase.from("classes").insert(payload);

      if (error) {
        toast({ title: "Error", description: "Failed to create class.", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Class created successfully.", variant: "success" });
        loadClasses();
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
      loadClasses();
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
      loadClasses();
    }
  }

  async function openRoster(cls: ClassWithMeta) {
    setSelectedClass(cls);
    setSheetOpen(true);
    setRosterLoading(true);

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("current_class_id", cls.id)
      .eq("status", "active")
      .eq("is_deleted", false)
      .order("full_name");

    if (error) {
      toast({ title: "Error", description: "Failed to load student roster.", variant: "destructive" });
    } else {
      setRosterStudents(data || []);
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
          <p className="text-foreground/60 text-sm">
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
      {!loading && classes.length === 0 && (
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

      {/* Class Grid */}
      {!loading && classes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls, i) => (
            <motion.div
              key={cls.id}
              {...fadeInUp}
              transition={{ delay: i * 0.05 }}
            >
              <Card
                className="border-border-subtle bg-surface hover:border-border-glow transition-all duration-300 cursor-pointer"
                onClick={() => openRoster(cls)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold">{cls.name}</h3>
                      <p className="text-sm text-foreground/60">
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
                            className="text-rose-400"
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
                    <UserCheck className="w-4 h-4 text-foreground/40" />
                    <span className="text-sm text-foreground/70">
                      {cls.teacher_name || "No teacher assigned"}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-navy-900/50 text-center">
                      <Users className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                      <p className="text-xl font-bold">{cls.student_count}</p>
                      <p className="text-[10px] text-foreground/50 uppercase tracking-wider">
                        Students
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-navy-900/50 text-center">
                      <div
                        className={cn(
                          "w-5 h-5 mx-auto mb-1 rounded-full flex items-center justify-center text-[10px] font-bold",
                          cls.attendance_pct >= 80
                            ? "bg-emerald-500/20 text-emerald-400"
                            : cls.attendance_pct >= 50
                            ? "bg-amber-400/20 text-amber-400"
                            : "bg-rose-500/20 text-rose-400"
                        )}
                      >
                        %
                      </div>
                      <p className="text-xl font-bold">{cls.attendance_pct}%</p>
                      <p className="text-[10px] text-foreground/50 uppercase tracking-wider">
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

            <div className="grid grid-cols-2 gap-4">
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
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <SelectItem value="">None</SelectItem>
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
              <div className="text-center py-12 text-foreground/40">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No students enrolled in this class.</p>
              </div>
            )}

            {!rosterLoading &&
              rosterStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-navy-900/50 hover:bg-navy-900 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
                    {getInitials(student.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {student.full_name}
                    </p>
                    <p className="text-xs text-foreground/50">
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

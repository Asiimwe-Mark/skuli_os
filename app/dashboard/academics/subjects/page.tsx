"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import { BookOpen, Plus, Edit2, Trash2, Loader2 } from "lucide-react";

const subjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  code: z.string().min(1, "Code is required").max(10, "Max 10 characters"),
  max_marks: z.number().min(1, "Must be at least 1").max(1000),
});
type SubjectFormData = z.infer<typeof subjectSchema>;

interface ClassSubjectRow {
  class_id: string;
  teacher_id: string | null;
  classes: { name: string } | null;
  users: { full_name: string } | null;
}

export default function SubjectsPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<{
    id: string;
    name: string;
    code: string | null;
    max_marks: number;
  } | null>(null);

  const [assignSubjectId, setAssignSubjectId] = useState<string | null>(null);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SubjectFormData>({
    resolver: zodResolver(subjectSchema) as unknown as Resolver<SubjectFormData>,
    defaultValues: { name: "", code: "", max_marks: 100 },
  });

  // ---- Queries ----
  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["subjects", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select(
          "*, class_subjects(class_id, teacher_id, classes(name), users:teacher_id(full_name))"
        )
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("school_id", school!.id)
        .in("role", ["TEACHER", "SCHOOL_ADMIN"])
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- Mutations ----
  const createMutation = useMutation({
    mutationFn: async (values: SubjectFormData) => {
      const { data, error } = await supabase
        .from("subjects")
        .insert({
          school_id: school!.id,
          name: values.name.trim(),
          code: values.code.trim().toUpperCase(),
          max_marks: values.max_marks,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (newSubject) => {
      if (assignClassId && newSubject) {
        await supabase.from("class_subjects").insert({
          class_id: assignClassId,
          subject_id: newSubject.id,
          teacher_id: assignTeacherId || null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast({ title: "Subject created" });
      closeDialog();
    },
    onError: (err) => {
      toast({
        title: "Error creating subject",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: SubjectFormData;
    }) => {
      const { error } = await supabase
        .from("subjects")
        .update({
          name: values.name.trim(),
          code: values.code.trim().toUpperCase(),
          max_marks: values.max_marks,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast({ title: "Subject updated" });
      closeDialog();
    },
    onError: (err) => {
      toast({
        title: "Error updating subject",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subjects")
        .update({ is_deleted: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast({ title: "Subject deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete", variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({
      subjectId,
      classId,
      teacherId,
    }: {
      subjectId: string;
      classId: string;
      teacherId: string;
    }) => {
      const { error } = await supabase.from("class_subjects").upsert({
        class_id: classId,
        subject_id: subjectId,
        teacher_id: teacherId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast({ title: "Assigned to class" });
      setAssignSubjectId(null);
      setAssignClassId("");
      setAssignTeacherId("");
    },
    onError: () => {
      toast({ title: "Failed to assign", variant: "destructive" });
    },
  });

  // ---- Handlers ----
  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    assignMutation.isPending;

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSubject(null);
    reset({ name: "", code: "", max_marks: 100 });
    setAssignClassId("");
    setAssignTeacherId("");
  };

  const openCreate = () => {
    reset({ name: "", code: "", max_marks: 100 });
    setEditingSubject(null);
    setAssignClassId("");
    setAssignTeacherId("");
    setDialogOpen(true);
  };

  const openEdit = (subject: {
    id: string;
    name: string;
    code: string | null;
    max_marks: number;
  }) => {
    setEditingSubject(subject);
    setValue("name", subject.name);
    setValue("code", subject.code ?? "");
    setValue("max_marks", subject.max_marks);
    setDialogOpen(true);
  };

  const onSubmit = (values: SubjectFormData) => {
    if (editingSubject) {
      updateMutation.mutate({ id: editingSubject.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleAssign = (subjectId: string) => {
    if (!assignClassId) return;
    assignMutation.mutate({
      subjectId,
      classId: assignClassId,
      teacherId: assignTeacherId,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Subjects</h1>
          <p className="text-muted text-sm mt-1">
            Manage subjects and assign them to classes with teachers
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Subject
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          description="Add subjects to start entering marks and generating report cards."
          action={
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Subject
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Max Marks</TableHead>
                  <TableHead>Classes & Teachers</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map(
                  (subject: {
                    id: string;
                    name: string;
                    code: string | null;
                    max_marks: number;
                    class_subjects?: ClassSubjectRow[];
                  }) => (
                    <TableRow key={subject.id}>
                      <TableCell className="font-medium">
                        {subject.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{subject.code}</Badge>
                      </TableCell>
                      <TableCell>{subject.max_marks}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {subject.class_subjects?.map((cs) => (
                            <Badge
                              key={cs.class_id}
                              variant="secondary"
                              className="text-xs"
                            >
                              {cs.classes?.name}
                              {cs.users?.full_name && (
                                <span className="ml-1 text-muted">
                                  ({cs.users.full_name})
                                </span>
                              )}
                            </Badge>
                          ))}
                          {(!subject.class_subjects ||
                            subject.class_subjects.length === 0) && (
                            <span className="text-xs text-muted">
                              Not assigned
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(subject)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(subject.id)}
                            className="text-danger-600 hover:text-danger-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSubject ? "Edit Subject" : "Add Subject"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject Name</Label>
                <Input
                  placeholder="e.g. Mathematics"
                  {...register("name")}
                  invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-xs text-danger-600">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  placeholder="e.g. MATH"
                  {...register("code")}
                  invalid={!!errors.code}
                />
                {errors.code && (
                  <p className="text-xs text-danger-600">{errors.code.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Maximum Marks</Label>
              <Input
                type="number"
                {...register("max_marks", { valueAsNumber: true })}
                invalid={!!errors.max_marks}
              />
              {errors.max_marks && (
                <p className="text-xs text-danger-600">{errors.max_marks.message}</p>
              )}
            </div>

            {!editingSubject && (
              <>
                <div className="space-y-2">
                  <Label>Assign to Class (optional)</Label>
                  <Select
                    value={assignClassId}
                    onValueChange={setAssignClassId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map(
                        (c: { id: string; name: string }) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {assignClassId && (
                  <div className="space-y-2">
                    <Label>Assign Teacher (optional)</Label>
                    <Select
                      value={assignTeacherId}
                      onValueChange={setAssignTeacherId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select teacher" />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers.map(
                          (t: { id: string; full_name: string }) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.full_name}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </form>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(onSubmit)} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingSubject ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Existing Subject Dialog */}
      <Dialog
        open={!!assignSubjectId}
        onOpenChange={() => setAssignSubjectId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={assignClassId} onValueChange={setAssignClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c: { id: string; name: string }) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Teacher (optional)</Label>
              <Select
                value={assignTeacherId}
                onValueChange={setAssignTeacherId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t: { id: string; full_name: string }) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignSubjectId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => assignSubjectId && handleAssign(assignSubjectId)}
              disabled={!assignClassId || assignMutation.isPending}
            >
              {assignMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}


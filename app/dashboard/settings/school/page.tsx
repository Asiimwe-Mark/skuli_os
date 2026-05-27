"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import { schoolProfileSchema, type SchoolProfileFormData } from "@/lib/validations/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2,
  Save,
  Loader2,
  Plus,
  Calendar,
  CheckCircle2,
  Hash,
  GraduationCap,
  Trash2,
  RotateCcw,
} from "lucide-react";
import type { AcademicYear, Term } from "@/types";
import type { Database } from "@/types/database";

type GradingScale = Database['public']['Tables']['grading_scales']['Row'];

export default function SchoolProfilePage() {
  const { school, currentTerm, currentAcademicYear, setSchool } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [yearDialogOpen, setYearDialogOpen] = useState(false);
  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [newYearName, setNewYearName] = useState("");
  const [newTerm, setNewTerm] = useState({ name: "Term1", start_date: "", end_date: "" });

  // School Code
  const [schoolCode, setSchoolCode] = useState(school?.school_code || "");
  const [codeError, setCodeError] = useState("");
  const [codeSaving, setCodeSaving] = useState(false);

  // Grading Scale
  const [editingGrade, setEditingGrade] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ min_score: 0, max_score: 0, label: "" });

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<SchoolProfileFormData>({
    resolver: zodResolver(schoolProfileSchema),
    values: school
      ? {
          name: school.name,
          address: school.address || "",
          district: school.district || "",
          phone: school.phone || "",
          email: school.email || "",
          motto: school.motto || "",
          logo_url: school.logo_url || "",
        }
      : undefined,
  });

  // Load academic years
  const { data: academicYears = [] } = useQuery({
    queryKey: ["academic-years", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .eq("school_id", school!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AcademicYear[];
    },
    enabled: !!school?.id,
  });

  // Load terms
  const { data: terms = [] } = useQuery({
    queryKey: ["terms", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("*, academic_years(name)")
        .eq("school_id", school!.id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data || []) as (Term & { academic_years?: { name: string } })[];
    },
    enabled: !!school?.id,
  });

  // Load grading scales
  const { data: gradingScales = [], isLoading: gradesLoading } = useQuery({
    queryKey: ["grading-scales", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grading_scales")
        .select("*")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as GradingScale[];
    },
    enabled: !!school?.id,
  });

  const saveProfileMutation = useMutation({
    mutationFn: async (data: SchoolProfileFormData) => {
      const { error } = await supabase
        .from("schools")
        .update(data)
        .eq("id", school!.id);
      if (error) throw error;
      setSchool({ ...school!, ...data });
    },
    onSuccess: () => {
      toast({ title: "Profile updated", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const createYearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("academic_years").insert({
        school_id: school!.id,
        name: newYearName,
        is_current: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Academic year created", variant: "success" });
      setYearDialogOpen(false);
      setNewYearName("");
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    },
  });

  const setCurrentYearMutation = useMutation({
    mutationFn: async (yearId: string) => {
      await supabase.from("academic_years").update({ is_current: false }).eq("school_id", school!.id);
      await supabase.from("academic_years").update({ is_current: true }).eq("id", yearId);
    },
    onSuccess: () => {
      toast({ title: "Current year updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    },
  });

  const createTermMutation = useMutation({
    mutationFn: async () => {
      const currentYear = academicYears.find((y) => y.is_current);
      if (!currentYear) throw new Error("Set a current academic year first");
      const { error } = await supabase.from("terms").insert({
        school_id: school!.id,
        academic_year_id: currentYear.id,
        name: newTerm.name,
        start_date: newTerm.start_date,
        end_date: newTerm.end_date,
        is_current: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Term created", variant: "success" });
      setTermDialogOpen(false);
      setNewTerm({ name: "Term1", start_date: "", end_date: "" });
      queryClient.invalidateQueries({ queryKey: ["terms"] });
    },
  });

  const setCurrentTermMutation = useMutation({
    mutationFn: async (termId: string) => {
      await supabase.from("terms").update({ is_current: false }).eq("school_id", school!.id);
      await supabase.from("terms").update({ is_current: true }).eq("id", termId);
    },
    onSuccess: () => {
      toast({ title: "Current term updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["terms"] });
    },
  });

  // School Code
  useEffect(() => {
    if (school?.school_code) setSchoolCode(school.school_code);
  }, [school?.school_code]);

  async function handleSaveSchoolCode() {
    if (!school) return;
    const code = schoolCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
    if (code.length < 2) {
      setCodeError("Code must be at least 2 letters");
      return;
    }
    setCodeSaving(true);
    setCodeError("");
    try {
      const { data: existing } = await supabase
        .from("schools")
        .select("id")
        .eq("school_code", code)
        .neq("id", school.id)
        .maybeSingle();
      if (existing) {
        setCodeError("This code is already taken by another school");
        setCodeSaving(false);
        return;
      }
      const { error } = await supabase
        .from("schools")
        .update({ school_code: code })
        .eq("id", school.id);
      if (error) throw error;
      setSchool({ ...school, school_code: code });
      setSchoolCode(code);
      toast({ title: "School code updated", variant: "success" });
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setCodeSaving(false);
    }
  }

  // Grading Scale mutations
  const updateGradeMutation = useMutation({
    mutationFn: async ({ id, min_score, max_score, label }: { id: string; min_score: number; max_score: number; label: string }) => {
      const { error } = await supabase
        .from("grading_scales")
        .update({ min_score, max_score, label, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Grade updated", variant: "success" });
      setEditingGrade(null);
      queryClient.invalidateQueries({ queryKey: ["grading-scales"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const addGradeMutation = useMutation({
    mutationFn: async () => {
      const existingGrades = gradingScales.map((g) => g.grade);
      const allLetters = ["A", "B", "C", "D", "E", "F"];
      const nextGrade = allLetters.find((g) => !existingGrades.includes(g)) || "X";
      const maxOrder = gradingScales.reduce((max, g) => Math.max(max, g.sort_order), 0);
      const { error } = await supabase.from("grading_scales").insert({
        school_id: school!.id,
        grade: nextGrade,
        min_score: 0,
        max_score: 0,
        label: "New Grade",
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Grade added", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["grading-scales"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const deleteGradeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("grading_scales")
        .update({ is_deleted: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Grade removed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["grading-scales"] });
    },
  });

  const resetGradesMutation = useMutation({
    mutationFn: async () => {
      // Delete all existing
      await supabase.from("grading_scales").delete().eq("school_id", school!.id);
      // Re-insert defaults
      await supabase.from("grading_scales").insert([
        { school_id: school!.id, grade: "A", min_score: 80, max_score: 100, label: "Distinction", sort_order: 1 },
        { school_id: school!.id, grade: "B", min_score: 70, max_score: 79, label: "Credit", sort_order: 2 },
        { school_id: school!.id, grade: "C", min_score: 60, max_score: 69, label: "Merit", sort_order: 3 },
        { school_id: school!.id, grade: "D", min_score: 50, max_score: 59, label: "Pass", sort_order: 4 },
        { school_id: school!.id, grade: "F", min_score: 0, max_score: 49, label: "Fail", sort_order: 5 },
      ]);
    },
    onSuccess: () => {
      toast({ title: "Grading scale reset to defaults", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["grading-scales"] });
    },
  });

  if (!school) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">School Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your school details and academic calendar</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Form */}
        <Card className="border-border-subtle bg-surface">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-400" />
              School Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((data) => saveProfileMutation.mutate(data))} className="space-y-4">
              <div className="space-y-2">
                <Label>School Name</Label>
                <Input {...register("name")} error={!!errors.name} />
                {errors.name && <p className="text-xs text-rose-400">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input {...register("address")} placeholder="P.O. Box..." />
                </div>
                <div className="space-y-2">
                  <Label>District</Label>
                  <Input {...register("district")} placeholder="e.g. Kampala" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input {...register("phone")} placeholder="+256..." />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input {...register("email")} placeholder="info@school.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>School Motto</Label>
                <Textarea {...register("motto")} placeholder="Excellence through discipline" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input {...register("logo_url")} placeholder="https://..." />
              </div>
              <Button type="submit" disabled={saveProfileMutation.isPending || !isDirty}>
                {saveProfileMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Academic Calendar */}
        <div className="space-y-6">
          {/* Academic Years */}
          <Card className="border-border-subtle bg-surface">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                Academic Years
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setYearDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                New Year
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {academicYears.length === 0 ? (
                <p className="text-sm text-foreground/50">No academic years yet.</p>
              ) : (
                academicYears.map((year) => (
                  <div key={year.id} className="flex items-center justify-between p-3 rounded-lg bg-navy-700/50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{year.name}</span>
                      {year.is_current && <Badge variant="success">Current</Badge>}
                    </div>
                    {!year.is_current && (
                      <Button size="sm" variant="ghost" onClick={() => setCurrentYearMutation.mutate(year.id)}>
                        Set Current
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Terms */}
          <Card className="border-border-subtle bg-surface">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Terms</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setTermDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                New Term
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {terms.length === 0 ? (
                <p className="text-sm text-foreground/50">No terms yet.</p>
              ) : (
                terms.map((term) => (
                  <div key={term.id} className="flex items-center justify-between p-3 rounded-lg bg-navy-700/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{term.name.replace("Term", "Term ")}</span>
                        {term.is_current && <Badge variant="success">Current</Badge>}
                      </div>
                      <p className="text-xs text-foreground/50">
                        {formatDate(term.start_date)} - {formatDate(term.end_date)}
                        {term.academic_years?.name && ` | ${term.academic_years.name}`}
                      </p>
                    </div>
                    {!term.is_current && (
                      <Button size="sm" variant="ghost" onClick={() => setCurrentTermMutation.mutate(term.id)}>
                        Set Current
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* School Code */}
      <Card className="border-border-subtle bg-surface">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="w-5 h-5 text-amber-400" />
            School Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground/50">
            Used in receipt numbers: <code className="bg-navy-800 px-1.5 py-0.5 rounded text-amber-400">SKULI-{schoolCode || "CODE"}-202506-0001</code>
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label>School Code</Label>
              <Input
                value={schoolCode}
                onChange={(e) => {
                  setSchoolCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6));
                  setCodeError("");
                }}
                placeholder="e.g. MBALE"
                maxLength={6}
                className="uppercase"
              />
              {codeError && <p className="text-xs text-rose-400">{codeError}</p>}
            </div>
            <Button
              onClick={handleSaveSchoolCode}
              disabled={codeSaving || schoolCode === school.school_code}
            >
              {codeSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grading Scale */}
      <Card className="border-border-subtle bg-surface">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-amber-400" />
            Grading Scale
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => resetGradesMutation.mutate()} disabled={resetGradesMutation.isPending}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset to Default
            </Button>
            <Button size="sm" variant="outline" onClick={() => addGradeMutation.mutate()} disabled={addGradeMutation.isPending}>
              <Plus className="w-4 h-4 mr-1" />
              Add Grade
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {gradesLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : gradingScales.length === 0 ? (
            <p className="text-sm text-foreground/50">No grading scales configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-600">
                    <th className="text-left py-2 px-3 text-foreground/50 font-medium">Grade</th>
                    <th className="text-left py-2 px-3 text-foreground/50 font-medium">Min Score</th>
                    <th className="text-left py-2 px-3 text-foreground/50 font-medium">Max Score</th>
                    <th className="text-left py-2 px-3 text-foreground/50 font-medium">Label</th>
                    <th className="text-right py-2 px-3 text-foreground/50 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gradingScales.map((gs) => (
                    <tr key={gs.id} className="border-b border-navy-800/50 hover:bg-navy-900/50">
                      <td className="py-2 px-3">
                        <Badge className={gs.grade === "A" ? "bg-emerald-500/15 text-emerald-400" : gs.grade === "F" ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400"}>
                          {gs.grade}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        {editingGrade === gs.id ? (
                          <Input
                            type="number"
                            value={editValues.min_score}
                            onChange={(e) => setEditValues((v) => ({ ...v, min_score: Number(e.target.value) }))}
                            className="w-20 h-8"
                          />
                        ) : (
                          <span>{gs.min_score}</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {editingGrade === gs.id ? (
                          <Input
                            type="number"
                            value={editValues.max_score}
                            onChange={(e) => setEditValues((v) => ({ ...v, max_score: Number(e.target.value) }))}
                            className="w-20 h-8"
                          />
                        ) : (
                          <span>{gs.max_score}</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {editingGrade === gs.id ? (
                          <Input
                            value={editValues.label}
                            onChange={(e) => setEditValues((v) => ({ ...v, label: e.target.value }))}
                            className="w-32 h-8"
                          />
                        ) : (
                          <span>{gs.label || "—"}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {editingGrade === gs.id ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditingGrade(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => updateGradeMutation.mutate({ id: gs.id, min_score: editValues.min_score, max_score: editValues.max_score, label: editValues.label })}>
                              Save
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingGrade(gs.id);
                                setEditValues({ min_score: gs.min_score, max_score: gs.max_score, label: gs.label || "" });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-400 hover:text-rose-300"
                              onClick={() => deleteGradeMutation.mutate(gs.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Year Dialog */}
      <Dialog open={yearDialogOpen} onOpenChange={setYearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Academic Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Year Name</Label>
              <Input value={newYearName} onChange={(e) => setNewYearName(e.target.value)} placeholder="e.g. 2026" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setYearDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createYearMutation.mutate()} disabled={!newYearName.trim() || createYearMutation.isPending}>
              {createYearMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Term Dialog */}
      <Dialog open={termDialogOpen} onOpenChange={setTermDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Term</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Term</Label>
              <select
                value={newTerm.name}
                onChange={(e) => setNewTerm((p) => ({ ...p, name: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg bg-navy-800 border border-navy-600 text-foreground text-sm"
              >
                <option value="Term1">Term 1</option>
                <option value="Term2">Term 2</option>
                <option value="Term3">Term 3</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={newTerm.start_date} onChange={(e) => setNewTerm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={newTerm.end_date} onChange={(e) => setNewTerm((p) => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTermDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createTermMutation.mutate()} disabled={!newTerm.start_date || !newTerm.end_date || createTermMutation.isPending}>
              {createTermMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

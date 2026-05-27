"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Users,
  AlertTriangle,
} from "lucide-react";
import type { Class, AcademicYear, Student } from "@/types";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
  }),
};

interface PromotionMapping {
  source_class_id: string;
  source_class_name: string;
  dest_class_id: string;
  student_count: number;
}

// Auto-suggest next class level
function suggestNextClassName(className: string): string | null {
  const match = className.match(/^([PS])\.(\d)(.*)$/i);
  if (!match) return null;

  const prefix = match[1].toUpperCase();
  const num = parseInt(match[2], 10);
  const suffix = match[3] || "";

  if (prefix === "P") {
    if (num >= 7) return null; // P.7 graduates
    return `P.${num + 1}${suffix}`;
  }
  if (prefix === "S") {
    if (num >= 6) return null; // S.6 graduates
    return `S.${num + 1}${suffix}`;
  }
  return null;
}

const STEPS = [
  { label: "Select Year", icon: GraduationCap },
  { label: "Map Classes", icon: ArrowRight },
  { label: "Review", icon: Users },
];

export default function PromotePage() {
  const router = useRouter();
  const { school, currentAcademicYear } = useSchoolStore();
  const { canEditStudents } = usePermissions();
  const supabase = createBrowserClient();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [promotedCount, setPromotedCount] = useState(0);

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [mappings, setMappings] = useState<PromotionMapping[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!school) return;

      const { data: years } = await supabase
        .from("academic_years")
        .select("*")
        .eq("school_id", school.id)
        .order("created_at", { ascending: false });

      if (years) {
        setAcademicYears(years);
        // Default to current year
        const current = years.find((y: AcademicYear) => y.is_current);
        if (current) setSelectedYearId(current.id);
      }

      const { data: classData } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", school.id)
        .eq("is_deleted", false)
        .order("name");

      if (classData) setClasses(classData);

      setLoading(false);
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school]);

  // Build promotion mappings when year or classes change
  useEffect(() => {
    if (!selectedYearId || classes.length === 0) return;

    async function buildMappings() {
      const newMappings: PromotionMapping[] = [];

      for (const cls of classes) {
        // Count students in this class for the selected year
        const { count } = await supabase
          .from("class_enrollments")
          .select("*", { count: "exact", head: true })
          .eq("class_id", cls.id)
          .eq("academic_year_id", selectedYearId);

        const suggestedName = suggestNextClassName(cls.name);
        const destClass = classes.find(
          (c) => c.name.toLowerCase() === (suggestedName || "").toLowerCase()
        );

        newMappings.push({
          source_class_id: cls.id,
          source_class_name: cls.name,
          dest_class_id: destClass?.id || "",
          student_count: count || 0,
        });
      }

      setMappings(newMappings);
    }

    buildMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId, classes]);

  function updateDestClass(sourceId: string, destId: string) {
    setMappings((prev) =>
      prev.map((m) =>
        m.source_class_id === sourceId ? { ...m, dest_class_id: destId } : m
      )
    );
  }

  function nextStep() {
    if (step === 0 && !selectedYearId) {
      toast({
        title: "Select Year",
        description: "Please select an academic year.",
        variant: "warning",
      });
      return;
    }

    if (step === 1) {
      const valid = mappings.filter(
        (m) => m.student_count > 0 && m.dest_class_id
      );
      if (valid.length === 0) {
        toast({
          title: "No Mappings",
          description:
            "Please map at least one class with students to a destination.",
          variant: "warning",
        });
        return;
      }
    }

    setDirection(1);
    setStep((s) => Math.min(s + 1, 2));
  }

  function prevStep() {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handlePromote() {
    if (!school || !currentAcademicYear) {
      toast({
        title: "Error",
        description: "No current academic year set. Please set one first.",
        variant: "destructive",
      });
      return;
    }

    setPromoting(true);

    try {
      const currentTerm = await supabase
        .from("terms")
        .select("id")
        .eq("school_id", school.id)
        .eq("is_current", true)
        .single();

      if (!currentTerm.data) {
        throw new Error("No current term found.");
      }

      let totalPromoted = 0;

      for (const mapping of mappings) {
        if (!mapping.dest_class_id || mapping.student_count === 0) continue;

        // Get all students enrolled in this class for the selected year
        const { data: enrollments } = await supabase
          .from("class_enrollments")
          .select("student_id")
          .eq("class_id", mapping.source_class_id)
          .eq("academic_year_id", selectedYearId);

        if (!enrollments || enrollments.length === 0) continue;

        const studentIds = enrollments.map((e: { student_id: string }) => e.student_id);

        // Update students' current class
        await supabase
          .from("students")
          .update({ current_class_id: mapping.dest_class_id })
          .in("id", studentIds);

        // Create new class enrollments for the current term
        const newEnrollments = studentIds.map((sid: string) => ({
          student_id: sid,
          class_id: mapping.dest_class_id,
          term_id: currentTerm.data.id,
          academic_year_id: currentAcademicYear.id,
        }));

        await supabase.from("class_enrollments").insert(newEnrollments);

        totalPromoted += studentIds.length;
      }

      setPromotedCount(totalPromoted);
      setSuccess(true);
      toast({
        title: "Promotion Complete",
        description: `${totalPromoted} students have been promoted successfully.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Promotion Failed",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setPromoting(false);
    }
  }

  if (!canEditStudents) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Access Denied"
        description="You don't have permission to promote students."
      />
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (academicYears.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <EmptyState
          icon={GraduationCap}
          title="No Academic Years"
          description="Create an academic year before promoting students."
          action={
            <Button onClick={() => router.push("/dashboard/settings/school")}>
              Go to Settings
            </Button>
          }
        />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Promotion Complete</h2>
              <p className="text-foreground/60 mb-6">
                {promotedCount} students have been promoted to their new classes.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push("/dashboard/students")}
                >
                  View Students
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setSuccess(false);
                    setStep(0);
                    setPromotedCount(0);
                  }}
                >
                  Promote More
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page Header */}
      <motion.div {...fadeInUp} className="mb-8">
        <h1 className="text-2xl font-bold">Promote Students</h1>
        <p className="text-foreground/60 text-sm">
          Move students from one class to the next academic year.
        </p>
      </motion.div>

      {/* Step Indicators */}
      <motion.div {...fadeInUp} transition={{ delay: 0.05 }} className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isCompleted = i < step;

            return (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                      isActive
                        ? "border-amber-400 bg-amber-400/20 text-amber-400"
                        : isCompleted
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-navy-600 bg-navy-800 text-foreground/40"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] mt-1.5 text-center hidden sm:block",
                      isActive ? "text-amber-400 font-medium" : "text-foreground/50"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-2 rounded-full transition-all",
                      i < step ? "bg-emerald-500" : "bg-navy-700"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Progress Bar */}
      <div className="w-full bg-navy-800 rounded-full h-1.5 mb-8">
        <motion.div
          className="bg-amber-400 h-1.5 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-6">
              {/* Step 1: Select Year */}
              {step === 0 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      Select Source Academic Year
                    </h3>
                    <p className="text-sm text-foreground/60">
                      Choose the academic year whose students you want to
                      promote.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Academic Year</Label>
                    <Select
                      value={selectedYearId}
                      onValueChange={setSelectedYearId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select academic year" />
                      </SelectTrigger>
                      <SelectContent>
                        {academicYears.map((y) => (
                          <SelectItem key={y.id} value={y.id}>
                            {y.name} {y.is_current ? "(Current)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedYearId && (
                    <div className="p-4 rounded-lg bg-navy-900/50">
                      <p className="text-sm text-foreground/60">
                        Students enrolled in the selected year will be promoted
                        to their next classes. The system will auto-suggest
                        destination classes based on naming patterns (e.g. P.1A
                        → P.2A).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Map Classes */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      Class Promotion Mapping
                    </h3>
                    <p className="text-sm text-foreground/60">
                      Review and adjust where each class will be promoted to.
                    </p>
                  </div>

                  {mappings.length === 0 ? (
                    <p className="text-center py-8 text-foreground/40">
                      No classes found.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="hidden sm:grid grid-cols-12 gap-3 px-3 text-xs font-medium text-foreground/60 uppercase">
                        <div className="col-span-4">Source Class</div>
                        <div className="col-span-1" />
                        <div className="col-span-4">Destination Class</div>
                        <div className="col-span-3 text-right">Students</div>
                      </div>

                      {mappings.map((m) => (
                        <div
                          key={m.source_class_id}
                          className={cn(
                            "grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 rounded-lg border",
                            m.student_count > 0
                              ? "bg-navy-900/50 border-navy-700"
                              : "bg-navy-900/20 border-navy-800 opacity-60"
                          )}
                        >
                          <div className="sm:col-span-4">
                            <span className="font-medium">
                              {m.source_class_name}
                            </span>
                          </div>

                          <div className="hidden sm:flex sm:col-span-1 justify-center">
                            <ArrowRight className="w-4 h-4 text-foreground/40" />
                          </div>

                          <div className="sm:col-span-4">
                            <Select
                              value={m.dest_class_id}
                              onValueChange={(v) =>
                                updateDestClass(m.source_class_id, v)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select destination" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Skip (No promotion)</SelectItem>
                                {classes
                                  .filter((c) => c.id !== m.source_class_id)
                                  .map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="sm:col-span-3 flex items-center justify-end gap-2">
                            <Users className="w-4 h-4 text-foreground/40" />
                            <span className="font-medium">
                              {m.student_count}
                            </span>
                            {m.student_count > 0 && !m.dest_class_id && (
                              <Badge variant="warning" className="text-[10px]">
                                No dest.
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Review */}
              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      Review Promotion
                    </h3>
                    <p className="text-sm text-foreground/60">
                      Verify the promotion details before confirming.
                    </p>
                  </div>

                  <div className="rounded-lg border border-navy-700 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-navy-800 border-b border-navy-700">
                          <th className="px-4 py-2 text-left text-xs font-medium text-foreground/60 uppercase">
                            From
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-foreground/60 uppercase">
                            To
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-foreground/60 uppercase">
                            Students
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-navy-700/50">
                        {mappings
                          .filter((m) => m.student_count > 0 && m.dest_class_id)
                          .map((m) => {
                            const destName =
                              classes.find((c) => c.id === m.dest_class_id)
                                ?.name || "Unknown";
                            return (
                              <tr key={m.source_class_id} className="bg-navy-900">
                                <td className="px-4 py-2 text-sm">
                                  {m.source_class_name}
                                </td>
                                <td className="px-4 py-2 text-sm">
                                  <span className="flex items-center gap-2">
                                    <ArrowRight className="w-3 h-3 text-amber-400" />
                                    {destName}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-sm text-right font-medium">
                                  {m.student_count}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4 rounded-lg bg-amber-400/5 border border-amber-400/10">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-400">
                          Important
                        </p>
                        <p className="text-sm text-foreground/60 mt-1">
                          This will update the class assignments for{" "}
                          <strong>
                            {mappings
                              .filter(
                                (m) => m.student_count > 0 && m.dest_class_id
                              )
                              .reduce((s, m) => s + m.student_count, 0)}
                          </strong>{" "}
                          students and create new class enrollments for the
                          current term. This action cannot be easily undone.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Buttons */}
      <motion.div
        {...fadeInUp}
        transition={{ delay: 0.15 }}
        className="flex items-center justify-between mt-6"
      >
        <Button
          variant="ghost"
          onClick={prevStep}
          disabled={step === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {step < 2 ? (
          <Button onClick={nextStep}>
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handlePromote} disabled={promoting}>
            {promoting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Promoting...
              </>
            ) : (
              <>
                <GraduationCap className="w-4 h-4 mr-2" />
                Confirm Promotion
              </>
            )}
          </Button>
        )}
      </motion.div>
    </div>
  );
}

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { invalidate } from "@/lib/query-keys";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import { normalizePhone, isValidUgandaPhone } from "@/lib/utils/phone";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  User,
  Phone,
  GraduationCap,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Upload,
  Camera,
  UserPlus,
} from "lucide-react";
import type { Class, Term, AcademicYear } from "@/types";

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

interface PersonalInfo {
  full_name: string;
  date_of_birth: string;
  gender: string;
  photo_url: string;
}

interface ParentInfo {
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  parent_relationship: string;
  parent_nid: string;
}

interface AcademicPlacement {
  class_id: string;
  enrollment_date: string;
  admission_number: string;
  auto_generate: boolean;
}

const STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Parent/Guardian", icon: Phone },
  { label: "Academic Placement", icon: GraduationCap },
  { label: "Review & Submit", icon: ClipboardCheck },
];

const RELATIONSHIPS = ["Father", "Mother", "Guardian", "Uncle", "Aunt", "Grandparent", "Sibling", "Other"];

export default function EnrollPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const currentAcademicYear = useSchoolStore((s) => s.currentAcademicYear);
  const supabase = useSupabaseBrowser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdStudent, setCreatedStudent] = useState<{
    id: string;
    admission_number: string;
    full_name: string;
  } | null>(null);

  const [personal, setPersonal] = useState<PersonalInfo>({
    full_name: "",
    date_of_birth: "",
    gender: "",
    photo_url: "",
  });

  const [parent, setParent] = useState<ParentInfo>({
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    parent_relationship: "",
    parent_nid: "",
  });

  const [academic, setAcademic] = useState<AcademicPlacement>({
    class_id: "",
    enrollment_date: new Date().toISOString().split("T")[0],
    admission_number: "",
    auto_generate: true,
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

// AP-1 fix: useQuery replaces useEffect+supabase direct calls
  const [ignoreClasses, setIgnoreClasses] = useState<Class[]>([]);
  const [ignoreTerms, setIgnoreTerms] = useState<(Term & { academic_years?: AcademicYear })[]>([]);

  // AP-1 fix: useQuery replaces useEffect+supabase direct calls
  const { data: classes = [] } = useQuery<{ id: string; name: string; level: string | null; stream: string | null }[]>({
    queryKey: ["classes"],
    queryFn: async () => {
      const res = await fetch("/api/classes", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load classes");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: terms = [] } = useQuery<{ id: string; name: string; is_current: boolean; start_date: string; end_date: string }[]>({
    queryKey: ["terms"],
    queryFn: async () => {
      const res = await fetch("/api/terms", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load terms");
      const json = await res.json();
      const list = json.data ?? [];
      return list;
    },
    staleTime: 2 * 60_000,
  });

  function validateStep(s: number): boolean {
    const newErrors: Record<string, string> = {};

    if (s === 0) {
      if (!personal.full_name.trim()) newErrors.full_name = "Full name is required";
      if (!personal.gender) newErrors.gender = "Gender is required";
    }

    if (s === 1) {
      if (!parent.parent_name.trim()) newErrors.parent_name = "Parent name is required";
      if (!parent.parent_phone.trim()) {
        newErrors.parent_phone = "Phone number is required";
      } else if (!isValidUgandaPhone(parent.parent_phone)) {
        newErrors.parent_phone = "Enter a valid Uganda phone number (e.g. 07XXXXXXXX)";
      }
      if (parent.parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.parent_email)) {
        newErrors.parent_email = "Enter a valid email address";
      }
    }

    if (s === 2) {
      if (!academic.class_id) newErrors.class_id = "Select a class";
      if (!academic.enrollment_date) newErrors.enrollment_date = "Enrollment date is required";
      if (!academic.auto_generate && !academic.admission_number.trim()) {
        newErrors.admission_number = "Admission number is required";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function nextStep() {
    if (!validateStep(step)) return;
    setDirection(1);
    setStep((s) => Math.min(s + 1, 3));
  }

  function prevStep() {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        let { width, height } = img;
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = URL.createObjectURL(file);
    });
  }

  function handleFileSelected(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    const previewUrl = URL.createObjectURL(file);
    setPersonal((p) => ({ ...p, photo_url: previewUrl }));
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadPhoto(studentId: string): Promise<string | null> {
    if (!photoFile || !school) return null;
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(photoFile);
      const filePath = `${school.id}/${studentId}.jpg`;
      const { error } = await supabase.storage
        .from("student-photos")
        .upload(filePath, compressed, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from("student-photos")
        .getPublicUrl(filePath);
      return urlData.publicUrl;
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
      return null;
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSubmit() {
    if (!school) return;
    setSaving(true);

    try {
      // Create student via API (handles enrollment + fee account creation)
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: personal.full_name.trim(),
          date_of_birth: personal.date_of_birth || undefined,
          gender: personal.gender || undefined,
          parent_name: parent.parent_name.trim(),
          parent_phone: parent.parent_phone,
          parent_email: parent.parent_email.trim() || undefined,
          parent_nid: parent.parent_nid.trim() || undefined,
          current_class_id: academic.class_id,
          enrollment_date: academic.enrollment_date,
          admission_number: academic.auto_generate ? undefined : academic.admission_number,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Enrollment failed");
      const student = result.data || result;

      // Upload photo if selected
      if (photoFile) {
        const photoUrl = await uploadPhoto(student.id);
        if (photoUrl) {
          await supabase.from("students").update({ photo_url: photoUrl }).eq("id", student.id);
          student.photo_url = photoUrl;
        }
      }

      setCreatedStudent(student);
      setSuccess(true);
      toast({
        title: "Student Enrolled",
        description: `${student.full_name} (${student.admission_number}) has been enrolled successfully.`,
        variant: "success",
      });
      // Cross-page invalidation so the new student appears on:
      //   - the students directory list
      //   - the classes roster (roster counts)
      //   - the dashboard "Students" KPI
      //   - the fees defaulters & accounts (a fee account was created)
      // Audit (Bug #4 + #5): scope the cascade to the current school
      // using the centralised invalidator. Without school.id in the
      // key, a SUPER_ADMIN enrolling a student in school B would
      // have school A's cache invalidated too.
      if (school?.id) {
        invalidate.studentEnrolled(queryClient, school.id);
      } else {
        queryClient.invalidateQueries({ queryKey: ["students"] });
        queryClient.invalidateQueries({ queryKey: ["classes"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["fee-defaulters"] });
        queryClient.invalidateQueries({ queryKey: ["fees-index"] });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Enrollment Failed", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function getSelectedClassName() {
    return classes.find((c) => c.id === academic.class_id)?.name || "Not selected";
  }

  // Success state
  if (success && createdStudent) {
    return (
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-success-500 bg-success-100">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-success-700" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Enrollment Successful</h2>
              <p className="text-heading mb-6">
                The student has been enrolled and their fee account has been set up.
              </p>

              <div className="bg-bg-tertiary rounded-lg p-4 text-left space-y-2 mb-6">
                <div className="flex justify-between">
                  <span className="text-heading">Name</span>
                  <span className="font-medium">{createdStudent.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-heading">Admission No.</span>
                  <span className="font-medium font-mono text-secondary">
                    {createdStudent.admission_number}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-heading">Class</span>
                  <span className="font-medium">{getSelectedClassName()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-heading">Enrolled</span>
                  <span className="font-medium">
                    {formatDate(academic.enrollment_date)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push(`/dashboard/students/${createdStudent.id}`)}
                >
                  View Profile
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setSuccess(false);
                    setCreatedStudent(null);
                    setStep(0);
                    setPersonal({ full_name: "", date_of_birth: "", gender: "", photo_url: "" });
                    setParent({ parent_name: "", parent_phone: "", parent_email: "", parent_relationship: "", parent_nid: "" });
                    setPhotoFile(null);
                    setErrors({});
                  }}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Enroll Another
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page Header */}
      <motion.div {...fadeInUp} className="mb-8">
        <h1 className="text-2xl font-bold">Enroll New Student</h1>
        <p className="text-heading text-sm">
          Complete the steps below to enroll a new student.
        </p>
      </motion.div>

      {/* Step Indicators */}
      <motion.div {...fadeInUp} transition={{ delay: 0.1 }} className="mb-8">
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
                        ? "border-warning-500 bg-warning-100 text-warning-700"
                        : isCompleted
                        ? "border-success-500 bg-success-100 text-success-700"
                        : "border-border bg-bg-tertiary text-text-muted"
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
                      isActive ? "text-secondary font-medium" : "text-heading"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-2 rounded-full transition-all",
                      i < step ? "bg-bg-tertiary" : "bg-bg-tertiary"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Progress Bar */}
      <div className="w-full bg-bg-tertiary rounded-full h-1.5 mb-8">
        <motion.div
          className="bg-bg-tertiary h-1.5 rounded-full"
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
          <Card className="bg-card">
            <CardContent className="p-6">
              {/* Step 1: Personal Info */}
              {step === 0 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Personal Information</h3>
                    <p className="text-sm text-heading">
                      Enter the student's basic details.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      placeholder="e.g. John Mukasa"
                      value={personal.full_name}
                      onChange={(e) =>
                        setPersonal((p) => ({ ...p, full_name: e.target.value }))
                      }
                      className={errors.full_name ? "border-border" : ""}
                    />
                    {errors.full_name && (
                      <p className="text-xs text-secondary">{errors.full_name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dob">Date of Birth</Label>
                      <Input
                        id="dob"
                        type="date"
                        value={personal.date_of_birth}
                        onChange={(e) =>
                          setPersonal((p) => ({
                            ...p,
                            date_of_birth: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Gender *</Label>
                      <Select
                        value={personal.gender}
                        onValueChange={(v) =>
                          setPersonal((p) => ({ ...p, gender: v }))
                        }
                      >
                        <SelectTrigger
                          className={errors.gender ? "border-border" : ""}
                        >
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.gender && (
                        <p className="text-xs text-secondary">{errors.gender}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Photo (Optional)</Label>
                    <div
                      className={cn(
                        "relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed transition-colors cursor-pointer",
                        isDragging
                          ? "border-border bg-warning-50"
                          : "border-border bg-bg-tertiary hover:border-border"
                      )}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelected(file);
                        }}
                      />
                      {personal.photo_url ? (
                        <div className="flex items-center gap-4">
                          <img
                            src={personal.photo_url}
                            alt="Preview"
                            className="w-20 h-20 rounded-xl object-cover border border-border"
                          />
                          <div className="text-left">
                            <p className="text-sm font-medium text-heading">
                              {photoFile?.name || "Photo selected"}
                            </p>
                            <p className="text-xs text-heading">
                              Click or drop to replace
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center">
                            {uploadingPhoto ? (
                              <Loader2 className="w-8 h-8 text-secondary animate-spin" />
                            ) : (
                              <Camera className="w-8 h-8 text-heading" />
                            )}
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-heading">
                              <span className="text-secondary font-medium">Click to upload</span> or drag & drop
                            </p>
                            <p className="text-xs text-heading mt-1">
                              JPG, PNG up to 5MB - auto-compressed to 800px
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Parent/Guardian Info */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Parent / Guardian</h3>
                    <p className="text-sm text-heading">
                      Contact details for the student's parent or guardian.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="parent_name">Full Name *</Label>
                    <Input
                      id="parent_name"
                      placeholder="e.g. James Mukasa"
                      value={parent.parent_name}
                      onChange={(e) =>
                        setParent((p) => ({ ...p, parent_name: e.target.value }))
                      }
                      className={errors.parent_name ? "border-border" : ""}
                    />
                    {errors.parent_name && (
                      <p className="text-xs text-secondary">{errors.parent_name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="parent_phone">Phone Number *</Label>
                      <Input
                        id="parent_phone"
                        placeholder="07XXXXXXXX"
                        value={parent.parent_phone}
                        onChange={(e) =>
                          setParent((p) => ({
                            ...p,
                            parent_phone: e.target.value,
                          }))
                        }
                        className={errors.parent_phone ? "border-border" : ""}
                      />
                      {errors.parent_phone && (
                        <p className="text-xs text-secondary">
                          {errors.parent_phone}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="parent_email">Email (Optional)</Label>
                      <Input
                        id="parent_email"
                        type="email"
                        placeholder="parent@example.com"
                        value={parent.parent_email}
                        onChange={(e) =>
                          setParent((p) => ({
                            ...p,
                            parent_email: e.target.value,
                          }))
                        }
                        className={errors.parent_email ? "border-border" : ""}
                      />
                      {errors.parent_email && (
                        <p className="text-xs text-secondary">
                          {errors.parent_email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Relationship</Label>
                      <Select
                        value={parent.parent_relationship}
                        onValueChange={(v) =>
                          setParent((p) => ({ ...p, parent_relationship: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select relationship" />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIPS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="parent_nid">National ID (Optional)</Label>
                      <Input
                        id="parent_nid"
                        placeholder="NIN number"
                        value={parent.parent_nid}
                        onChange={(e) =>
                          setParent((p) => ({ ...p, parent_nid: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Academic Placement */}
              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Academic Placement</h3>
                    <p className="text-sm text-heading">
                      Assign the student to a class and set enrollment details.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Class *</Label>
                    <Select
                      value={academic.class_id}
                      onValueChange={(v) =>
                        setAcademic((a) => ({ ...a, class_id: v }))
                      }
                    >
                      <SelectTrigger
                        className={errors.class_id ? "border-border" : ""}
                      >
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
                    {errors.class_id && (
                      <p className="text-xs text-secondary">{errors.class_id}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="enrollment_date">Enrollment Date *</Label>
                    <Input
                      id="enrollment_date"
                      type="date"
                      value={academic.enrollment_date}
                      onChange={(e) =>
                        setAcademic((a) => ({
                          ...a,
                          enrollment_date: e.target.value,
                        }))
                      }
                      className={errors.enrollment_date ? "border-border" : ""}
                    />
                    {errors.enrollment_date && (
                      <p className="text-xs text-secondary">
                        {errors.enrollment_date}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="auto_generate"
                        checked={academic.auto_generate}
                        onChange={(e) =>
                          setAcademic((a) => ({
                            ...a,
                            auto_generate: e.target.checked,
                          }))
                        }
                        className="rounded border-border"
                      />
                      <Label htmlFor="auto_generate" className="cursor-pointer">
                        Auto-generate admission number
                      </Label>
                    </div>

                    {!academic.auto_generate && (
                      <div className="space-y-2">
                        <Label htmlFor="admission_no">Admission Number *</Label>
                        <Input
                          id="admission_no"
                          placeholder="e.g. STU-0001"
                          value={academic.admission_number}
                          onChange={(e) =>
                            setAcademic((a) => ({
                              ...a,
                              admission_number: e.target.value,
                            }))
                          }
                          className={
                            errors.admission_number ? "border-border" : ""
                          }
                        />
                        {errors.admission_number && (
                          <p className="text-xs text-secondary">
                            {errors.admission_number}
                          </p>
                        )}
                      </div>
                    )}

                    {academic.auto_generate && (
                      <div className="p-3 rounded-lg bg-bg-tertiary flex items-center gap-2">
                        <span className="text-sm text-heading">
                          Admission No:
                        </span>
                        <span className="font-mono text-secondary font-medium">
                          {academic.admission_number}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Review & Submit */}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Review & Submit</h3>
                    <p className="text-sm text-heading">
                      Verify the information below before completing enrollment.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-bg-tertiary space-y-2">
                      <h4 className="text-sm font-medium text-secondary flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Personal Information
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-heading">Name</span>
                        <span>{personal.full_name}</span>
                        <span className="text-heading">Gender</span>
                        <span className="capitalize">{personal.gender || "Not set"}</span>
                        <span className="text-heading">Date of Birth</span>
                        <span>
                          {personal.date_of_birth
                            ? formatDate(personal.date_of_birth)
                            : "Not set"}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-bg-tertiary space-y-2">
                      <h4 className="text-sm font-medium text-secondary flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Parent / Guardian
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-heading">Name</span>
                        <span>{parent.parent_name}</span>
                        <span className="text-heading">Phone</span>
                        <span>{parent.parent_phone}</span>
                        <span className="text-heading">Relationship</span>
                        <span>{parent.parent_relationship || "Not set"}</span>
                        {parent.parent_email && (
                          <>
                            <span className="text-heading">Email</span>
                            <span>{parent.parent_email}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-bg-tertiary space-y-2">
                      <h4 className="text-sm font-medium text-secondary flex items-center gap-2">
                        <GraduationCap className="w-4 h-4" />
                        Academic Placement
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-heading">Class</span>
                        <span>{getSelectedClassName()}</span>
                        <span className="text-heading">Admission No.</span>
                        <span className="font-mono text-secondary">
                          {academic.admission_number}
                        </span>
                        <span className="text-heading">Enrollment Date</span>
                        <span>{formatDate(academic.enrollment_date)}</span>
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
        transition={{ delay: 0.2 }}
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

        {step < 3 ? (
          <Button onClick={nextStep}>
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enrolling...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete Enrollment
              </>
            )}
          </Button>
        )}
      </motion.div>
    </div>
  );
}

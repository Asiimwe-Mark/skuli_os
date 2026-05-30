"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import { formatUGX } from "@/lib/utils/currency";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  GraduationCap,
  Search,
  UserPlus,
  Download,
  Send,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  ArrowUpRight,
  Columns3,
  AlertTriangle,
} from "lucide-react";
import type { Student, Class } from "@/types";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

interface StudentRow extends Omit<Student, 'current_class' | 'fee_account'> {
  current_class?: { id: string; name: string } | null;
  fee_account?: { status: string; balance: number } | null;
}

export default function StudentsPage() {
  const router = useRouter();
  const { school } = useSchoolStore();
  const { canEditStudents, canViewFees, canSendSMS } = usePermissions();
  const supabase = createBrowserClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Filters
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [sortBy, setSortBy] = useState<string>("full_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [disciplineCounts, setDisciplineCounts] = useState<Record<string, number>>({});
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {
      full_name: true, admission_number: true, class: true,
      parent_phone: true, fee: true, enrollment_date: true,
    };
    const saved = localStorage.getItem("skuli-student-columns");
    return saved ? JSON.parse(saved) : {
      full_name: true, admission_number: true, class: true,
      parent_phone: true, fee: true, enrollment_date: true,
    };
  });

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("skuli-student-columns", JSON.stringify(next));
      return next;
    });
  }

  const columnDefs = [
    { key: "full_name", label: "Student" },
    { key: "admission_number", label: "Adm. No." },
    { key: "class", label: "Class" },
    { key: "parent_phone", label: "Parent Phone" },
    { key: "fee", label: "Fee Status" },
    { key: "enrollment_date", label: "Enrolled" },
  ];

  const loadStudents = useCallback(async () => {
    if (!school) return;
    setLoading(true);

    let query = supabase
      .from("students")
      .select("*, current_class:classes(id, name)", { count: "exact" })
      .eq("school_id", school.id)
      .eq("is_deleted", false);

    // Search filter
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,admission_number.ilike.%${search}%,parent_phone.ilike.%${search}%`
      );
    }

    // Class filter
    if (classFilter !== "all") {
      query = query.eq("current_class_id", classFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    // Gender filter
    if (genderFilter !== "all") {
      query = query.eq("gender", genderFilter);
    }

    // Sort
    query = query.order(sortBy, { ascending: sortDir === "asc" });

    // Pagination
    query = query.range(page * pageSize, (page + 1) * pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load students.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Load fee accounts for these students
    const studentIds = (data || []).map((s: { id: string }) => s.id);
    let feeMap: Record<string, { status: string; balance: number }> = {};

    if (studentIds.length > 0 && canViewFees) {
      const { data: feeData } = await supabase
        .from("fee_accounts")
        .select("student_id, status, balance")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false });

      if (feeData) {
        // Keep only the latest account per student
        for (const fa of feeData) {
          if (!feeMap[fa.student_id]) {
            feeMap[fa.student_id] = { status: fa.status, balance: fa.balance };
          }
        }
      }
    }

    const enriched: StudentRow[] = (data || []).map((s: { id: string } & Record<string, unknown>) => ({
      ...s as any,
      fee_account: feeMap[s.id] || null,
    }));

    setStudents(enriched);
    setTotalCount(count || 0);
    setLoading(false);
  }, [school, search, classFilter, statusFilter, genderFilter, sortBy, sortDir, page, pageSize, supabase, canViewFees, toast]);

  useEffect(() => {
    document.title = "Students | SKULI";
  }, []);

  useEffect(() => {
    async function loadClasses() {
      if (!school) return;
      const { data } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", school.id)
        .eq("is_deleted", false)
        .order("name");

      if (data) setClasses(data);
    }

    loadClasses();
  }, [school, supabase]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // Fetch discipline incident counts for visible students
  useEffect(() => {
    if (!school || students.length === 0) {
      setDisciplineCounts({});
      return;
    }

    const studentIds = students.map((s) => s.id);

    async function fetchCounts() {
      const { data } = await supabase
        .from("discipline_records")
        .select("student_id")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .in("student_id", studentIds);

      if (data) {
        const counts: Record<string, number> = {};
        for (const row of data) {
          counts[row.student_id] = (counts[row.student_id] || 0) + 1;
        }
        setDisciplineCounts(counts);
      }
    }

    fetchCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, school]);

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function getFeeBadge(status: string | null, balance: number | null) {
    if (!status) return <Badge variant="secondary">N/A</Badge>;
    switch (status) {
      case "paid":
        return <Badge variant="success">Paid</Badge>;
      case "partial":
        return (
          <Badge variant="warning">
            Partial {balance ? `(${formatUGX(balance)})` : ""}
          </Badge>
        );
      case "unpaid":
        return (
          <Badge variant="destructive">
            Unpaid {balance ? `(${formatUGX(balance)})` : ""}
          </Badge>
        );
      case "overpaid":
        return <Badge variant="default">Overpaid</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function handleExportCSV() {
    if (students.length === 0) return;

    const headers = [
      "Admission No",
      "Full Name",
      "Gender",
      "Class",
      "Parent Name",
      "Parent Phone",
      "Enrollment Date",
      "Status",
    ];
    const rows = students.map((s) => [
      s.admission_number,
      s.full_name,
      s.gender || "",
      s.current_class?.name || "",
      s.parent_name,
      s.parent_phone,
      s.enrollment_date,
      s.status,
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: `${students.length} students exported to CSV.`,
      variant: "success",
    });
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        {...fadeInUp}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold">Students</h1>
          <p className="text-foreground/60 text-sm">
            {totalCount} {totalCount === 1 ? "student" : "students"} enrolled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColumnsOpen((o) => !o)}
            >
              <Columns3 className="w-4 h-4 mr-2" />
              Columns
            </Button>
            {columnsOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-navy-700 bg-navy-800 p-3 shadow-lg">
                <p className="text-xs font-medium text-foreground/60 mb-2">Toggle columns</p>
                <div className="space-y-2">
                  {columnDefs.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[col.key] !== false}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded border-navy-600"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="w-4 h-4 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push("/dashboard/students/promote")}>
                <ArrowUpRight className="w-4 h-4 mr-2" />
                Promote Students
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
              {canSendSMS && (
                <DropdownMenuItem
                  onClick={() =>
                    router.push("/dashboard/communication/compose")
                  }
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Bulk SMS
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {canEditStudents && (
            <Button onClick={() => router.push("/dashboard/students/enroll")}>
              <UserPlus className="w-4 h-4 mr-2" />
              Enroll Student
            </Button>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
        <Card className="border-border-subtle bg-surface">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                <Input
                  placeholder="Search by name, admission no., or phone..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Class Filter */}
                <Select
                  value={classFilter}
                  onValueChange={(v) => {
                    setClassFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status Filter */}
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="graduated">Graduated</SelectItem>
                  </SelectContent>
                </Select>

                {/* Gender Filter */}
                <Select
                  value={genderFilter}
                  onValueChange={(v) => {
                    setGenderFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="All Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Gender</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && students.length === 0 && (
        <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
          <EmptyState
            icon={GraduationCap}
            title={search || classFilter !== "all" || statusFilter !== "all" || genderFilter !== "all"
              ? "No students match your filters"
              : "No students yet"}
            description={
              search || classFilter !== "all" || statusFilter !== "all" || genderFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Enroll your first student to get started with student management."
            }
            action={
              !search && classFilter === "all" && statusFilter === "all" && genderFilter === "all" && canEditStudents ? (
                <Button onClick={() => router.push("/dashboard/students/enroll")}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Enroll First Student
                </Button>
              ) : undefined
            }
          />
        </motion.div>
      )}

      {/* Student Table */}
      {!loading && students.length > 0 && (
        <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
          <div className="rounded-xl border border-navy-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-navy-800 border-b border-navy-700">
                    {columnDefs.filter((col) => visibleColumns[col.key] !== false).map((col) => (
                      <th
                        key={col.key}
                        className={cn(
                          "px-4 py-3 text-left text-xs font-medium text-foreground/60 uppercase tracking-wider",
                          col.key !== "fee" && "cursor-pointer hover:text-foreground"
                        )}
                        onClick={() => col.key !== "fee" && handleSort(col.key)}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {sortBy === col.key && (
                            <ArrowUpDown className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700/50">
                  {students.map((student) => (
                    <tr
                      key={student.id}
                      className="bg-navy-900 hover:bg-navy-800/50 transition-colors cursor-pointer"
                      onClick={() =>
                        router.push(`/dashboard/students/${student.id}`)
                      }
                    >
                      {/* Student */}
                      {visibleColumns.full_name !== false && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {student.photo_url ? (
                            <img
                              src={student.photo_url}
                              alt={student.full_name}
                              className="w-9 h-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
                              {getInitials(student.full_name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">
                                {student.full_name}
                              </p>
                              {(disciplineCounts[student.id] || 0) >= 3 && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-amber-500 text-amber-600 bg-amber-50 text-[10px] px-1.5 py-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/dashboard/students/${student.id}?tab=discipline`);
                                  }}
                                >
                                  <AlertTriangle className="w-3 h-3 mr-0.5" />
                                  {disciplineCounts[student.id]} incidents
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-foreground/50 capitalize">
                              {student.gender || "---"}
                            </p>
                          </div>
                        </div>
                      </td>
                      )}

                      {/* Admission No */}
                      {visibleColumns.admission_number !== false && (
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-amber-400">
                          {student.admission_number}
                        </span>
                      </td>
                      )}

                      {/* Class */}
                      {visibleColumns.class !== false && (
                      <td className="px-4 py-3">
                        <span className="text-sm">
                          {student.current_class?.name || "---"}
                        </span>
                      </td>
                      )}

                      {/* Parent Phone */}
                      {visibleColumns.parent_phone !== false && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground/70">
                          {formatPhoneDisplay(student.parent_phone)}
                        </span>
                      </td>
                      )}

                      {/* Fee Status */}
                      {visibleColumns.fee !== false && (
                      <td className="px-4 py-3">
                        {canViewFees ? (
                          getFeeBadge(
                            student.fee_account?.status || null,
                            student.fee_account?.balance || null
                          )
                        ) : (
                          <span className="text-sm text-foreground/40">---</span>
                        )}
                      </td>
                      )}

                      {/* Enrollment Date */}
                      {visibleColumns.enrollment_date !== false && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground/70">
                          {formatDate(student.enrollment_date)}
                        </span>
                      </td>
                      )}

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/dashboard/students/${student.id}`);
                              }}
                            >
                              View Profile
                            </DropdownMenuItem>
                            {canEditStudents && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(
                                    `/dashboard/students/${student.id}?tab=edit`
                                  );
                                }}
                              >
                                Edit Student
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-foreground/60">
                Showing {page * pageSize + 1} to{" "}
                {Math.min((page + 1) * pageSize, totalCount)} of {totalCount}{" "}
                students
              </p>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-[90px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-foreground/70">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

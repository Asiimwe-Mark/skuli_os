"use client";

import { useEffect, useState, useCallback, useMemo} from "react";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatDate, todayLocalISODate } from "@/lib/utils/dates";
import { formatUGX } from "@/lib/utils/currency";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import { toCsv } from "@/lib/utils/csv";
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
import type { Student, Class, StudentStatus } from "@/types";
import type { Tables } from "@/types/database";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

interface StudentRow extends Tables<"students"> {
  current_class?: { id: string; name: string } | null;
  fee_account?: { status: string; balance: number } | null;
}

export default function StudentsPage() {
  useDocumentTitle("Students");
  const router = useRouter();
  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { canEditStudents, canViewFees, canSendSMS } = usePermissions();
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Filters
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [sortBy, setSortBy] = useState<string>("full_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
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

  // The students directory + class filter dropdown are now powered by
  // react-query so a successful enroll/POST elsewhere in the app
  // (e.g. /students/enroll) refetches both lists automatically — no
  // hard refresh required. The query key is a tuple of every filter
  // the URL is implicitly carrying, plus school+term, so changes to
  // any of them trigger a fresh fetch.
  const studentsQuery = useQuery({
    queryKey: [
      "students",
      school?.id,
      currentTerm?.id,
      search,
      classFilter,
      statusFilter,
      genderFilter,
      sortBy,
      sortDir,
      page,
      pageSize,
    ],
    enabled: !!school?.id,
    queryFn: async (): Promise<{ students: StudentRow[]; total: number }> => {
      let query = supabase
        .from("students")
        .select(
          "id, school_id, full_name, gender, photo_url, admission_number, parent_name, parent_phone, parent_email, parent_nid, enrollment_date, date_of_birth, status, exit_date, current_class_id, created_at, updated_at, is_deleted, current_class:classes(id, name)",
          { count: "exact" }
        )
        .eq("school_id", school!.id)
        .eq("is_deleted", false);

      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,admission_number.ilike.%${search}%,parent_phone.ilike.%${search}%`
        );
      }
      if (classFilter !== "all") query = query.eq("current_class_id", classFilter);
      // Audit 2.5: previously `statusFilter as any` — cast hid type
      // mismatches. Now narrowed to StudentStatus so a stray
      // statusFilter value ("foo") would fail the build, not silently
      // produce a query that returns nothing.
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as StudentStatus);
      }
      if (genderFilter !== "all") query = query.eq("gender", genderFilter);

      query = query.order(sortBy, { ascending: sortDir === "asc" });
      query = query.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      const studentIds = (data || []).map((s: { id: string }) => s.id);
      let feeMap: Record<string, { status: string; balance: number }> = {};

      if (studentIds.length > 0 && canViewFees) {
        const { data: feeData } = await supabase
          .from("fee_accounts")
          .select("student_id, status, balance, term_id")
          .in("student_id", studentIds)
          .eq("term_id", currentTerm?.id ?? "")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false });

        if (feeData) {
          for (const fa of feeData) {
            if (!feeMap[fa.student_id]) {
              feeMap[fa.student_id] = { status: fa.status, balance: fa.balance };
            }
          }
        }
      }

      const enriched: StudentRow[] = (data ?? []).map((s: Tables<"students">) => ({
        ...s,
        fee_account: feeMap[s.id] || null,
      }));
      return { students: enriched, total: count || 0 };
    },
  });

  const classesQuery = useQuery({
    queryKey: ["classes", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, school_id, level, stream, capacity, class_teacher_id")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Class[];
    },
  });

  const students = studentsQuery.data?.students ?? [];
  const totalCount = studentsQuery.data?.total ?? 0;
  const classes = classesQuery.data ?? [];
  const loading = studentsQuery.isLoading || classesQuery.isLoading;

  // Audit 2.4: discipline counts were fetched in a useEffect that
  // depended on the rendered `students` array. useQuery returns the
  // same array reference between renders so the effect's dep was
  // reference-equal and the effect didn't refire on page change. The
  // counts shown for page 2 students were always 0.
  //
  // The fix is to make discipline counts a proper useQuery whose
  // queryKey is the sorted student-id list of the current page. When
  // the page changes, the key changes, the query refires. The
  // `enabled` gate is the same — if there are no visible students,
  // there's nothing to count.
  const visibleStudentIds = useMemo(
    () => students.map((s) => s.id).sort(),
    [students],
  );
  const disciplineCountsQuery = useQuery({
    queryKey: ["discipline-counts", school?.id, visibleStudentIds],
    enabled: !!school?.id && visibleStudentIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("discipline_records")
        .select("student_id")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .in("student_id", visibleStudentIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.student_id] = (counts[row.student_id] || 0) + 1;
      }
      return counts;
    },
  });
  const disciplineCounts = disciplineCountsQuery.data ?? {};

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

    const csv = toCsv([headers, ...rows]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-${todayLocalISODate()}.csv`;
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
          <p className="text-heading text-sm">
            {totalCount} {totalCount === 1 ? "student" : "students"} enrolled
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-border bg-card p-3 shadow-lg">
                <p className="text-xs font-medium text-heading mb-2">Toggle columns</p>
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
                        className="rounded border-border"
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
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-0 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-heading" />
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

              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                {/* Class Filter */}
                <Select
                  value={classFilter}
                  onValueChange={(v) => {
                    setClassFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[150px]">
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
                  <SelectTrigger className="w-full sm:w-[130px]">
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
                  <SelectTrigger className="w-full sm:w-[130px]">
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
            <Skeleton key={`skeleton-i`} className="h-14 rounded-lg" />
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
          <div className="rounded-xl border border-border overflow-hidden table-mobile-cards">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bg-tertiary border-b border-border">
                    {columnDefs.filter((col) => visibleColumns[col.key] !== false).map((col) => (
                      <th
                        key={col.key}
                        className={cn(
                          "px-4 py-3 text-left text-xs font-medium text-heading uppercase tracking-wider",
                          col.key !== "fee" && "cursor-pointer hover:text-heading"
                        )}
                        onClick={() => col.key !== "fee" && handleSort(col.key)}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {sortBy === col.key && (
                            <ArrowUpDown className="w-3 h-3 text-text-heading" />
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {students.map((student, i) => (
                    <motion.tr
                      key={student.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.3) }}
                      // Audit 10.4: the row is clickable but had no
                      // keyboard entry point. Tabbing through the
                      // page skipped every student. Add tabIndex so
                      // each row is focusable, onKeyDown for Enter
                      // and Space, and role="link" so screen readers
                      // announce it as a navigable element. The
                      // focus:ring/inset styles give a visible
                      // focus indicator in both light and dark mode.
                      tabIndex={0}
                      role="link"
                      aria-label={`Open ${student.full_name}'s profile`}
                      className="bg-bg-tertiary hover:bg-card-hover focus:bg-card-hover focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500 transition-colors cursor-pointer"
                      onClick={() =>
                        router.push(`/dashboard/students/${student.id}`)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/dashboard/students/${student.id}`);
                        }
                      }}
                    >
                      {/* Student */}
                      {visibleColumns.full_name !== false && (
                      <td className="px-4 py-3" data-label="Student">
                        <div className="flex items-center gap-3">
                          {student.photo_url ? (
                            <img
                              src={student.photo_url}
                              alt={student.full_name}
                              className="w-9 h-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-warning-100 text-warning-700 flex items-center justify-center text-xs font-bold shrink-0">
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
                                  className="shrink-0 border-border text-warning-600 bg-warning-50 text-[10px] px-1.5 py-0"
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
                            <p className="text-xs text-heading capitalize">
                              {student.gender || "---"}
                            </p>
                          </div>
                        </div>
                      </td>
                      )}

                      {/* Admission No */}
                      {visibleColumns.admission_number !== false && (
                      <td className="px-4 py-3" data-label="Adm. No.">
                        <span className="text-sm font-mono text-text-heading">
                          {student.admission_number}
                        </span>
                      </td>
                      )}

                      {/* Class */}
                      {visibleColumns.class !== false && (
                      <td className="px-4 py-3" data-label="Class">
                        <span className="text-sm">
                          {student.current_class?.name || "---"}
                        </span>
                      </td>
                      )}

                      {/* Parent Phone */}
                      {visibleColumns.parent_phone !== false && (
                      <td className="px-4 py-3" data-label="Parent Phone">
                        <span className="text-sm text-heading">
                          {student.parent_phone ? formatPhoneDisplay(student.parent_phone) : "—"}
                        </span>
                      </td>
                      )}

                      {/* Fee Status */}
                      {visibleColumns.fee !== false && (
                      <td className="px-4 py-3" data-label="Fee Status">
                        {canViewFees ? (
                          getFeeBadge(
                            student.fee_account?.status || null,
                            student.fee_account?.balance || null
                          )
                        ) : (
                          <span className="text-sm text-heading">---</span>
                        )}
                      </td>
                      )}

                      {/* Enrollment Date */}
                      {visibleColumns.enrollment_date !== false && (
                      <td className="px-4 py-3" data-label="Enrolled">
                        <span className="text-sm text-heading">
                          {formatDate(student.enrollment_date)}
                        </span>
                      </td>
                      )}

                      {/* Actions */}
                      <td className="px-4 py-3" data-label="Actions">
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
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-heading">
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
                <SelectTrigger className="w-full sm:w-[90px] h-8 text-xs">
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
                <span className="text-sm text-heading">
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

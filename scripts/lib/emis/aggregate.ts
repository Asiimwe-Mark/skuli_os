import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export interface EmisClassRow {
  className: string;
  boys: number;
  girls: number;
  total: number;
}

export interface EmisAgeRow {
  bracket: string;
  boys: number;
  girls: number;
  total: number;
}

export interface EmisData {
  school: {
    name: string;
    district: string;
    schoolCode: string;
    schoolType: string;
    subscriptionPlan: string;
  };
  enrolmentByClass: EmisClassRow[];
  enrolmentByAge: EmisAgeRow[];
  staff: {
    totalActive: number;
    qualifiedTeachers: number;
    teacherPupilRatio: string;
  };
  attendance: {
    daysPresent: number;
    daysPossible: number;
    rate: number;
  };
  totals: { boys: number; girls: number; total: number };
  termName: string;
}

const AGE_BRACKETS: { label: string; min: number; max: number }[] = [
  { label: "<6", min: 0, max: 5 },
  { label: "6-8", min: 6, max: 8 },
  { label: "9-11", min: 9, max: 11 },
  { label: "12-14", min: 12, max: 14 },
  { label: "15-17", min: 15, max: 17 },
  { label: "18+", min: 18, max: 200 },
];

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function normGender(g: string | null): "boy" | "girl" | null {
  if (!g) return null;
  const v = g.toLowerCase();
  if (v.startsWith("m") || v === "boy") return "boy";
  if (v.startsWith("f") || v === "girl") return "girl";
  return null;
}

/**
 * Aggregate EMIS enrolment data for a school. Designed to degrade gracefully:
 * missing optional data simply yields zeroes rather than throwing.
 */
export async function aggregateEmisData(
  supabase: SupabaseClient<Database>,
  schoolId: string,
  termId?: string
): Promise<EmisData> {
  // Section A — school identification
  const { data: school } = await supabase
    .from("schools")
    .select("name, district, school_code, school_type, subscription_plan")
    .eq("id", schoolId)
    .maybeSingle();

  // Term name (best-effort)
  let termName = "Current Term";
  if (termId) {
    const { data: term } = await supabase.from("terms").select("name").eq("id", termId).maybeSingle();
    if (term?.name) termName = term.name;
  }

  // Students with class + gender + dob
  const { data: students } = await supabase
    .from("students")
    .select("id, gender, date_of_birth, current_class:classes(name)")
    .eq("school_id", schoolId)
    .eq("status", "active");

  const studentList = (students ?? []) as Array<{
    id: string;
    gender: string | null;
    date_of_birth: string | null;
    current_class: { name: string } | { name: string }[] | null;
  }>;

  // Section B — by class & gender
  const classMap = new Map<string, { boys: number; girls: number }>();
  // Section C — by age bracket
  const ageMap = new Map<string, { boys: number; girls: number }>();
  for (const b of AGE_BRACKETS) ageMap.set(b.label, { boys: 0, girls: 0 });

  let totalBoys = 0;
  let totalGirls = 0;

  for (const s of studentList) {
    const cls = Array.isArray(s.current_class) ? s.current_class[0] : s.current_class;
    const className = cls?.name ?? "Unassigned";
    const g = normGender(s.gender);
    if (!classMap.has(className)) classMap.set(className, { boys: 0, girls: 0 });
    const entry = classMap.get(className)!;
    if (g === "boy") {
      entry.boys++;
      totalBoys++;
    } else if (g === "girl") {
      entry.girls++;
      totalGirls++;
    }

    const age = ageFromDob(s.date_of_birth);
    if (age !== null) {
      const bracket = AGE_BRACKETS.find((b) => age >= b.min && age <= b.max);
      if (bracket) {
        const ae = ageMap.get(bracket.label)!;
        if (g === "boy") ae.boys++;
        else if (g === "girl") ae.girls++;
      }
    }
  }

  const enrolmentByClass: EmisClassRow[] = Array.from(classMap.entries())
    .map(([className, v]) => ({ className, boys: v.boys, girls: v.girls, total: v.boys + v.girls }))
    .sort((a, b) => a.className.localeCompare(b.className));

  const enrolmentByAge: EmisAgeRow[] = AGE_BRACKETS.map((b) => {
    const v = ageMap.get(b.label)!;
    return { bracket: b.label, boys: v.boys, girls: v.girls, total: v.boys + v.girls };
  });

  // Section D — staff statistics (best-effort: staff table may not exist on all installs)
  let totalActive = 0;
  let qualifiedTeachers = 0;
  try {
    const { data: staff } = await supabase
      .from("staff")
      .select("id, role_title, is_active")
      .eq("school_id", schoolId)
      .eq("is_active", true);
    const staffList = (staff ?? []) as Array<{ role_title: string | null }>;
    totalActive = staffList.length;
    qualifiedTeachers = staffList.filter((s) =>
      (s.role_title ?? "").toLowerCase().includes("teacher")
    ).length;
  } catch {
    // staff table unavailable — leave zeroes
  }

  const totalStudents = totalBoys + totalGirls;
  const ratio = qualifiedTeachers > 0 ? Math.round(totalStudents / qualifiedTeachers) : 0;

  // Section E — attendance summary (best-effort)
  let daysPresent = 0;
  let daysPossible = 0;
  try {
    let q = supabase
      .from("attendance_records")
      .select("status", { count: "exact" })
      .eq("school_id", schoolId);
    if (termId) q = q.eq("term_id", termId);
    const { data: records } = await q.limit(100000);
    const recs = (records ?? []) as Array<{ status: string | null }>;
    daysPossible = recs.length;
    daysPresent = recs.filter((r) => (r.status ?? "").toLowerCase() === "present").length;
  } catch {
    // attendance unavailable
  }

  const rate = daysPossible > 0 ? Math.round((daysPresent / daysPossible) * 1000) / 10 : 0;

  return {
    school: {
      name: school?.name ?? "School",
      district: school?.district ?? "",
      schoolCode: school?.school_code ?? "",
      schoolType: school?.school_type ?? "",
      subscriptionPlan: school?.subscription_plan ?? "",
    },
    enrolmentByClass,
    enrolmentByAge,
    staff: {
      totalActive,
      qualifiedTeachers,
      teacherPupilRatio: ratio > 0 ? `1:${ratio}` : "N/A",
    },
    attendance: { daysPresent, daysPossible, rate },
    totals: { boys: totalBoys, girls: totalGirls, total: totalStudents },
    termName,
  };
}

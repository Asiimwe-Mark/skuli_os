# Multi-School Group (Chain Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GROUP_ADMIN portal for managing multiple schools under one organization, with cross-school analytics and school management.

**Architecture:** New `school_groups` and `group_admins` tables with RLS. GROUP_ADMIN gets read-only access to all group school data via `get_user_group_school_ids()` helper. New `/group/` route group with 4 pages. Sidebar reused with conditional nav items. School context switching via `?school_id=` param.

**Tech Stack:** Next.js 16, Supabase (Postgres + RLS), Zustand, Recharts, shadcn/ui

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/00026_school_groups.sql` | Create | DB tables + RLS policies |
| `store/school.ts` | Modify | Add group state |
| `lib/supabase/middleware.ts` | Modify | GROUP_ADMIN route protection |
| `components/dashboard/sidebar.tsx` | Modify | GROUP_ADMIN nav items |
| `app/group/layout.tsx` | Create | Group admin layout |
| `app/group/page.tsx` | Create | Overview page |
| `app/group/schools/page.tsx` | Create | Schools list + add |
| `app/group/analytics/page.tsx` | Create | Cross-school charts |
| `app/group/settings/page.tsx` | Create | Group settings |
| `app/dashboard/layout.tsx` | Modify | Support `?school_id=` for GROUP_ADMIN |

---

### Task 1: Database migration — school_groups + RLS

**Files:**
- Create: `supabase/migrations/00026_school_groups.sql`
- Modify: `supabase/combined.sql` (auto-generated)

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/00026_school_groups.sql`:

```sql
-- =============================================================================
-- Multi-School Group (Chain Admin)
-- Migration 00026
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. school_groups
-- ---------------------------------------------------------------------------
CREATE TABLE school_groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    code        text UNIQUE NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. Link schools to groups
-- ---------------------------------------------------------------------------
ALTER TABLE schools ADD COLUMN group_id uuid REFERENCES school_groups(id);

-- ---------------------------------------------------------------------------
-- 3. group_admins
-- ---------------------------------------------------------------------------
CREATE TABLE group_admins (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    uuid NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 4. Add GROUP_ADMIN role
-- ---------------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'GROUP_ADMIN';

-- ---------------------------------------------------------------------------
-- 5. Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE school_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_admins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. Helper function: school IDs for current user's group
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_group_school_ids()
RETURNS setof uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT s.id FROM schools s
    JOIN group_admins ga ON ga.group_id = s.group_id
    WHERE ga.user_id = auth.uid() AND s.is_deleted = false;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS Policies: school_groups
-- ---------------------------------------------------------------------------

-- SUPER_ADMIN sees all groups
CREATE POLICY "super_admin_all_school_groups"
    ON school_groups FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- GROUP_ADMIN can view their own group
CREATE POLICY "group_admin_view_own_group"
    ON school_groups FOR SELECT
    USING (
        id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

-- GROUP_ADMIN can update their own group
CREATE POLICY "group_admin_update_own_group"
    ON school_groups FOR UPDATE
    USING (
        id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- 8. RLS Policies: group_admins
-- ---------------------------------------------------------------------------

-- SUPER_ADMIN sees all
CREATE POLICY "super_admin_all_group_admins"
    ON group_admins FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- GROUP_ADMIN can manage admins in their own group
CREATE POLICY "group_admin_manage_group_admins"
    ON group_admins FOR ALL
    USING (
        group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- 9. RLS Policies: GROUP_ADMIN read access to operational tables
-- ---------------------------------------------------------------------------

-- Students
CREATE POLICY "group_admin_read_students" ON students FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Fee accounts
CREATE POLICY "group_admin_read_fee_accounts" ON fee_accounts FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Fee payments
CREATE POLICY "group_admin_read_fee_payments" ON fee_payments FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Attendance records
CREATE POLICY "group_admin_read_attendance" ON attendance_records FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Marks
CREATE POLICY "group_admin_read_marks" ON marks FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Report cards
CREATE POLICY "group_admin_read_report_cards" ON report_cards FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Classes
CREATE POLICY "group_admin_read_classes" ON classes FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Terms
CREATE POLICY "group_admin_read_terms" ON terms FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Academic years
CREATE POLICY "group_admin_read_academic_years" ON academic_years FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Staff
CREATE POLICY "group_admin_read_staff" ON staff FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- Subjects
CREATE POLICY "group_admin_read_subjects" ON subjects FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- SMS logs
CREATE POLICY "group_admin_read_sms_logs" ON sms_logs FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- ---------------------------------------------------------------------------
-- 10. RLS Policies: GROUP_ADMIN write access to schools
-- ---------------------------------------------------------------------------

-- GROUP_ADMIN can create schools in their group
CREATE POLICY "group_admin_insert_schools" ON schools FOR INSERT
    WITH CHECK (
        get_user_role() = 'GROUP_ADMIN'
        AND group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

-- GROUP_ADMIN can update schools in their group
CREATE POLICY "group_admin_update_group_schools" ON schools FOR UPDATE
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND id IN (SELECT get_user_group_school_ids())
    );
```

- [ ] **Step 2: Run the migration**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os"
node scripts/run-migrations.mjs
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00026_school_groups.sql supabase/combined.sql
git commit -m "db: add school_groups, group_admins, GROUP_ADMIN role with RLS (step 13)"
```

---

### Task 2: Extend Zustand store + middleware

**Files:**
- Modify: `store/school.ts`
- Modify: `lib/supabase/middleware.ts`

- [ ] **Step 1: Add group state to the store**

In `store/school.ts`, add to the `SchoolStore` interface (after line 9):

```ts
  group: { id: string; name: string; code: string } | null;
  setGroup: (group: SchoolStore['group']) => void;
```

Add to the initial state (after line 31):

```ts
  group: null,
```

Add to the setters (after line 39):

```ts
  setGroup: (group) => set({ group }),
```

Add `group: null` to the `reset` function's state object (after line 48).

- [ ] **Step 2: Add GROUP_ADMIN middleware protection**

In `lib/supabase/middleware.ts`, add after the portal check (after line 79) and before the teacher check:

```ts
  // Group admin portal
  if (pathname.startsWith('/group') && role !== 'GROUP_ADMIN' && role !== 'SUPER_ADMIN') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -E "(store/school|middleware)"
```

- [ ] **Step 4: Commit**

```bash
git add store/school.ts lib/supabase/middleware.ts
git commit -m "feat: add group state to store and GROUP_ADMIN middleware protection"
```

---

### Task 3: Sidebar — GROUP_ADMIN nav items

**Files:**
- Modify: `components/dashboard/sidebar.tsx`

- [ ] **Step 1: Add GROUP_NAV_ITEMS array**

In `components/dashboard/sidebar.tsx`, after the `NAV_ITEMS` array (after line 146), add:

```ts
const GROUP_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/group", icon: LayoutDashboard },
  { label: "Schools", href: "/group/schools", icon: School },
  { label: "Analytics", href: "/group/analytics", icon: BarChart3 },
  { label: "Settings", href: "/group/settings", icon: Settings },
];
```

- [ ] **Step 2: Add GROUP_ADMIN badge color**

In the `roleBadgeColors` object (line 259), add:

```ts
    GROUP_ADMIN: "bg-cyan-400/10 text-cyan-400",
```

- [ ] **Step 3: Conditional nav items in Sidebar component**

In the `Sidebar` component (line 242), after `const { sidebarCollapsed, toggleSidebar } = useUIStore();` (line 244), add:

```ts
  const navItems = userRole === 'GROUP_ADMIN' ? GROUP_NAV_ITEMS : NAV_ITEMS;
```

Then change the nav rendering (line 310) from `NAV_ITEMS.map(...)` to `navItems.map(...)`:

```tsx
          {navItems.map((item) => (
            <SidebarItem key={item.label} item={item} />
          ))}
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "sidebar"
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/sidebar.tsx
git commit -m "feat: add GROUP_ADMIN nav items to sidebar"
```

---

### Task 4: Group layout

**Files:**
- Create: `app/group/layout.tsx`

- [ ] **Step 1: Create the group layout**

Create `app/group/layout.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";

export default function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const { setUser, setGroup, setUserRole, setLoading } = useSchoolStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadContext() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login");
        return;
      }

      // Load user profile
      const { data: userProfile } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (!userProfile || !userProfile.is_active) {
        router.push("/login");
        return;
      }

      setUser(userProfile);
      setUserRole(userProfile.role);

      if (userProfile.role !== "GROUP_ADMIN" && userProfile.role !== "SUPER_ADMIN") {
        router.push("/dashboard");
        return;
      }

      // Load group via group_admins join
      const { data: groupAdmin } = await supabase
        .from("group_admins")
        .select("group:school_groups(id, name, code)")
        .eq("user_id", authUser.id)
        .single();

      if (groupAdmin?.group) {
        const g = groupAdmin.group as unknown as { id: string; name: string; code: string };
        setGroup(g);
      }

      setLoading(false);
      setReady(true);
    }

    loadContext();
  }, [supabase, router, setUser, setGroup, setUserRole, setLoading]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-2 border-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading group portal...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy">
      <Sidebar />
      <Topbar />
      <main className="pt-4 pb-8 px-6 ml-[260px] transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "group/layout"
```

- [ ] **Step 3: Commit**

```bash
git add app/group/layout.tsx
git commit -m "feat: add group admin layout with auth and group context loading"
```

---

### Task 5: Group overview page

**Files:**
- Create: `app/group/page.tsx`

- [ ] **Step 1: Create the overview page**

Create `app/group/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Wallet,
  CalendarCheck,
  School,
  TrendingUp,
} from "lucide-react";

interface SchoolSummary {
  id: string;
  name: string;
  studentCount: number;
  feeCollected: number;
  attendanceRate: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  delay = 0,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className="border-border-subtle bg-surface hover:border-border-glow transition-all duration-300">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function GroupOverviewPage() {
  const { group } = useSchoolStore();
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalFees, setTotalFees] = useState(0);
  const [avgAttendance, setAvgAttendance] = useState(0);
  const [schoolSummaries, setSchoolSummaries] = useState<SchoolSummary[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!group) return;

      // Get all schools in the group
      const { data: schools } = await supabase
        .from("schools")
        .select("id, name")
        .eq("group_id", group.id)
        .eq("is_deleted", false);

      if (!schools || schools.length === 0) {
        setLoading(false);
        return;
      }

      const schoolIds = schools.map((s) => s.id);
      let totalStud = 0;
      let totalFee = 0;
      let totalAttPct = 0;
      let attSchools = 0;
      const summaries: SchoolSummary[] = [];

      for (const school of schools) {
        // Student count
        const { count: studCount } = await supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("school_id", school.id)
          .eq("is_deleted", false)
          .eq("status", "active");

        const sc = studCount ?? 0;
        totalStud += sc;

        // Fee collected (all time for now — no term scoping for group view)
        const { data: payments } = await supabase
          .from("fee_payments")
          .select("amount")
          .eq("school_id", school.id)
          .eq("status", "confirmed");

        const fee = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
        totalFee += fee;

        // Attendance rate (today)
        const today = new Date().toISOString().split("T")[0];
        const { data: attRecords } = await supabase
          .from("attendance_records")
          .select("status")
          .eq("school_id", school.id)
          .eq("date", today);

        let attRate = 0;
        if (attRecords && attRecords.length > 0) {
          const present = attRecords.filter((r) => r.status === "present").length;
          attRate = Math.round((present / attRecords.length) * 100);
          totalAttPct += attRate;
          attSchools++;
        }

        summaries.push({
          id: school.id,
          name: school.name,
          studentCount: sc,
          feeCollected: fee,
          attendanceRate: attRate,
        });
      }

      setTotalStudents(totalStud);
      setTotalFees(totalFee);
      setAvgAttendance(attSchools > 0 ? Math.round(totalAttPct / attSchools) : 0);
      setSchoolSummaries(summaries);
      setLoading(false);
    }

    loadData();
  }, [group, supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{group?.name || "Group Overview"}</h1>
        <p className="text-foreground/60 text-sm">
          {schoolSummaries.length} school{schoolSummaries.length !== 1 ? "s" : ""} in this group
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Students"
          value={totalStudents.toLocaleString()}
          icon={Users}
          color="bg-amber-500/10 text-amber-400"
          delay={0}
        />
        <StatCard
          label="Total Fees Collected"
          value={formatUGX(totalFees)}
          icon={Wallet}
          color="bg-emerald-500/10 text-emerald-400"
          delay={0.1}
        />
        <StatCard
          label="Avg Attendance Today"
          value={`${avgAttendance}%`}
          icon={CalendarCheck}
          color="bg-blue-500/10 text-blue-400"
          delay={0.2}
        />
      </div>

      {/* Per-School Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Schools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {schoolSummaries.map((school, i) => (
            <motion.div
              key={school.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
            >
              <Card className="border-border-subtle bg-surface hover:border-border-glow transition-all duration-300">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <School className="w-4 h-4 text-amber-400" />
                    {school.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{school.studentCount}</p>
                      <p className="text-[10px] text-foreground/60">Students</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatUGX(school.feeCollected)}</p>
                      <p className="text-[10px] text-foreground/60">Fees</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {school.attendanceRate > 0 ? `${school.attendanceRate}%` : "—"}
                      </p>
                      <p className="text-[10px] text-foreground/60">Attendance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "group/page"
```

- [ ] **Step 3: Commit**

```bash
git add app/group/page.tsx
git commit -m "feat: add group admin overview page with cross-school KPIs"
```

---

### Task 6: Group schools page

**Files:**
- Create: `app/group/schools/page.tsx`

- [ ] **Step 1: Create the schools page**

Create `app/group/schools/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  School,
  Plus,
  ArrowUpRight,
  Loader2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SchoolRow {
  id: string;
  name: string;
  school_code: string | null;
  school_type: string;
  studentCount: number;
}

export default function GroupSchoolsPage() {
  const { group } = useSchoolStore();
  const supabase = createBrowserClient();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // New school form
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState("primary");

  useEffect(() => {
    async function loadSchools() {
      if (!group) return;

      const { data } = await supabase
        .from("schools")
        .select("id, name, school_code, school_type")
        .eq("group_id", group.id)
        .eq("is_deleted", false)
        .order("name");

      if (!data) {
        setLoading(false);
        return;
      }

      const schoolsWithCounts: SchoolRow[] = [];
      for (const s of data) {
        const { count } = await supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("school_id", s.id)
          .eq("is_deleted", false)
          .eq("status", "active");

        schoolsWithCounts.push({
          id: s.id,
          name: s.name,
          school_code: s.school_code,
          school_type: s.school_type,
          studentCount: count ?? 0,
        });
      }

      setSchools(schoolsWithCounts);
      setLoading(false);
    }

    loadSchools();
  }, [group, supabase]);

  async function handleCreateSchool() {
    if (!group || !newName.trim()) return;
    setCreating(true);

    const { data, error } = await supabase
      .from("schools")
      .insert({
        name: newName.trim(),
        school_code: newCode.trim() || null,
        school_type: newType,
        group_id: group.id,
      })
      .select("id, name, school_code, school_type")
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setSchools((prev) => [
        ...prev,
        { ...data, studentCount: 0 },
      ]);
      setDialogOpen(false);
      setNewName("");
      setNewCode("");
      setNewType("primary");
      toast({ title: "School created", description: `${data.name} has been added to the group.` });
    }

    setCreating(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schools</h1>
          <p className="text-foreground/60 text-sm">{schools.length} school{schools.length !== 1 ? "s" : ""} in this group</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Add School
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New School</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>School Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Kampala Primary School"
                />
              </div>
              <div>
                <Label>School Code (optional)</Label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. KPS"
                />
              </div>
              <div>
                <Label>School Type</Label>
                Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateSchool} disabled={creating || !newName.trim()} className="w-full">
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create School
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border-subtle bg-surface">
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-navy-50/50">
                <th className="text-left p-4 text-sm font-medium text-foreground/60">School</th>
                <th className="text-left p-4 text-sm font-medium text-foreground/60">Code</th>
                <th className="text-left p-4 text-sm font-medium text-foreground/60">Type</th>
                <th className="text-right p-4 text-sm font-medium text-foreground/60">Students</th>
                <th className="text-right p-4 text-sm font-medium text-foreground/60"></th>
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr
                  key={school.id}
                  className="border-b border-navy-50/20 hover:bg-navy-50/10 cursor-pointer"
                  onClick={() => router.push(`/dashboard?school_id=${school.id}`)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center">
                        <School className="w-4 h-4 text-amber-400" />
                      </div>
                      <span className="font-medium">{school.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-foreground/60">{school.school_code || "—"}</td>
                  <td className="p-4 text-sm text-foreground/60 capitalize">{school.school_type}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Users className="w-3 h-3 text-foreground/40" />
                      <span className="text-sm">{school.studentCount}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <ArrowUpRight className="w-4 h-4 text-foreground/40" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "group/schools"
```

- [ ] **Step 3: Commit**

```bash
git add app/group/schools/page.tsx
git commit -m "feat: add group schools page with add school dialog"
```

---

### Task 7: Group analytics page

**Files:**
- Create: `app/group/analytics/page.tsx`

- [ ] **Step 1: Create the analytics page**

Create `app/group/analytics/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

const CHART_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"];

interface FeeBySchool {
  name: string;
  amount: number;
}

interface AttendanceByWeek {
  week: string;
  [schoolName: string]: number | string;
}

interface AcademicByClass {
  className: string;
  [schoolName: string]: number | string;
}

export default function GroupAnalyticsPage() {
  const { group } = useSchoolStore();
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [feeBySchool, setFeeBySchool] = useState<FeeBySchool[]>([]);
  const [attendanceByWeek, setAttendanceByWeek] = useState<AttendanceByWeek[]>([]);
  const [academicByClass, setAcademicByClass] = useState<AcademicByClass[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!group) return;

      const { data: schools } = await supabase
        .from("schools")
        .select("id, name")
        .eq("group_id", group.id)
        .eq("is_deleted", false)
        .order("name");

      if (!schools || schools.length === 0) {
        setLoading(false);
        return;
      }

      // 1. Fee collection by school
      const feeData: FeeBySchool[] = [];
      for (const school of schools) {
        const { data: payments } = await supabase
          .from("fee_payments")
          .select("amount")
          .eq("school_id", school.id)
          .eq("status", "confirmed");

        const total = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
        feeData.push({ name: school.name, amount: total });
      }
      setFeeBySchool(feeData);

      // 2. Attendance rate by school over weeks (last 8 weeks)
      const weekMap = new Map<string, Record<string, { present: number; total: number }>>();
      const now = new Date();

      for (let w = 7; w >= 0; w--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const weekLabel = `W${8 - w}`;
        const startStr = weekStart.toISOString().split("T")[0];
        const endStr = weekEnd.toISOString().split("T")[0];

        const weekData: Record<string, { present: number; total: number }> = {};

        for (const school of schools) {
          const { data: records } = await supabase
            .from("attendance_records")
            .select("status")
            .eq("school_id", school.id)
            .gte("date", startStr)
            .lte("date", endStr);

          if (records && records.length > 0) {
            const present = records.filter((r) => r.status === "present").length;
            weekData[school.name] = { present, total: records.length };
          }
        }

        weekMap.set(weekLabel, weekData);
      }

      const attData: AttendanceByWeek[] = [];
      for (const [week, schoolData] of weekMap) {
        const row: AttendanceByWeek = { week };
        for (const school of schools) {
          const d = schoolData[school.name];
          row[school.name] = d && d.total > 0 ? Math.round((d.present / d.total) * 100) : 0;
        }
        attData.push(row);
      }
      setAttendanceByWeek(attData);

      // 3. Academic performance — average marks by class across schools
      const classMap = new Map<string, Record<string, { total: number; count: number }>>();

      for (const school of schools) {
        const { data: classes } = await supabase
          .from("classes")
          .select("id, name")
          .eq("school_id", school.id)
          .eq("is_deleted", false);

        if (!classes) continue;

        for (const cls of classes) {
          const { data: marks } = await supabase
            .from("marks")
            .select("score, max_score")
            .eq("school_id", school.id)
            .eq("class_id", cls.id);

          if (marks && marks.length > 0) {
            const avgPct = marks.reduce((sum, m) => sum + (Number(m.score) / Number(m.max_score)) * 100, 0) / marks.length;
            const existing = classMap.get(cls.name) ?? {};
            existing[school.name] = { total: avgPct, count: 1 };
            classMap.set(cls.name, existing);
          }
        }
      }

      const acData: AcademicByClass[] = [];
      for (const [className, schoolData] of classMap) {
        const row: AcademicByClass = { className };
        for (const school of schools) {
          const d = schoolData[school.name];
          row[school.name] = d ? Math.round(d.total / d.count) : 0;
        }
        acData.push(row);
      }
      setAcademicByClass(acData);

      setLoading(false);
    }

    loadData();
  }, [group, supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-foreground/60 text-sm">Cross-school performance comparison</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fee Collection by School */}
        {feeBySchool.length > 0 && (
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-lg">Fee Collection by School</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={feeBySchool}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip
                    formatter={(value) => [formatUGX(Number(value)), "Amount"]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Attendance Rate by School */}
        {attendanceByWeek.length > 0 && (
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-lg">Attendance Rate by School</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={attendanceByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Attendance"]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                  {feeBySchool.map((school, i) => (
                    <Line
                      key={school.name}
                      type="monotone"
                      dataKey={school.name}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Academic Performance */}
        {academicByClass.length > 0 && (
          <Card className="border-border-subtle bg-surface lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Academic Performance by Class</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={academicByClass}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="className" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Average"]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                  {feeBySchool.map((school, i) => (
                    <Bar
                      key={school.name}
                      dataKey={school.name}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "group/analytics"
```

- [ ] **Step 3: Commit**

```bash
git add app/group/analytics/page.tsx
git commit -m "feat: add group analytics page with cross-school charts"
```

---

### Task 8: Group settings page

**Files:**
- Create: `app/group/settings/page.tsx`

- [ ] **Step 1: Create the settings page**

Create `app/group/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { Settings, Users, Loader2, Trash2, UserPlus } from "lucide-react";

interface GroupAdmin {
  id: string;
  user_id: string;
  user: { full_name: string; phone: string | null } | null;
}

export default function GroupSettingsPage() {
  const { group, setGroup } = useSchoolStore();
  const supabase = createBrowserClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Group info
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");

  // Group admins
  const [admins, setAdmins] = useState<GroupAdmin[]>([]);
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!group) return;

      setGroupName(group.name);
      setGroupCode(group.code);

      const { data: adminData } = await supabase
        .from("group_admins")
        .select("id, user_id, user:users(full_name, phone)")
        .eq("group_id", group.id);

      if (adminData) {
        setAdmins(
          adminData.map((a) => ({
            id: a.id,
            user_id: a.user_id,
            user: a.user as unknown as { full_name: string; phone: string | null } | null,
          }))
        );
      }

      setLoading(false);
    }

    loadData();
  }, [group, supabase]);

  async function handleSaveGroupInfo() {
    if (!group) return;
    setSaving(true);

    const { error } = await supabase
      .from("school_groups")
      .update({ name: groupName.trim(), code: groupCode.trim() })
      .eq("id", group.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setGroup({ ...group, name: groupName.trim(), code: groupCode.trim() });
      toast({ title: "Saved", description: "Group info updated." });
    }

    setSaving(false);
  }

  async function handleAddAdmin() {
    if (!group || !newAdminPhone.trim()) return;
    setAddingAdmin(true);

    // Find user by phone
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("phone", newAdminPhone.trim())
      .single();

    if (!user) {
      toast({ title: "Not found", description: "No user found with that phone number.", variant: "destructive" });
      setAddingAdmin(false);
      return;
    }

    const { error } = await supabase.from("group_admins").insert({
      group_id: group.id,
      user_id: user.id,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Admin added", description: "User has been added as a group admin." });
      setNewAdminPhone("");
      // Reload admins
      const { data: adminData } = await supabase
        .from("group_admins")
        .select("id, user_id, user:users(full_name, phone)")
        .eq("group_id", group.id);
      if (adminData) {
        setAdmins(
          adminData.map((a) => ({
            id: a.id,
            user_id: a.user_id,
            user: a.user as unknown as { full_name: string; phone: string | null } | null,
          }))
        );
      }
    }

    setAddingAdmin(false);
  }

  async function handleRemoveAdmin(adminId: string) {
    const { error } = await supabase.from("group_admins").delete().eq("id", adminId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setAdmins((prev) => prev.filter((a) => a.id !== adminId));
      toast({ title: "Removed", description: "Admin removed from group." });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-foreground/60 text-sm">Manage your school group</p>
      </div>

      {/* Group Info */}
      <Card className="border-border-subtle bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="w-5 h-5 text-amber-400" />
            Group Info
          </CardTitle>
          <CardDescription>Edit your group name and code</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Group Name</Label>
            <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div>
            <Label>Group Code</Label>
            <Input value={groupCode} onChange={(e) => setGroupCode(e.target.value)} />
          </div>
          <Button onClick={handleSaveGroupInfo} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Group Admins */}
      <Card className="border-border-subtle bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-amber-400" />
            Group Admins
          </CardTitle>
          <CardDescription>Manage who can access this group portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between p-3 rounded-lg bg-navy-900/50"
              >
                <div>
                  <p className="text-sm font-medium">{admin.user?.full_name || "Unknown"}</p>
                  <p className="text-xs text-foreground/40">{admin.user?.phone || "No phone"}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveAdmin(admin.id)}
                  className="text-rose-400 hover:text-rose-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {admins.length === 0 && (
              <p className="text-sm text-foreground/40 py-4 text-center">No group admins yet</p>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Phone number to add as admin"
              value={newAdminPhone}
              onChange={(e) => setNewAdminPhone(e.target.value)}
            />
            <Button onClick={handleAddAdmin} disabled={addingAdmin || !newAdminPhone.trim()}>
              {addingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "group/settings"
```

- [ ] **Step 3: Commit**

```bash
git add app/group/settings/page.tsx
git commit -m "feat: add group settings page with admin management"
```

---

### Task 9: Dashboard layout — GROUP_ADMIN school context switching

**Files:**
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Support `?school_id=` param**

In `app/dashboard/layout.tsx`, add `useSearchParams` import (line 4):

```tsx
import { useRouter, useSearchParams } from "next/navigation";
```

Add after `const supabase = createBrowserClient();` (line 18):

```tsx
  const searchParams = useSearchParams();
  const overrideSchoolId = searchParams.get("school_id");
```

In the `loadContext` function, change the school loading block (lines 48-56). Currently:

```tsx
      if (userProfile.school_id) {
        // Load school
        const { data: school } = await supabase
          .from("schools")
          .select("*")
          .eq("id", userProfile.school_id)
          .single();
```

Change to:

```tsx
      // Determine which school to load
      const effectiveSchoolId = overrideSchoolId || userProfile.school_id;

      if (effectiveSchoolId) {
        // Load school
        const { data: school } = await supabase
          .from("schools")
          .select("*")
          .eq("id", effectiveSchoolId)
          .single();
```

Also update the term loading query (line 59) to use `effectiveSchoolId`:

```tsx
        const { data: term } = await supabase
          .from("terms")
          .select("*, academic_years(*)")
          .eq("school_id", effectiveSchoolId)
          .eq("is_current", true)
          .single();
```

Add `overrideSchoolId` to the useEffect dependency array.

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "dashboard/layout"
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/layout.tsx
git commit -m "feat: support school_id param in dashboard layout for GROUP_ADMIN"
```

---

### Task 10: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit --pretty
```

Expected: No new errors.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit any fixes**

If issues found, fix and commit.

---

## Testing Checklist

1. Create a GROUP_ADMIN user (set `role = 'GROUP_ADMIN'`, `school_id = NULL` in users table)
2. Insert a `school_groups` row and a `group_admins` row linking the user to the group
3. Assign 2+ schools to the group (set `group_id` on schools)
4. Login as GROUP_ADMIN → should land on `/group` overview
5. Overview shows aggregated student count, fees, attendance across group schools
6. Per-school cards show individual school metrics
7. Schools page lists all group schools in a table
8. Add School creates a new school with the group's `group_id`
9. Clicking a school row navigates to `/dashboard?school_id=xxx` — dashboard loads that school's data
10. Analytics page shows fee bar chart, attendance line chart, academic grouped bar chart
11. Settings page allows editing group name/code
12. Settings page allows adding/removing group admins
13. Non-GROUP_ADMIN users cannot access `/group/` routes (redirected to `/dashboard`)
14. GROUP_ADMIN cannot access `/dashboard` directly without `?school_id=` (school is null, shows empty state)

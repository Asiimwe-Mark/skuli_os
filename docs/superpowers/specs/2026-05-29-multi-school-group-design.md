# Multi-School Group (Chain Admin) — Design Spec

**Date:** 2026-05-29
**Step:** 13 of Skuli OS build plan

## Overview

Add a group admin portal for managing multiple schools under one organization (e.g., a diocese, franchise, or school chain). The GROUP_ADMIN role has read-only analytics across all group schools and can create new schools and manage group settings, but does not perform daily school operations.

## Scope

- `school_groups` table linking multiple schools
- `group_admins` join table for assigning users to groups
- `GROUP_ADMIN` role added to `user_role` enum
- RLS policies for cross-school read access via group membership
- Group admin portal at `/group/` with 4 pages: Overview, Schools, Analytics, Settings
- Sidebar reuse with GROUP_ADMIN nav items
- School context switching for viewing individual school dashboards

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Group admin data access | RLS with `get_user_group_school_ids()` helper | Clean pattern, Supabase browser client works naturally |
| Sidebar component | Reuse existing `Sidebar` with conditional nav items | Same design system, less code, consistent UX |
| School impersonation | Navigate to `/dashboard?school_id=xxx` | Simplest approach, middleware allows GROUP_ADMIN |
| GROUP_ADMIN school_id | NULL on users table | They don't belong to one school; access via group_admins join |

## 1. Database — `00026_school_groups.sql`

```sql
CREATE TABLE school_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_deleted  boolean NOT NULL DEFAULT false
);

-- Link schools to groups
ALTER TABLE schools ADD COLUMN group_id uuid REFERENCES school_groups(id);

-- Group admin assignments
CREATE TABLE group_admins (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Add GROUP_ADMIN role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'GROUP_ADMIN';

-- Enable RLS
ALTER TABLE school_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_admins ENABLE ROW LEVEL SECURITY;
```

### RLS policies

```sql
-- Helper: returns school_ids the current user can access as group admin
CREATE OR REPLACE FUNCTION get_user_group_school_ids()
RETURNS setof uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.id FROM schools s
  JOIN group_admins ga ON ga.group_id = s.group_id
  WHERE ga.user_id = auth.uid() AND s.is_deleted = false;
$$;

-- school_groups: GROUP_ADMIN can view their own group
CREATE POLICY "group_admin_view_own_group" ON school_groups FOR SELECT
  USING (id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid()));

-- school_groups: GROUP_ADMIN can update their own group
CREATE POLICY "group_admin_update_own_group" ON school_groups FOR UPDATE
  USING (id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid()));

-- group_admins: GROUP_ADMIN can manage admins in their own group
CREATE POLICY "group_admin_manage_group_admins" ON group_admins FOR ALL
  USING (group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid()));

-- GROUP_ADMIN read access to operational tables across group schools
-- Pattern for each table (students, fee_accounts, fee_payments, attendance_records,
-- marks, report_cards, classes, terms, staff, subjects):
CREATE POLICY "group_admin_read_{table}" ON {table} FOR SELECT
  USING (
    get_user_role() = 'GROUP_ADMIN'
    AND school_id IN (SELECT get_user_group_school_ids())
  );

-- GROUP_ADMIN can create new schools in their group
CREATE POLICY "group_admin_create_schools" ON schools FOR INSERT
  WITH CHECK (
    get_user_role() = 'GROUP_ADMIN'
    AND group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
  );

-- GROUP_ADMIN can update schools in their group
CREATE POLICY "group_admin_update_schools" ON schools FOR UPDATE
  USING (
    get_user_role() = 'GROUP_ADMIN'
    AND id IN (SELECT get_user_group_school_ids())
  );
```

## 2. Middleware + Routing

### Middleware update (`lib/supabase/middleware.ts`)

Add GROUP_ADMIN route protection after the existing role checks:

```ts
// Group admin portal
if (pathname.startsWith('/group') && role !== 'GROUP_ADMIN' && role !== 'SUPER_ADMIN') {
  const url = request.nextUrl.clone();
  url.pathname = '/dashboard';
  return NextResponse.redirect(url);
}
```

### Route structure

```
app/group/
├── layout.tsx        — auth gate, loads group context
├── page.tsx          — Overview (cross-school KPIs)
├── schools/
│   └── page.tsx      — School list + add school
├── analytics/
│   └── page.tsx      — Cross-school charts
└── settings/
    └── page.tsx      — Group name, manage group admins
```

## 3. Group Layout (`app/group/layout.tsx`)

Mirrors `app/dashboard/layout.tsx`:
- `"use client"` component
- Auth check: `supabase.auth.getUser()`, then load user profile
- Load group: query `school_groups` via `group_admins` where `user_id = authUser.id`
- Store group in `useSchoolStore` (extend with `group` field) or new `useGroupStore`
- Render `<Sidebar />` + `<Topbar />` + `<main>` (same structure as dashboard layout)

### Sidebar integration

In `components/dashboard/sidebar.tsx`:
- Import `School`, `BarChart3` icons (already imported)
- Add `GROUP_NAV_ITEMS` array:
  ```ts
  const GROUP_NAV_ITEMS: NavItem[] = [
    { label: "Overview", href: "/group", icon: LayoutDashboard },
    { label: "Schools", href: "/group/schools", icon: School },
    { label: "Analytics", href: "/group/analytics", icon: BarChart3 },
    { label: "Settings", href: "/group/settings", icon: Settings },
  ];
  ```
- Conditional in `Sidebar`: if `userRole === 'GROUP_ADMIN'`, use `GROUP_NAV_ITEMS` instead of `NAV_ITEMS`

### School context switching

When GROUP_ADMIN navigates to `/dashboard?school_id=xxx`:
- Dashboard layout checks for `school_id` search param
- If present and user is GROUP_ADMIN, load that school's data instead of `user.school_id`
- Verify the school is in the user's group via RLS (the query will fail naturally if not)

## 4. Group Portal Pages

### `app/group/page.tsx` — Overview

Cross-school summary using Supabase browser client (RLS scoping via `get_user_group_school_ids()`):

**Summary stats (top row):**
- Total students across group: `count(*) from students`
- Total fees collected this term: `sum(amount) from fee_payments` joined with current term
- Average attendance rate: `count(present) / count(*) from attendance_records`

**Per-school cards (grid):**
For each school in the group:
- School name
- Student count
- Fee collection this term
- Attendance rate %

Uses existing `StatCard` component and `Card` from shadcn/ui.

### `app/group/schools/page.tsx` — Schools

- Table listing all schools in the group
- Columns: name, code, student count, subscription plan, status
- `[Add School]` button → opens a form to create a new school:
  - Fields: name, school_code, school_type, address, phone, email
  - Sets `group_id` to the current group
  - Creates the school via Supabase insert
- Clicking a school row → navigates to `/dashboard?school_id={id}`

### `app/group/analytics/page.tsx` — Analytics

Three Recharts visualizations:

1. **Fee collection by school** — `BarChart` with school names on x-axis, total fees on y-axis
2. **Attendance rate by school over weeks** — `LineChart` with week numbers on x-axis, attendance % on y-axis, one line per school
3. **Academic performance** — `BarChart` comparing average marks by class name across schools

All queries use the Supabase browser client. Data fetched via `useEffect` or `@tanstack/react-query`.

### `app/group/settings/page.tsx` — Settings

- **Group info form:** Edit `name` and `code` fields on `school_groups`
- **Group admins section:** Table of current group admins with remove button, plus add admin form (search users by name/email, insert into `group_admins`)

## 5. Zustand Store Extension

Extend `useSchoolStore` (or create `useGroupStore`) with:

```ts
interface GroupState {
  group: { id: string; name: string; code: string } | null;
  setGroup: (group: GroupState['group']) => void;
}
```

The group layout sets this on load. The sidebar and pages read from it.

## Files to Create

| File | Purpose |
|---|---|
| `supabase/migrations/00026_school_groups.sql` | DB tables + RLS |
| `app/group/layout.tsx` | Group admin layout |
| `app/group/page.tsx` | Overview page |
| `app/group/schools/page.tsx` | Schools list + add |
| `app/group/analytics/page.tsx` | Cross-school charts |
| `app/group/settings/page.tsx` | Group settings |

## Files to Modify

| File | Change |
|---|---|
| `lib/supabase/middleware.ts` | Add GROUP_ADMIN route protection |
| `components/dashboard/sidebar.tsx` | Add GROUP_ADMIN nav items conditional |
| `store/school.ts` | Add group state (or create new store) |
| `app/dashboard/layout.tsx` | Support `?school_id=` param for GROUP_ADMIN |
| `supabase/migrations/combined.sql` | Auto-regenerated |

## Testing

1. Create a GROUP_ADMIN user and assign to a group via `group_admins`
2. Login as GROUP_ADMIN → should land on `/group` overview
3. Verify sidebar shows group nav items (Overview, Schools, Analytics, Settings)
4. Overview shows aggregated data across all group schools
5. Schools page lists group schools, add school works
6. Clicking a school → navigates to `/dashboard?school_id=xxx` with that school's data
7. Analytics charts render with cross-school data
8. Settings allows editing group name and managing group admins
9. GROUP_ADMIN cannot access `/dashboard` directly without `school_id` param
10. Non-GROUP_ADMIN users cannot access `/group/` routes

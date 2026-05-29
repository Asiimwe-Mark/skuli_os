# Skuli OS Navigation Structure

## Dashboard Sidebar (`/dashboard/`)

The main dashboard sidebar is rendered by `components/dashboard/sidebar.tsx`. Navigation items are role-filtered - users only see items they have access to.

### Navigation Tree

```
📊 Overview                          /dashboard
   (no role restriction)

👥 Students                          [SCHOOL_ADMIN, BURSAR, SUPER_ADMIN]
   ├── All Students                  /dashboard/students
   ├── Enroll Student                /dashboard/students/enroll
   ├── Bulk Import                   /dashboard/students/bulk-import
   ├── Promote                       /dashboard/students/promote
   ├── Classes                       /dashboard/students/classes
   └── Alumni                        /dashboard/students/alumni

💰 Fees                              [SCHOOL_ADMIN, BURSAR, SUPER_ADMIN]
   ├── Fee Accounts                  /dashboard/fees/accounts
   ├── Record Payment                /dashboard/fees/payments
   ├── Fee Structure                 /dashboard/fees/structure
   ├── Discounts                     /dashboard/fees/discounts
   ├── Defaulters                    /dashboard/fees/defaulters
   ├── Receipts                      /dashboard/fees/receipts
   ├── Statements                    /dashboard/fees/statements
   ├── Expenses                      /dashboard/fees/expenses
   └── Reports                       /dashboard/fees/reports

📚 Academics                         (mixed roles per item)
   ├── Marks Entry                   /dashboard/academics/marks          [SCHOOL_ADMIN, TEACHER, SUPER_ADMIN]
   ├── Review Marks                  /dashboard/academics/marks/review   [SCHOOL_ADMIN, SUPER_ADMIN]
   ├── Report Cards                  /dashboard/academics/report-cards   [SCHOOL_ADMIN, SUPER_ADMIN]
   ├── Subjects                      /dashboard/academics/subjects       [SCHOOL_ADMIN, SUPER_ADMIN]
   ├── Timetable                     /dashboard/academics/timetable      [SCHOOL_ADMIN, TEACHER, SUPER_ADMIN]
   └── Calendar                      /dashboard/academics/calendar       [SCHOOL_ADMIN, SUPER_ADMIN]

✅ Attendance                        (no role restriction)
   ├── Take Attendance               /dashboard/attendance/take
   └── Overview                      /dashboard/attendance

💬 Communication                     [SCHOOL_ADMIN, BURSAR, SUPER_ADMIN]
   ├── Compose                       /dashboard/communication/compose
   ├── Inbox                         /dashboard/communication/inbox
   ├── Templates                     /dashboard/communication/templates
   └── SMS Logs                      /dashboard/communication/logs

👩‍💼 Staff & Payroll                  [SCHOOL_ADMIN, SUPER_ADMIN]
   ├── Staff Directory               /dashboard/staff
   └── Payroll                       /dashboard/staff/payroll

📅 Meetings                          [SCHOOL_ADMIN, SUPER_ADMIN]
   └── Schedule Meetings             /dashboard/meetings

📈 Analytics                         [SCHOOL_ADMIN, SUPER_ADMIN]
   ├── Overview                      /dashboard/analytics
   └── Custom Reports                /dashboard/analytics/reports

📚 Library                           [SCHOOL_ADMIN, BURSAR, SUPER_ADMIN]
   ├── Book Catalog                  /dashboard/library
   └── Issues & Returns              /dashboard/library/issues

🏛️ Assets                            [SCHOOL_ADMIN, SUPER_ADMIN]
   └── Assets & Inventory            /dashboard/assets

⚙️ Settings                          [SCHOOL_ADMIN, SUPER_ADMIN]
   ├── School Profile                /dashboard/settings/school
   ├── Users & Roles                 /dashboard/settings/users
   ├── API Keys                      /dashboard/settings/api
   ├── Notifications                 /dashboard/settings/notifications
   ├── Billing                       /dashboard/settings/billing
   └── Audit Log                     /dashboard/settings/audit-log
```

## Teacher Portal Sidebar (`/teacher/`)

The teacher portal has a separate sidebar rendered by `components/teacher/teacher-sidebar.tsx`. Teachers are redirected to `/teacher/*` routes by the middleware.

### Navigation Tree

```
📊 Dashboard                         /teacher
📝 Marks Entry                       /teacher/marks
📅 Attendance                        /teacher/attendance
📢 Notices                           /teacher/notices
👤 Profile                           /teacher/profile
```

## Group Admin Portal Sidebar (`/group/`)

The group admin portal is for users managing multiple schools. Rendered by the dashboard sidebar with `GROUP_NAV_ITEMS`.

### Navigation Tree

```
📊 Overview                          /group
🏫 Schools                           /group/schools
📈 Analytics                         /group/analytics
⚙️ Settings                          /group/settings
```

## Parent Portal Sidebar (`/portal/`)

The parent portal is read-only, showing information about their children.

### Navigation Tree

```
📊 Dashboard                         /portal
📅 Calendar                          /portal/calendar
💰 Fees                              /portal/fees
📅 Meetings                          /portal/meetings
📝 Results                           /portal/results
👤 Profile                           /portal/profile
```

## Role-Based Access Control

### Roles

| Role | Description |
|------|-------------|
| SUPER_ADMIN | Platform administrator, full access to all schools |
| SCHOOL_ADMIN | School administrator, full access to their school |
| BURSAR | Financial officer, access to fees and financial reports |
| TEACHER | Teacher, limited to marks, attendance, and read-only access |
| PARENT | Parent, read-only access to their children's data |
| GROUP_ADMIN | Group administrator, cross-school management |

### Middleware Route Protection

The middleware (`lib/supabase/middleware.ts`) enforces access control at the route level:

| Route Pattern | Allowed Roles |
|---------------|---------------|
| `/admin/*` | SUPER_ADMIN |
| `/portal/*` | PARENT |
| `/group/*` | GROUP_ADMIN, SUPER_ADMIN |
| `/teacher/*` | TEACHER |
| `/dashboard/*` | All authenticated users with roles |

**Teacher restrictions within `/dashboard/*`:**
Teachers are only allowed to access:
- `/dashboard` (root)
- `/dashboard/classes`
- `/dashboard/academics`
- `/dashboard/attendance`
- `/dashboard/settings`

All other `/dashboard/*` routes redirect teachers to `/teacher`.

### Server-Side Enforcement

Role-based rendering in the sidebar is **UI-only**. Actual access control is enforced:
1. **Middleware** - Route-level redirects
2. **RLS Policies** - Database-level row filtering
3. **API Helpers** - `requireRole()` checks in API routes

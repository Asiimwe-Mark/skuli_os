# Expense Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expense tracking with KPI dashboards, charts, CRUD, CSV export, and P&L report PDF to Skuli OS's financial module.

**Architecture:** Two new DB tables (`expense_categories`, `expenses`) with RLS. Four API routes (expenses CRUD, categories CRUD, CSV export, P&L PDF). Two dashboard pages (expense dashboard with KPIs/charts/table, category management). One PDF component for P&L reports. Sidebar nav updated.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), React Query, Recharts, @react-pdf/renderer, React Hook Form + Zod, shadcn/ui, Framer Motion

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00021_expenses.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/00021_expenses.sql` with the enum type, both tables, RLS policies, and index:

```sql
-- Expense payment method enum
CREATE TYPE expense_payment_method AS ENUM ('cash', 'bank', 'mobile_money', 'cheque');

-- Expense categories
CREATE TABLE expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_deleted  boolean NOT NULL DEFAULT false
);

-- Expenses
CREATE TABLE expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES expense_categories(id),
  term_id         uuid REFERENCES terms(id),
  description     text NOT NULL,
  amount          numeric NOT NULL,
  expense_date    date NOT NULL,
  payment_method  expense_payment_method,
  receipt_number  text,
  recorded_by     uuid REFERENCES users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false
);

-- RLS
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_expense_categories" ON expense_categories
  FOR ALL USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_manage_expense_cats" ON expense_categories
  FOR ALL USING (school_id = get_user_school_id());

CREATE POLICY "super_admin_all_expenses" ON expenses
  FOR ALL USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_manage_expenses" ON expenses
  FOR ALL USING (
    school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
  );

-- Index for dashboard queries
CREATE INDEX idx_expenses_date ON expenses(school_id, expense_date, term_id)
  WHERE is_deleted = false;
```

- [ ] **Step 2: Run the migration**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx supabase db push
```

Expected: Migration applied successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00021_expenses.sql
git commit -m "feat(db): add expense_categories and expenses tables with RLS"
```

---

### Task 2: Validation Schemas

**Files:**
- Modify: `lib/validations/fees.ts`

- [ ] **Step 1: Add expense schemas to the existing file**

Append to `lib/validations/fees.ts` (after the existing `applyDiscountSchema` and before the type exports):

```ts
export const createExpenseSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  term_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be greater than 0'),
  expense_date: z.string().min(1, 'Date is required'),
  payment_method: z.enum(['cash', 'bank', 'mobile_money', 'cheque']),
  receipt_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createExpenseCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
});
```

Also add the type exports alongside the existing ones:

```ts
export type CreateExpenseFormData = z.infer<typeof createExpenseSchema>;
export type CreateExpenseCategoryFormData = z.infer<typeof createExpenseCategorySchema>;
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add lib/validations/fees.ts
git commit -m "feat(validations): add expense and expense category Zod schemas"
```

---

### Task 3: Expense Categories API

**Files:**
- Create: `app/api/fees/expenses/categories/route.ts`

- [ ] **Step 1: Create the categories API route**

Create `app/api/fees/expenses/categories/route.ts`:

```ts
import { NextRequest } from "next/server";
import { createExpenseCategorySchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { data: categories, error } = await ctx.supabase
      .from("expense_categories")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("name");

    if (!categories) return successResponse([]);

    // Get expense counts per category
    const categoryIds = categories.map((c) => c.id);
    const { data: countData } = await ctx.supabase
      .from("expenses")
      .select("category_id")
      .in("category_id", categoryIds)
      .eq("is_deleted", false);

    const countMap = new Map<string, number>();
    countData?.forEach((e) => {
      countMap.set(e.category_id, (countMap.get(e.category_id) || 0) + 1);
    });

    const result = categories.map((c) => ({
      ...c,
      expense_count: countMap.get(c.id) || 0,
    }));

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = createExpenseCategorySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("expense_categories")
      .insert({
        school_id: schoolId,
        name: parsed.data.name,
      } as any)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse("A category with this name already exists", 409);
      }
      return errorResponse(error.message, 500);
    }

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return errorResponse("Category ID is required", 400);

    const parsed = createExpenseCategorySchema.partial().safeParse(updates);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("expense_categories")
      .update(parsed.data as any)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Category ID is required", 400);

    // Check if category has linked expenses
    const { count } = await ctx.supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id)
      .eq("is_deleted", false);

    if (count && count > 0) {
      // Unlink expenses from this category first
      await ctx.supabase
        .from("expenses")
        .update({ category_id: null } as any)
        .eq("category_id", id)
        .eq("is_deleted", false);
    }

    const { error } = await ctx.supabase
      .from("expense_categories")
      .update({ is_deleted: true } as any)
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return errorResponse(error.message, 500);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add app/api/fees/expenses/categories/route.ts
git commit -m "feat(api): add expense categories CRUD route"
```

---

### Task 4: Expenses API

**Files:**
- Create: `app/api/fees/expenses/route.ts`

- [ ] **Step 1: Create the expenses API route**

Create `app/api/fees/expenses/route.ts`:

```ts
import { NextRequest } from "next/server";
import { createExpenseSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const categoryId = searchParams.get("category_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    let query = ctx.supabase
      .from("expenses")
      .select(`
        *,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("expense_date", { ascending: false });

    if (termId) query = query.eq("term_id", termId);
    if (categoryId) query = query.eq("category_id", categoryId);
    if (dateFrom) query = query.gte("expense_date", dateFrom);
    if (dateTo) query = query.lte("expense_date", dateTo);

    const { data, error } = await query;

    if (error) return errorResponse(error.message, 500);

    return successResponse(data || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("expenses")
      .insert({
        school_id: schoolId,
        category_id: parsed.data.category_id ?? null,
        term_id: parsed.data.term_id ?? null,
        description: parsed.data.description,
        amount: parsed.data.amount,
        expense_date: parsed.data.expense_date,
        payment_method: parsed.data.payment_method,
        receipt_number: parsed.data.receipt_number ?? null,
        recorded_by: ctx.user.id,
        notes: parsed.data.notes ?? null,
      } as any)
      .select(`
        *,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .single();

    if (error) return errorResponse(error.message, 500);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return errorResponse("Expense ID is required", 400);

    const parsed = createExpenseSchema.partial().safeParse(updates);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("expenses")
      .update(parsed.data as any)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .select(`
        *,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .single();

    if (error) return errorResponse(error.message, 500);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Expense ID is required", 400);

    const { error } = await ctx.supabase
      .from("expenses")
      .update({ is_deleted: true } as any)
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return errorResponse(error.message, 500);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add app/api/fees/expenses/route.ts
git commit -m "feat(api): add expenses CRUD route with filters"
```

---

### Task 5: CSV Export API

**Files:**
- Create: `app/api/fees/expenses/export/route.ts`

- [ ] **Step 1: Create the CSV export route**

Create `app/api/fees/expenses/export/route.ts`:

```ts
import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    let query = ctx.supabase
      .from("expenses")
      .select(`
        expense_date,
        description,
        amount,
        payment_method,
        receipt_number,
        notes,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("expense_date", { ascending: false });

    if (termId) query = query.eq("term_id", termId);
    if (dateFrom) query = query.gte("expense_date", dateFrom);
    if (dateTo) query = query.lte("expense_date", dateTo);

    const { data, error } = await query;

    if (error) return errorResponse(error.message, 500);

    const rows = [
      ["Date", "Category", "Description", "Amount", "Method", "Receipt #", "Recorded By", "Notes"],
      ...(data || []).map((e: any) => [
        e.expense_date,
        e.expense_categories?.name || "",
        e.description,
        e.amount.toString(),
        e.payment_method || "",
        e.receipt_number || "",
        e.users?.full_name || "",
        e.notes || "",
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="expenses-${termId || "all"}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add app/api/fees/expenses/export/route.ts
git commit -m "feat(api): add expense CSV export route"
```

---

### Task 6: P&L Report PDF Component

**Files:**
- Create: `lib/pdf/pl-report.tsx`

- [ ] **Step 1: Create the P&L report PDF component**

Create `lib/pdf/pl-report.tsx`:

```tsx
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

interface IncomeRow {
  class_name: string;
  fee_name: string;
  amount: number;
}

interface ExpenseRow {
  category_name: string;
  amount: number;
}

export interface PlReportProps {
  school_name: string;
  term_name: string;
  academic_year_name: string;
  date_generated: string;
  income_rows: IncomeRow[];
  expense_rows: ExpenseRow[];
  total_income: number;
  total_expenses: number;
}

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#F5A623",
  },
  schoolName: { fontSize: 16, fontWeight: "bold", color: "#0A1628" },
  title: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 10,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#0A1628",
  },
  subtitle: {
    fontSize: 9,
    textAlign: "center",
    color: "#666",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0A1628",
    marginBottom: 8,
    marginTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  table: { marginBottom: 15 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0A1628",
    padding: 6,
  },
  th: { fontSize: 8, color: "#fff", fontWeight: "bold" },
  tableRow: {
    flexDirection: "row",
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  td: { fontSize: 8, color: "#333" },
  col1: { width: "50%" },
  col2: { width: "50%", textAlign: "right" },
  subtotalRow: {
    flexDirection: "row",
    padding: 6,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    backgroundColor: "#f8f8f8",
  },
  subtotalLabel: { fontSize: 9, fontWeight: "bold", color: "#0A1628" },
  subtotalValue: { fontSize: 9, fontWeight: "bold", color: "#0A1628" },
  netRow: {
    flexDirection: "row",
    padding: 8,
    marginTop: 10,
    backgroundColor: "#0A1628",
  },
  netLabel: { fontSize: 10, fontWeight: "bold", color: "#fff" },
  netValue: { fontSize: 10, fontWeight: "bold", color: "#F5A623" },
  footer: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#333",
    width: 200,
    paddingTop: 5,
    marginTop: 40,
  },
  signatureLabel: { fontSize: 8, color: "#666" },
});

export function PlReportPDF({
  school_name,
  term_name,
  academic_year_name,
  date_generated,
  income_rows,
  expense_rows,
  total_income,
  total_expenses,
}: PlReportProps) {
  const net = total_income - total_expenses;
  const isSurplus = net >= 0;

  // Group income by class
  const incomeByClass = new Map<string, number>();
  income_rows.forEach((row) => {
    const key = row.class_name;
    incomeByClass.set(key, (incomeByClass.get(key) || 0) + row.amount);
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.schoolName}>{school_name}</Text>
        </View>

        <Text style={styles.title}>Income & Expenditure Statement</Text>
        <Text style={styles.subtitle}>
          {term_name} — {academic_year_name} | Generated: {date_generated}
        </Text>

        {/* Income Section */}
        <Text style={styles.sectionTitle}>Income</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>Description</Text>
            <Text style={[styles.th, { textAlign: "right" }]}>Amount (UGX)</Text>
          </View>
          {Array.from(incomeByClass.entries()).map(([className, amount], i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.td}>Fee Collections — {className}</Text>
              <Text style={[styles.td, styles.col2]}>{formatUGX(amount)}</Text>
            </View>
          ))}
          <View style={styles.subtotalRow}>
            <Text style={[styles.subtotalLabel, styles.col1]}>Total Income</Text>
            <Text style={[styles.subtotalValue, styles.col2]}>
              {formatUGX(total_income)}
            </Text>
          </View>
        </View>

        {/* Expenditure Section */}
        <Text style={styles.sectionTitle}>Expenditure</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>Category</Text>
            <Text style={[styles.th, { textAlign: "right" }]}>Amount (UGX)</Text>
          </View>
          {expense_rows.map((row, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.td}>{row.category_name}</Text>
              <Text style={[styles.td, styles.col2]}>{formatUGX(row.amount)}</Text>
            </View>
          ))}
          <View style={styles.subtotalRow}>
            <Text style={[styles.subtotalLabel, styles.col1]}>Total Expenditure</Text>
            <Text style={[styles.subtotalValue, styles.col2]}>
              {formatUGX(total_expenses)}
            </Text>
          </View>
        </View>

        {/* Net Surplus/Deficit */}
        <View style={styles.netRow}>
          <Text style={[styles.netLabel, styles.col1]}>
            Net {isSurplus ? "Surplus" : "Deficit"}
          </Text>
          <Text style={[styles.netValue, styles.col2]}>
            {formatUGX(Math.abs(net))}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>Bursar</Text>
            </View>
          </View>
          <View>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>Date</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/pl-report.tsx
git commit -m "feat(pdf): add P&L report PDF component"
```

---

### Task 7: P&L Report API Route

**Files:**
- Create: `app/api/fees/pl-report/route.ts`

- [ ] **Step 1: Create the P&L report API route**

Create `app/api/fees/pl-report/route.ts`:

```ts
import { NextRequest } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { PlReportPDF } from "@/lib/pdf/pl-report";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");

    if (!termId) return errorResponse("term_id is required", 400);

    // Fetch term details
    const { data: term, error: termError } = await ctx.supabase
      .from("terms")
      .select("name, academic_years (name), school_id")
      .eq("id", termId)
      .single();

    if (termError || !term) return errorResponse("Term not found", 404);

    // Fetch school name
    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    // Fetch income: fee payments grouped by class
    const { data: payments } = await ctx.supabase
      .from("fee_payments")
      .select("amount, fee_accounts (class_enrollments (classes (name)))")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .eq("status", "confirmed");

    // Filter to payments for this term via fee_accounts
    const { data: termAccounts } = await ctx.supabase
      .from("fee_accounts")
      .select("id")
      .eq("term_id", termId)
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    const accountIds = (termAccounts || []).map((a: any) => a.id);

    let termPayments: any[] = [];
    if (accountIds.length > 0) {
      const { data } = await ctx.supabase
        .from("fee_payments")
        .select(`
          amount,
          fee_accounts!inner (
            class_enrollments (
              classes (name)
            )
          )
        `)
        .in("fee_account_id", accountIds)
        .eq("is_deleted", false)
        .eq("status", "confirmed");
      termPayments = data || [];
    }

    // Group income by class
    const incomeMap = new Map<string, number>();
    termPayments.forEach((p: any) => {
      const className =
        p.fee_accounts?.class_enrollments?.classes?.name || "General";
      incomeMap.set(className, (incomeMap.get(className) || 0) + Number(p.amount));
    });

    const income_rows = Array.from(incomeMap.entries()).map(
      ([class_name, amount]) => ({
        class_name,
        fee_name: "Fee Collections",
        amount,
      })
    );

    const total_income = income_rows.reduce((sum, r) => sum + r.amount, 0);

    // Fetch expenses grouped by category
    const { data: expenses } = await ctx.supabase
      .from("expenses")
      .select("amount, expense_categories (name)")
      .eq("school_id", schoolId)
      .eq("term_id", termId)
      .eq("is_deleted", false);

    const expenseMap = new Map<string, number>();
    (expenses || []).forEach((e: any) => {
      const catName = e.expense_categories?.name || "Uncategorized";
      expenseMap.set(catName, (expenseMap.get(catName) || 0) + Number(e.amount));
    });

    const expense_rows = Array.from(expenseMap.entries()).map(
      ([category_name, amount]) => ({ category_name, amount })
    );

    const total_expenses = expense_rows.reduce((sum, r) => sum + r.amount, 0);

    // Generate PDF
    const termName = term.name === "Term1" ? "Term 1" : term.name === "Term2" ? "Term 2" : "Term 3";
    const academicYearName = (term as any).academic_years?.name || "";

    const buffer = await renderToBuffer(
      React.createElement(PlReportPDF, {
        school_name: school?.name || "School",
        term_name: termName,
        academic_year_name: academicYearName,
        date_generated: new Date().toLocaleDateString("en-UG"),
        income_rows,
        expense_rows,
        total_income,
        total_expenses,
      })
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pl-report-${termName.replace(/\s/g, "-")}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add app/api/fees/pl-report/route.ts
git commit -m "feat(api): add P&L report PDF generation route"
```

---

### Task 8: Sidebar Navigation Update

**Files:**
- Modify: `components/dashboard/sidebar.tsx`

- [ ] **Step 1: Add Expense icon import**

In `components/dashboard/sidebar.tsx`, add `Receipt` is already imported. Add `TrendingUp` to the lucide-react import (for the Expenses icon — or reuse `Wallet`):

The existing import already has `Wallet`, `Receipt`, `BarChart3`, etc. We'll use `TrendingDown` for expenses. Add it to the import:

```ts
import {
  // ... existing icons ...
  TrendingDown,
} from "lucide-react";
```

- [ ] **Step 2: Add Expenses nav items**

In the `NAV_ITEMS` array, inside the Fees `children` array, add after the "Discounts" entry (line 65):

```ts
{ label: "Expenses", href: "/dashboard/fees/expenses", icon: TrendingDown },
{ label: "Categories", href: "/dashboard/fees/expenses/categories", icon: CreditCard },
```

The Fees children should become:
```ts
children: [
  { label: "Fee Structure", href: "/dashboard/fees/structure", icon: CreditCard },
  { label: "Discounts", href: "/dashboard/fees/discounts", icon: CreditCard },
  { label: "Expenses", href: "/dashboard/fees/expenses", icon: TrendingDown },
  { label: "Categories", href: "/dashboard/fees/expenses/categories", icon: CreditCard },
  { label: "Fee Accounts", href: "/dashboard/fees/accounts", icon: FileText },
  { label: "Payments", href: "/dashboard/fees/payments", icon: Receipt },
  { label: "Defaulters", href: "/dashboard/fees/defaulters", icon: AlertTriangle },
  { label: "Reports", href: "/dashboard/fees/reports", icon: BarChart3 },
  { label: "Statements", href: "/dashboard/fees/statements", icon: FileText },
  { label: "Receipts", href: "/dashboard/fees/receipts", icon: Receipt },
],
```

- [ ] **Step 3: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/sidebar.tsx
git commit -m "feat(nav): add Expenses and Categories links to sidebar"
```

---

### Task 9: Categories Page

**Files:**
- Create: `app/dashboard/fees/expenses/categories/page.tsx`

- [ ] **Step 1: Create the categories page**

Create `app/dashboard/fees/expenses/categories/page.tsx`. Follow the exact pattern from `app/dashboard/fees/discounts/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';

interface ExpenseCategory {
  id: string;
  name: string;
  expense_count: number;
}

export default function ExpenseCategoriesPage() {
  const { currentTerm } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState('');

  const { data: categories, isLoading } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await fetch('/api/fees/expenses/categories');
      const json = await res.json();
      return json.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await fetch('/api/fees/expenses/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create category');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setDialogOpen(false);
      setName('');
      toast({ title: 'Category created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string }) => {
      const res = await fetch('/api/fees/expenses/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update category');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setDialogOpen(false);
      setEditingCategory(null);
      setName('');
      toast({ title: 'Category updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/fees/expenses/categories?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete category');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setDeleteTarget(null);
      toast({ title: 'Category deleted' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, name: name.trim() });
    } else {
      createMutation.mutate({ name: name.trim() });
    }
  };

  const openEditDialog = (cat: ExpenseCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setName('');
    setDialogOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expense Categories</h1>
          <p className="text-foreground/60 mt-1">Manage expense categories for your school</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Category Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Salaries, Utilities, Supplies"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
              </div>
              <Button onClick={handleSubmit} disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}>
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : categories?.length === 0 ? (
            <div className="p-12 text-center">
              <Tag className="w-12 h-12 mx-auto text-foreground/30 mb-3" />
              <p className="text-foreground/60">No categories yet</p>
              <p className="text-sm text-foreground/40 mt-1">Add your first expense category to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Expenses</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories?.map((cat: ExpenseCategory, i: number) => (
                  <motion.tr
                    key={cat.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>{cat.expense_count}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(cat)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(cat)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              {deleteTarget?.expense_count ? ` This will unlink ${deleteTarget.expense_count} expense(s) from this category.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/fees/expenses/categories/page.tsx
git commit -m "feat(ui): add expense categories management page"
```

---

### Task 10: Expense Dashboard Page

**Files:**
- Create: `app/dashboard/fees/expenses/page.tsx`

- [ ] **Step 1: Create the expense dashboard page**

Create `app/dashboard/fees/expenses/page.tsx`. Follow the pattern from `app/dashboard/fees/reports/page.tsx` (KPI cards + charts + table):

```tsx
'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { formatUGX } from '@/lib/utils/currency';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Download,
  FileText,
  Search,
  Wallet,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from 'recharts';

const CHART_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];

interface Expense {
  id: string;
  category_id: string | null;
  term_id: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  receipt_number: string | null;
  recorded_by: string | null;
  notes: string | null;
  expense_categories?: { name: string } | null;
  users?: { full_name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

export default function ExpensesPage() {
  const { currentTerm } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 20;

  // Form state
  const [form, setForm] = useState({
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    category_id: '',
    payment_method: 'cash',
    receipt_number: '',
    notes: '',
  });

  // Fetch expenses
  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses', currentTerm?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentTerm?.id) params.set('term_id', currentTerm.id);
      const res = await fetch(`/api/fees/expenses?${params}`);
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!currentTerm?.id,
  });

  // Fetch categories for filter and form
  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await fetch('/api/fees/expenses/categories');
      const json = await res.json();
      return json.data || [];
    },
  });

  // Fetch fee payments for income KPI
  const { data: payments } = useQuery({
    queryKey: ['fee-payments-income', currentTerm?.id],
    queryFn: async () => {
      const res = await fetch(`/api/fees/payments?term_id=${currentTerm?.id}`);
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!currentTerm?.id,
  });

  // Create expense mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/fees/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          amount: parseFloat(data.amount),
          term_id: currentTerm?.id || null,
          category_id: data.category_id || null,
          receipt_number: data.receipt_number || null,
          notes: data.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create expense');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: 'Expense recorded' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setForm({
      description: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      category_id: '',
      payment_method: 'cash',
      receipt_number: '',
      notes: '',
    });
  };

  // KPIs
  const totalIncome = useMemo(() => {
    if (!payments) return 0;
    return payments
      .filter((p: any) => p.status === 'confirmed')
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  }, [payments]);

  const totalExpenses = useMemo(() => {
    if (!expenses) return 0;
    return expenses.reduce((sum: number, e: Expense) => sum + Number(e.amount), 0);
  }, [expenses]);

  const netSurplus = totalIncome - totalExpenses;

  // Chart data: Income vs Expenses by week
  const weeklyChartData = useMemo(() => {
    if (!expenses || !payments) return [];

    const weekMap = new Map<number, { income: number; expenses: number }>();

    payments
      .filter((p: any) => p.status === 'confirmed')
      .forEach((p: any) => {
        const week = getWeekNumber(p.payment_date);
        const entry = weekMap.get(week) || { income: 0, expenses: 0 };
        entry.income += Number(p.amount);
        weekMap.set(week, entry);
      });

    expenses.forEach((e: Expense) => {
      const week = getWeekNumber(e.expense_date);
      const entry = weekMap.get(week) || { income: 0, expenses: 0 };
      entry.expenses += Number(e.amount);
      weekMap.set(week, entry);
    });

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([week, data]) => ({
        week: `Wk ${week}`,
        Income: data.income,
        Expenses: data.expenses,
      }));
  }, [expenses, payments]);

  // Chart data: Expenses by category
  const categoryChartData = useMemo(() => {
    if (!expenses) return [];
    const map = new Map<string, number>();
    expenses.forEach((e: Expense) => {
      const name = e.expense_categories?.name || 'Uncategorized';
      map.set(name, (map.get(name) || 0) + Number(e.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter((e: Expense) => {
      const matchesSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || e.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, search, categoryFilter]);

  const paginatedExpenses = useMemo(() => {
    return filteredExpenses.slice(page * perPage, (page + 1) * perPage);
  }, [filteredExpenses, page]);

  const totalPages = Math.ceil(filteredExpenses.length / perPage);

  // Export CSV
  const handleExportCSV = async () => {
    const params = new URLSearchParams();
    if (currentTerm?.id) params.set('term_id', currentTerm.id);
    const res = await fetch(`/api/fees/expenses/export?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${currentTerm?.id || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export P&L
  const handleExportPL = async () => {
    if (!currentTerm?.id) return;
    const res = await fetch(`/api/fees/pl-report?term_id=${currentTerm.id}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pl-report.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const methodLabels: Record<string, string> = {
    cash: 'Cash',
    bank: 'Bank',
    mobile_money: 'Mobile Money',
    cheque: 'Cheque',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expense Tracking</h1>
          <p className="text-foreground/60 mt-1">Track and analyze school expenses</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g. Electricity bill - May"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount (UGX)</Label>
                    <Input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.expense_date}
                      onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((c: Category) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Receipt Number (optional)</Label>
                  <Input
                    value={form.receipt_number}
                    onChange={(e) => setForm({ ...form, receipt_number: e.target.value })}
                    placeholder="Receipt reference"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Additional notes"
                  />
                </div>
                <Button
                  onClick={() => createMutation.mutate(form)}
                  disabled={!form.description || !form.amount || createMutation.isPending}
                  className="w-full"
                >
                  Record Expense
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleExportPL} className="bg-purple-600 text-white hover:bg-purple-700">
            <FileText className="w-4 h-4 mr-2" />
            P&L Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/60">Total Income</p>
                  <p className="text-2xl font-bold mt-1 text-green-500">{formatUGX(totalIncome)}</p>
                  <p className="text-xs text-foreground/40 mt-1">Fee payments this term</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-500/10">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/60">Total Expenses</p>
                  <p className="text-2xl font-bold mt-1 text-red-500">{formatUGX(totalExpenses)}</p>
                  <p className="text-xs text-foreground/40 mt-1">This term</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-500/10">
                  <TrendingDown className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/60">Net {netSurplus >= 0 ? 'Surplus' : 'Deficit'}</p>
                  <p className={cn('text-2xl font-bold mt-1', netSurplus >= 0 ? 'text-amber-500' : 'text-red-500')}>
                    {formatUGX(Math.abs(netSurplus))}
                  </p>
                  <p className="text-xs text-foreground/40 mt-1">{netSurplus >= 0 ? 'Surplus' : 'Deficit'} this term</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10">
                  <Wallet className="w-6 h-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Bar Chart: Income vs Expenses by Week */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-4">Income vs Expenses by Week</h3>
            {weeklyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3050" />
                  <XAxis dataKey="week" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#1a1f36', border: '1px solid #2a3050', borderRadius: 8 }}
                    labelStyle={{ color: '#ccc' }}
                    formatter={(value: number) => formatUGX(value)}
                  />
                  <Bar dataKey="Income" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-foreground/40">
                No data for this term
              </div>
            )}
          </CardContent>
        </Card>

        {/* Donut Chart: Expenses by Category */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-4">Expenses by Category</h3>
            {categoryChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <RechartsPieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      nameKey="name"
                    >
                      {categoryChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#1a1f36', border: '1px solid #2a3050', borderRadius: 8 }}
                      formatter={(value: number) => formatUGX(value)}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1">
                  {categoryChartData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs text-foreground/60">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      {entry.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-foreground/40">
                No expenses yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expense Table */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Expense Records</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                <Input
                  placeholder="Search expenses..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((c: Category) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : paginatedExpenses.length === 0 ? (
            <div className="py-12 text-center text-foreground/40">
              {search || categoryFilter !== 'all' ? 'No matching expenses' : 'No expenses recorded yet'}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Receipt #</TableHead>
                    <TableHead>Recorded By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedExpenses.map((expense: Expense, i: number) => (
                    <motion.tr
                      key={expense.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <TableCell>{formatDate(expense.expense_date)}</TableCell>
                      <TableCell>
                        {expense.expense_categories?.name ? (
                          <Badge variant="secondary">{expense.expense_categories.name}</Badge>
                        ) : (
                          <span className="text-foreground/30">—</span>
                        )}
                      </TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell className="text-right text-red-400 font-medium">
                        {formatUGX(Number(expense.amount))}
                      </TableCell>
                      <TableCell>{methodLabels[expense.payment_method || ''] || '—'}</TableCell>
                      <TableCell>{expense.receipt_number || '—'}</TableCell>
                      <TableCell>{expense.users?.full_name || '—'}</TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-foreground/60">
                    Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, filteredExpenses.length)} of {filteredExpenses.length}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/fees/expenses/page.tsx
git commit -m "feat(ui): add expense dashboard with KPIs, charts, and table"
```

---

### Task 11: Final Build Verification

- [ ] **Step 1: Run full build**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx next build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify all files exist**

```bash
ls -la supabase/migrations/00021_expenses.sql \
  app/api/fees/expenses/route.ts \
  app/api/fees/expenses/categories/route.ts \
  app/api/fees/expenses/export/route.ts \
  app/api/fees/pl-report/route.ts \
  app/dashboard/fees/expenses/page.tsx \
  app/dashboard/fees/expenses/categories/page.tsx \
  lib/pdf/pl-report.tsx
```

Expected: All 8 files exist.

- [ ] **Step 3: Verify git log**

```bash
git log --oneline -10
```

Expected: All commits from this plan are visible.

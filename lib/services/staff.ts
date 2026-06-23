/**
 * Staff domain service.
 *
 * Encapsulates CRUD for the staff table. Every mutation is wrapped
 * in `withAudit` so a failed operation is recorded too (helps
 * debugging staff "I deleted X but it didn't work" reports).
 */

import crypto from "crypto";
import type { AuthContext } from "@/lib/http";
import { AuthError } from "@/lib/http";
import { withAudit } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";
import { scopedQuery, paginated, searchFilter } from "@/lib/http/scoped";

export interface CreateStaffInput {
  full_name: string;
  role_title: string;
  national_id?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  nssf_number?: string | null;
  basic_salary?: number | null;
  hire_date?: string | null;
  is_active: boolean;
}

export interface UpdateStaffInput {
  full_name?: string;
  role_title?: string;
  national_id?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  nssf_number?: string | null;
  basic_salary?: number | null;
  hire_date?: string | null;
  is_active?: boolean;
}

export function generateEmployeeNumber(): string {
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  return `EMP-${suffix}`;
}

export async function createStaff(
  ctx: AuthContext,
  body: CreateStaffInput,
): Promise<{ id: string; employee_number: string }> {
  return withAudit(
    ctx,
    {
      action: "staff_created",
      entityType: "staff",
      entityId: null,
    },
    async () => {
      const employeeNumber = generateEmployeeNumber();

      const { data, error } = await scopedQuery(ctx, "staff")
        .insert({
          user_id: null,
          employee_number: employeeNumber,
          full_name: body.full_name,
          role_title: body.role_title,
          national_id: body.national_id ?? null,
          bank_name: body.bank_name ?? null,
          bank_account: body.bank_account ?? null,
          nssf_number: body.nssf_number ?? null,
          basic_salary: body.basic_salary ?? null,
          hire_date: body.hire_date ?? null,
          is_active: body.is_active,
        } as never)
        .select("id, employee_number")
        .single();

      if (error) {
        throw new AuthError(`Failed to create staff: ${error.message}`, 400);
      }
      if (!data) {
        throw new AuthError("Staff insert returned no row", 500);
      }

      invalidateSchoolAsync(ctx.schoolId);
      return data as { id: string; employee_number: string };
    },
  );
}

export async function updateStaff(
  ctx: AuthContext,
  id: string,
  body: UpdateStaffInput,
): Promise<{ id: string }> {
  return withAudit(
    ctx,
    {
      action: "staff_updated",
      entityType: "staff",
      entityId: id,
      newValue: body as Record<string, unknown>,
    },
    async () => {
      const { data: existing } = await scopedQuery(ctx, "staff")
        .select("id, full_name, role_title")
        .eq("id", id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (!existing) {
        throw new AuthError("Staff member not found", 404);
      }
      if (Object.keys(body).length === 0) {
        throw new AuthError("No valid fields to update", 400);
      }

      const { data, error } = await scopedQuery(ctx, "staff")
        .update(body as never)
        .eq("id", id)
        .select("id")
        .single();

      if (error) {
        throw new AuthError(`Failed to update staff: ${error.message}`, 400);
      }
      invalidateSchoolAsync(ctx.schoolId);
      return data as { id: string };
    },
  );
}

export async function softDeleteStaff(
  ctx: AuthContext,
  id: string,
): Promise<{ deleted: true }> {
  return withAudit(
    ctx,
    {
      action: "staff_deleted",
      entityType: "staff",
      entityId: id,
    },
    async () => {
      const { data: existing } = await scopedQuery(ctx, "staff")
        .select("id, full_name, employee_number")
        .eq("id", id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (!existing) {
        throw new AuthError("Staff member not found", 404);
      }

      const { error } = await scopedQuery(ctx, "staff")
        .update({ is_deleted: true, is_active: false } as never)
        .eq("id", id);

      if (error) {
        throw new AuthError(`Failed to delete staff: ${error.message}`, 400);
      }
      invalidateSchoolAsync(ctx.schoolId);
      return { deleted: true as const };
    },
  );
}

export async function listStaff(
  ctx: AuthContext,
  req: Request,
  filters: { isActive?: string | null; search?: string | null } = {},
): Promise<{
  items: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const { page, limit, from, to } = paginated.parse(req);

  let query = scopedQuery(ctx, "staff")
    .select(
      "id, school_id, user_id, employee_number, photo_url, full_name, role_title, hire_date, is_active, created_at, updated_at",
      { count: "exact" },
    )
    .eq("is_deleted", false);

  if (filters.isActive !== null && filters.isActive !== undefined && filters.isActive !== "") {
    query = query.eq("is_active", filters.isActive === "true");
  }

  const filter = searchFilter(
    ["full_name", "employee_number", "role_title"],
    filters.search ?? null,
  );
  if (filter) query = query.or(filter);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new AuthError(`Failed to load staff: ${error.message}`, 400);
  }
  return paginated.envelope(data ?? [], count ?? 0, page, limit);
}
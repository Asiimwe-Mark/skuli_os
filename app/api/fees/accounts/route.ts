import { recordPaymentSchema } from "@/lib/validations/fees";
import { route, respond, paginated, errorResponse } from "@/lib/http";
import { listFeeAccounts, recordPayment, updateFeeAccount } from "@/lib/services/fees";
import { withSchoolReadCache } from "@/lib/http/with-cache";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const termId = url.searchParams.get("term_id");
    const classId = url.searchParams.get("class_id");
    const status = url.searchParams.get("status");
    const inputShape = `fees-accounts:${termId ?? "_"}:${classId ?? "_"}:${status ?? "_"}`;

    const { value, applyTo } = await withSchoolReadCache(
      { schoolId: ctx.schoolId, inputShape },
      async () => listFeeAccounts(ctx, request, { termId, classId, status }),
    );

    return applyTo(respond.cacheable(value));
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: recordPaymentSchema,
  handler: async (ctx, body) => {
    const payment = await recordPayment(ctx, body);
    return respond.status(201, payment);
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const body = await request.json();
    const { id, ...updates } = body as {
      id?: string;
      total_expected?: number;
      total_paid?: number;
      balance?: number;
      status?: import("@/types/database").Database["public"]["Enums"]["fee_account_status"];
    };
    if (!id) {
      return { error: "Fee account ID is required", status: 400 };
    }
    const updated = await updateFeeAccount(ctx, id, updates);
    return updated;
  },
});
import { recordPaymentSchema } from "@/lib/validations/fees";
import { route, respond } from "@/lib/http";
import { listPayments } from "@/lib/services/fees";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const envelope = await listPayments(ctx, request);
    return envelope;
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: recordPaymentSchema,
  handler: async (ctx, body) => {
    const payment = await import("@/lib/services/fees").then((m) => m.recordPayment(ctx, body));
    return respond.status(201, payment);
  },
});
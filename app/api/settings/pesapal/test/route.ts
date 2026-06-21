import { route } from "@/lib/http";
import { getPesapalToken } from "@/lib/gateways/pesapal";

/** GET: test the Pesapal connection by acquiring a Bearer token. */
export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async () => {
    try {
      const token = await getPesapalToken();
      return { ok: !!token, message: "Connection successful" };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Connection failed",
      };
    }
  },
});
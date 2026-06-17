import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { conciergeRequestSchema } from "@/lib/validations/concierge";
import { resend } from "@/lib/email/client";
import { getConciergeConfirmationHtml } from "@/lib/email/templates/concierge-confirmation";
import { checkRateLimitAsync } from "@/lib/utils/rate-limit";

// POST (public): create a concierge lead.
export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = await checkRateLimitAsync(`concierge:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = conciergeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("concierge_leads").insert({
      school_name: parsed.data.school_name,
      contact_name: parsed.data.contact_name,
      contact_phone: parsed.data.contact_phone,
      contact_email: parsed.data.contact_email,
      district: parsed.data.district ?? null,
      student_count: parsed.data.student_count ?? null,
      current_system: parsed.data.current_system ?? null,
      preferred_date: parsed.data.preferred_date ?? null,
      notes: parsed.data.notes ?? null,
    });

    if (error) {
      console.error("[concierge] insert error:", error.message);
      return NextResponse.json({ success: false, error: "Could not submit request" }, { status: 500 });
    }

    try {
      await resend.emails.send({
        from: "SKULI <noreply@skuli.app>",
        to: parsed.data.contact_email,
        subject: "Your SKULI Setup Request",
        html: getConciergeConfirmationHtml(parsed.data.contact_name, parsed.data.school_name),
      });
    } catch {
      // Don't fail the request if the email fails.
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    console.error("[concierge] error:", e);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

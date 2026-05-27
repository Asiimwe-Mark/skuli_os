// Supabase Edge Function: fee-account-recalculate
// Triggered on fee_payment insert/update — recalculates fee_account totals
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { fee_account_id } = await req.json();

    if (!fee_account_id) {
      return new Response(
        JSON.stringify({ error: "fee_account_id required" }),
        { status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the fee account
    const { data: account, error: accountError } = await supabase
      .from("fee_accounts")
      .select("id, student_id, term_id, school_id")
      .eq("id", fee_account_id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: "Fee account not found" }),
        { status: 404 }
      );
    }

    // Get fee structures for this term
    const { data: structures } = await supabase
      .from("fee_structures")
      .select("amount, is_mandatory")
      .eq("school_id", account.school_id)
      .eq("term_id", account.term_id)
      .eq("is_deleted", false);

    const totalExpected =
      structures?.reduce((sum, s) => sum + Number(s.amount), 0) || 0;

    // Get confirmed payments
    const { data: payments } = await supabase
      .from("fee_payments")
      .select("amount")
      .eq("fee_account_id", fee_account_id)
      .eq("status", "confirmed");

    const totalPaid =
      payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

    const balance = totalExpected - totalPaid;

    let status: string;
    if (balance < 0) {
      status = "overpaid";
    } else if (balance === 0) {
      status = "paid";
    } else if (totalPaid > 0) {
      status = "partial";
    } else {
      status = "unpaid";
    }

    // Update the fee account
    const { error: updateError } = await supabase
      .from("fee_accounts")
      .update({
        total_expected: totalExpected,
        total_paid: totalPaid,
        balance,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fee_account_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        data: { total_expected: totalExpected, total_paid: totalPaid, balance, status },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

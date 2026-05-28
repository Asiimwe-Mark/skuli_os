// Supabase Edge Function: fee-account-recalculate
// Calls the recalculate_fee_account() DB function which handles discounts
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

    // Call the DB function which handles discount subtraction
    const { error } = await supabase.rpc("recalculate_fee_account", {
      p_account_id: fee_account_id,
    });

    if (error) throw error;

    // Fetch the updated account to return
    const { data: account } = await supabase
      .from("fee_accounts")
      .select("total_expected, total_paid, balance, status")
      .eq("id", fee_account_id)
      .single();

    return new Response(
      JSON.stringify({ success: true, data: account }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

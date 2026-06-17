"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { Loader2, Save, Smartphone, Building2, AlertCircle } from "lucide-react";

const BANKS = ["Stanbic", "Centenary", "Absa", "DFCU", "Equity", "KCB", "PostBank"];

type Method = "MOBILE_MONEY" | "BANK" | null;

interface ProfileRow {
  id: string;
  school_id: string;
  preferred_method: "MOBILE_MONEY" | "BANK";
  mobile_number: string | null;
  bank_code: string | null;
  bank_name: string | null;
  account_number: string | null;
}

/**
 * Self-service payout selector. The teacher picks how they want to receive
 * salary: Mobile Money (MTN/Airtel) or Bank Transfer. Saves go through
 * PATCH /api/v1/staff/[id]/payment-profile keyed by their staff.id (looked
 * up from the `staff` table via their auth user id).
 */
export function PaymentOptionForm({
  userId,
  schoolId,
  schoolCashOn,
}: {
  userId: string;
  schoolId: string | null;
  schoolCashOn: boolean;
}) {
  const supabase = useSupabaseBrowser();
  const { toast } = useToast();

  const [staffId, setStaffId] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>(null);
  const [mobileNumber, setMobileNumber] = useState("");
  const [bankName, setBankName] = useState(BANKS[0]);
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Find the staff row for this user. Staff.user_id is the link.
      const { data: staffRow, error: staffErr } = await supabase
        .from("staff")
        .select("id, school_id, full_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (staffErr || !staffRow) {
        setError("No staff record found for your account. Contact the school admin.");
        setLoading(false);
        return;
      }
      const s = staffRow as unknown as {
        id: string;
        school_id: string;
        full_name: string;
      };
      setStaffId(s.id);

      // Fetch existing profile (if any)
      const { data: profile } = await supabase
        .from("staff_payment_profiles")
        .select("id, school_id, preferred_method, mobile_number, bank_code, bank_name, account_number")
        .eq("staff_id", s.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile) {
        const p = profile as unknown as ProfileRow;
        setMethod(p.preferred_method);
        setMobileNumber(p.mobile_number ?? "");
        setBankName(p.bank_name ?? BANKS[0]);
        setAccountNumber(p.account_number ?? "");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, userId]);

  async function save() {
    if (!staffId) return;
    if (method === null) {
      toast({
        title: "Pick a payment method",
        description: "Choose Mobile Money or Bank to receive your salary.",
        variant: "destructive",
      });
      return;
    }
    if (method === "MOBILE_MONEY" && !mobileNumber.trim()) {
      toast({ title: "Mobile number required", variant: "destructive" });
      return;
    }
    if (method === "BANK" && !accountNumber.trim()) {
      toast({ title: "Account number required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const body =
        method === "MOBILE_MONEY"
          ? { preferred_method: method, mobile_number: mobileNumber }
          : {
              preferred_method: method,
              bank_code: bankName,
              bank_name: bankName,
              account_number: accountNumber,
            };
      const res = await fetch(`/api/v1/staff/${staffId}/payment-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast({
        title: "Payment option updated",
        description: "Your next salary will be paid to this method.",
        variant: "success",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-5 w-5 animate-spin text-secondary" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-secondary" />
            Payment Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Payment Method</span>
            {method ? (
              <Badge className="bg-success-50 text-success-600">
                {method === "MOBILE_MONEY" ? "Mobile Money" : "Bank Transfer"}
              </Badge>
            ) : (
              <Badge variant="warning">Not set</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted">
            Choose how you want to receive your salary. This is updated everywhere - your
            school admin can see it on the Payroll page and your next salary will be
            disbursed to the selected channel.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                { key: "MOBILE_MONEY", label: "Mobile Money", icon: Smartphone, hint: "MTN or Airtel" },
                { key: "BANK", label: "Bank Transfer", icon: Building2, hint: "Stanbic, Centenary?EUR?" },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = method === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setMethod(opt.key)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all",
                    selected
                      ? "border-border bg-warning-50"
                      : "border-border hover:border-border dark:border-border"
                  )}
                >
                  <div className="flex w-full items-center gap-2">
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        selected ? "text-secondary" : "text-muted"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        selected ? "text-secondary" : "text-heading"
                      )}
                    >
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{opt.hint}</p>
                </button>
              );
            })}
          </div>

          {method === "MOBILE_MONEY" && (
            <div className="space-y-2">
              <Label htmlFor="mobile_number">Mobile Number (MTN / Airtel)</Label>
              <Input
                id="mobile_number"
                inputMode="tel"
                placeholder="07XXXXXXXX"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
              />
              <p className="text-xs text-muted">
                Format: 07XXXXXXXX. We will normalise it to 256XXXXXXXXX before disbursement.
              </p>
            </div>
          )}

          {method === "BANK" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bank_name">Bank</Label>
                <select
                  id="bank_name"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
                >
                  {BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="account_number">Account Number</Label>
                <Input
                  id="account_number"
                  inputMode="numeric"
                  placeholder="0123456789"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {!schoolCashOn
                ? "Note: your school has cash payouts disabled. Choose one of the methods above so salaries reach you on time."
                : "You can also be paid in cash if your school prefers. Choosing a method here is optional."}
            </p>
            <Button onClick={save} disabled={saving || !method}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { useSchoolStore } from "@/store/school";

const BANKS = ["Stanbic", "Centenary", "Absa", "DFCU", "Equity", "KCB", "PostBank"];

interface PaymentProfile {
  preferred_method?: "MOBILE_MONEY" | "BANK";
  mobile_number?: string;
  bank_name?: string;
  account_number?: string;
}

export default function StaffPaymentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { school } = useSchoolStore();
  const queryClient = useQueryClient();
  const staffId = params.id as string;

  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<"MOBILE_MONEY" | "BANK">("MOBILE_MONEY");
  const [mobileNumber, setMobileNumber] = useState("");
  const [bankName, setBankName] = useState(BANKS[0]);
  const [accountNumber, setAccountNumber] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["staff-payment-profile", school?.id, staffId],
    queryFn: async (): Promise<PaymentProfile | null> => {
      const r = await fetch(`/api/v1/staff/${staffId}/payment-profile`);
      const json = await r.json();
      return json.data ?? null;
    },
    enabled: !!school?.id,
  });

  useEffect(() => {
    if (data) {
      setMethod(data.preferred_method ?? "MOBILE_MONEY");
      setMobileNumber(data.mobile_number ?? "");
      setBankName(data.bank_name ?? BANKS[0]);
      setAccountNumber(data.account_number ?? "");
    }
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      const body =
        method === "MOBILE_MONEY"
          ? { preferred_method: method, mobile_number: mobileNumber }
          : { preferred_method: method, bank_code: bankName, bank_name: bankName, account_number: accountNumber };
      const res = await fetch(`/api/v1/staff/${staffId}/payment-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast({ title: "Payment profile saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["staff-payment-profile", school?.id, staffId] });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin text-secondary" /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg space-y-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-heading hover:text-heading">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div>
        <h1 className="text-2xl font-bold font-display">Payment Profile</h1>
        <p className="mt-1 text-sm text-muted">Where this staff member receives their salary.</p>
      </div>

      <Card className="bg-card">
        <CardHeader><CardTitle>Payout Method</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            {(["MOBILE_MONEY", "BANK"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all",
                  method === m
                    ? "border-warning-500 bg-warning-100 text-warning-700"
                    : "border-border text-text-muted hover:border-border hover:text-text-heading"
                )}
              >
                {m === "MOBILE_MONEY" ? "Mobile Money" : "Bank"}
              </button>
            ))}
          </div>

          {method === "MOBILE_MONEY" ? (
            <div className="space-y-2">
              <Label>Mobile Number</Label>
              <Input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="07XXXXXXXX" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Bank</Label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-bg-tertiary px-3 text-sm text-heading"
                >
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </div>
            </>
          )}

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Payment Profile
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

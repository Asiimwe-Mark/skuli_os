"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToast } from "@/components/ui/use-toast";
import {
  CreditCard,
  CheckCircle2,
  ArrowUpRight,
  Download,
  Crown,
  Zap,
  Rocket,
  AlertCircle,
  Calendar,
  Receipt,
  Loader2,
} from "lucide-react";
import type { SubscriptionInvoice, SubscriptionPlan } from "@/types";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

interface PlanDetails {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  price: number;
  maxStudents: number;
  features: string[];
  color: string;
  borderColor: string;
}

const plans: Record<SubscriptionPlan, PlanDetails> = {
  trial: {
    name: "Trial",
    icon: Zap,
    price: 0,
    maxStudents: 50,
    features: ["50 students", "Basic reports", "SMS (pay-as-you-go)", "Email support"],
    color: "text-gray-400",
    borderColor: "border-gray-500/30",
  },
  starter: {
    name: "Starter",
    icon: CreditCard,
    price: 50000,
    maxStudents: 200,
    features: ["200 students", "Full reports", "100 SMS/month", "Email support"],
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
  },
  growth: {
    name: "Growth",
    icon: Crown,
    price: 120000,
    maxStudents: 500,
    features: ["500 students", "Advanced reports", "500 SMS/month", "Priority support", "Parent portal"],
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
  },
  pro: {
    name: "Pro",
    icon: Rocket,
    price: 250000,
    maxStudents: 99999,
    features: ["Unlimited students", "All reports", "Unlimited SMS", "Dedicated support", "Parent portal", "API access"],
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
  },
};

export default function BillingPage() {
  const { school, setSchool } = useSchoolStore();
  const { canManageSchool } = usePermissions();
  const supabase = createBrowserClient();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<SubscriptionPlan | null>(null);

  // Handle payment success redirect
  useEffect(() => {
    const paymentStatus = searchParams.get("payment_status");
    if (paymentStatus === "success") {
      toast({ title: "Payment successful!", description: "Your plan has been upgraded.", variant: "success" });
      // Refresh school data
      if (school) {
        supabase.from("schools").select("*").eq("id", school.id).single().then(({ data }: { data: any }) => {
          if (data) setSchool(data);
        });
      }
      // Clean URL
      router.replace("/dashboard/settings/billing");
    }
  }, [searchParams, school, supabase, setSchool, router, toast]);

  useEffect(() => {
    async function loadBilling() {
      if (!school) return;

      const { data: invoiceData } = await supabase
        .from("subscription_invoices")
        .select("*")
        .eq("school_id", school.id)
        .order("created_at", { ascending: false });

      if (invoiceData) setInvoices(invoiceData);

      const { count } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("school_id", school.id)
        .eq("status", "active");

      if (count !== null) setStudentCount(count);

      setLoading(false);
    }
    loadBilling();
  }, [school, supabase]);

  const currentPlan = school?.subscription_plan || "trial";
  const planDetails = plans[currentPlan];
  const usagePercent = school ? Math.min((studentCount / school.max_students) * 100, 100) : 0;

  const nextBillingDate = useMemo(() => {
    if (currentPlan === "trial") return null;
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [currentPlan]);

  async function handleUpgradePlan(plan: SubscriptionPlan) {
    setUpgradeLoading(plan);
    try {
      const response = await fetch("/api/billing/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to initiate payment");
      if (data.payment_link) {
        window.location.href = data.payment_link;
      }
    } catch (err) {
      toast({
        title: "Payment error",
        description: err instanceof Error ? err.message : "Failed to initiate payment",
        variant: "destructive",
      });
      setUpgradeLoading(null);
    }
  }

  async function handleCancelSubscription() {
    if (!school) return;
    try {
      const { error } = await supabase
        .from("schools")
        .update({ subscription_status: "cancelled" })
        .eq("id", school.id);

      if (error) throw error;
      toast({ title: "Subscription cancelled", description: "Your plan will remain active until the end of the billing period." });
      setCancelOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to cancel";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div {...fadeInUp}>
        <h1 className="text-2xl font-bold">Billing & Subscription</h1>
        <p className="text-foreground/60 text-sm">Manage your plan and payment history</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Plan */}
        <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
          <Card className={cn("border bg-surface", planDetails.borderColor)}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <planDetails.icon className={cn("w-5 h-5", planDetails.color)} />
                  Current Plan
                </div>
                <Badge className={cn("text-sm", planDetails.color, planDetails.borderColor)}>
                  {planDetails.name}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-bold">
                  {planDetails.price === 0 ? "Free" : formatUGX(planDetails.price)}
                  {planDetails.price > 0 && <span className="text-sm text-foreground/40 font-normal">/month</span>}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/70">Features:</p>
                <ul className="space-y-1.5">
                  {planDetails.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-foreground/60">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {nextBillingDate && (
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Calendar className="w-4 h-4" />
                  Next billing: {formatDate(nextBillingDate)}
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground/60">Student usage</span>
                  <span className="font-medium">
                    {studentCount} / {school?.max_students === 99999 ? "Unlimited" : school?.max_students}
                  </span>
                </div>
                <Progress value={usagePercent} className={cn(usagePercent > 90 && "[&>div]:bg-rose-500")} />
                {usagePercent > 90 && (
                  <p className="text-xs text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Approaching student limit. Consider upgrading.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {canManageSchool && (
                  <Button onClick={() => setShowUpgrade(!showUpgrade)} variant="outline" className="flex-1">
                    <ArrowUpRight className="w-4 h-4 mr-2" />
                    {showUpgrade ? "Hide Plans" : "Upgrade Plan"}
                  </Button>
                )}
                {canManageSchool && currentPlan !== "trial" && school?.subscription_status === "active" && (
                  <Button variant="ghost" className="text-rose-400" onClick={() => setCancelOpen(true)}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Payment History */}
        <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-foreground/40">
                  <Receipt className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No payment history yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-navy-900/50 hover:bg-navy-900 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{formatUGX(inv.amount)}</p>
                        <p className="text-xs text-foreground/40">
                          {formatDate(inv.period_start)} - {formatDate(inv.period_end)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn(
                            "text-[10px]",
                            inv.status === "paid"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                              : inv.status === "pending"
                              ? "bg-amber-400/15 text-amber-400 border-amber-400/20"
                              : "bg-rose-500/15 text-rose-400 border-rose-500/20"
                          )}
                        >
                          {inv.status}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Plan Comparison */}
      {showUpgrade && (
        <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-lg">Compare Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(Object.entries(plans) as [SubscriptionPlan, PlanDetails][]).map(([key, plan]) => {
                  const isCurrent = key === currentPlan;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "p-4 rounded-xl border transition-all",
                        isCurrent
                          ? "border-amber-400/50 bg-amber-400/5"
                          : "border-navy-700 bg-navy-900/50 hover:border-navy-600"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <plan.icon className={cn("w-5 h-5", plan.color)} />
                        <span className="font-semibold">{plan.name}</span>
                        {isCurrent && (
                          <Badge className="bg-amber-400/15 text-amber-400 border-amber-400/20 text-[10px] ml-auto">
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-2xl font-bold mb-3">
                        {plan.price === 0 ? "Free" : formatUGX(plan.price)}
                      </p>
                      <ul className="space-y-1.5 mb-4">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-foreground/60">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      {!isCurrent && canManageSchool && (
                        <Button
                          size="sm"
                          variant={key === "pro" ? "default" : "outline"}
                          className="w-full"
                          disabled={upgradeLoading !== null}
                          onClick={() => handleUpgradePlan(key)}
                        >
                          {upgradeLoading === key ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 mr-1" />
                          )}
                          {upgradeLoading === key ? "Redirecting..." : "Upgrade"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Cancel Confirmation */}
      <ConfirmModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel Subscription"
        description="Are you sure you want to cancel your subscription? Your plan will remain active until the end of the current billing period."
        confirmText="Cancel Subscription"
        variant="destructive"
        onConfirm={handleCancelSubscription}
      />
    </div>
  );
}

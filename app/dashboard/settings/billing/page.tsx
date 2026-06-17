"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { formatUGX } from "@/lib/utils/currency";
import { PLAN_CONFIG, type PlanKey } from "@/lib/config/plans";
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
import type { School, SubscriptionInvoice, SubscriptionPlan } from "@/types";

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

// UI-only presentation metadata, keyed by plan. Pricing/features come from
// the canonical PLAN_CONFIG (lib/config/plans.ts) so they never drift.
const planPresentation: Record<PlanKey, { icon: PlanDetails["icon"]; color: string; borderColor: string }> = {
  trial: { icon: Zap, color: "text-text-muted", borderColor: "border-border" },
  starter: { icon: CreditCard, color: "text-info-700", borderColor: "border-border" },
  growth: { icon: Crown, color: "text-warning-700", borderColor: "border-warning-100" },
  pro: { icon: Rocket, color: "text-success-700", borderColor: "border-success-100" },
};

const plans: Record<SubscriptionPlan, PlanDetails> = (Object.keys(PLAN_CONFIG) as PlanKey[]).reduce(
  (acc, key) => {
    const cfg = PLAN_CONFIG[key];
    const ui = planPresentation[key];
    acc[key as SubscriptionPlan] = {
      name: cfg.name,
      icon: ui.icon,
      price: cfg.price_ugx,
      maxStudents: cfg.max_students,
      features: [...cfg.features],
      color: ui.color,
      borderColor: ui.borderColor,
    };
    return acc;
  },
  {} as Record<SubscriptionPlan, PlanDetails>
);

export default function BillingPage() {
  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const setSchool = useSchoolStore((s) => s.setSchool);
  const { canManageSchool } = usePermissions();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();

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
        supabase
          .from("schools")
          .select(
            "id, name, logo_url, address, district, phone, email, motto, school_type, school_code, group_id, subscription_plan, subscription_status, trial_ends_at, max_students, africas_talking_username, cash_on, created_at, updated_at, is_deleted"
          )
          .eq("id", school.id)
          .single()
          .then(({ data }) => {
            if (data) setSchool(data as School);
          });
        queryClient.invalidateQueries({ queryKey: ["settings-billing", school.id] });
      }
      // Clean URL
      router.replace("/dashboard/settings/billing");
    }
  }, [searchParams, school, supabase, setSchool, router, toast, queryClient]);

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<SubscriptionInvoice[]>({
    queryKey: ["settings-billing", school?.id, "invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_invoices")
        .select("id, school_id, plan, amount, currency, status, paid_at, period_start, period_end, created_at, pesapal_tx_id")
        .eq("school_id", school!.id)
        .order("created_at", { ascending: false });
      return (data || []) as SubscriptionInvoice[];
    },
    enabled: !!school?.id,
  });

  const { data: studentCount = 0, isLoading: studentsLoading } = useQuery<number>({
    queryKey: ["settings-billing", school?.id, "student-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("school_id", school!.id)
        .eq("status", "active");
      return count ?? 0;
    },
    enabled: !!school?.id,
  });

  const loading = !school || invoicesLoading || studentsLoading;

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
      queryClient.invalidateQueries({ queryKey: ["settings-billing", school.id] });
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
        <p className="text-heading text-sm">Manage your plan and payment history</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Plan */}
        <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
          <Card className={cn("border bg-card", planDetails.borderColor)}>
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
                  {planDetails.price > 0 && <span className="text-sm text-heading font-normal">/month</span>}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-heading">Features:</p>
                <ul className="space-y-1.5">
                  {planDetails.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-heading">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success-600 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {nextBillingDate && (
                <div className="flex items-center gap-2 text-sm text-heading">
                  <Calendar className="w-4 h-4" />
                  Next billing: {formatDate(nextBillingDate)}
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-heading">Student usage</span>
                  <span className="font-medium">
                    {studentCount} / {school?.max_students === 99999 ? "Unlimited" : school?.max_students}
                  </span>
                </div>
                <Progress value={usagePercent} className={cn(usagePercent > 90 && "[&>div]:bg-bg-tertiary")} />
                {usagePercent > 90 && (
                  <p className="text-xs text-warning-700 flex items-center gap-1">
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
                  <Button variant="ghost" className="text-danger-600" onClick={() => setCancelOpen(true)}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Payment History */}
        <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5 text-text-heading" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-heading">
                  <Receipt className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No payment history yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary hover:bg-card-hover transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{formatUGX(inv.amount)}</p>
                        <p className="text-xs text-heading">
                          {formatDate(inv.period_start ?? '')} - {formatDate(inv.period_end ?? '')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn(
                            "text-[10px]",
                            inv.status === "paid"
                              ? "bg-success-50 text-success-700 border-success-100"
                              : inv.status === "pending"
                              ? "bg-warning-50 text-warning-700 border-warning-100"
                              : "bg-danger-50 text-danger-700 border-danger-100"
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
          <Card className="bg-card">
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
                          ? "border-warning-100 bg-warning-50"
                          : "border-border bg-bg-tertiary hover:border-border"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <plan.icon className={cn("w-5 h-5", plan.color)} />
                        <span className="font-semibold">{plan.name}</span>
                        {isCurrent && (
                          <Badge className="bg-warning-50 text-warning-700 border-warning-100 text-[10px] ml-auto">
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-2xl font-bold mb-3">
                        {plan.price === 0 ? "Free" : formatUGX(plan.price)}
                      </p>
                      <ul className="space-y-1.5 mb-4">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-heading">
                            <CheckCircle2 className="w-3 h-3 text-success-600 shrink-0" />
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

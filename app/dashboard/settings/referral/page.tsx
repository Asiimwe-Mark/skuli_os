"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useSchoolStore } from "@/store/school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { Gift, Copy, Check, Users, Clock, CalendarCheck } from "lucide-react";

interface ReferralRow {
  id: string;
  schoolName: string;
  signupDate: string;
  status: "pending" | "credited";
}

interface ReferralData {
  code: string | null;
  totalReferrals: number;
  creditedMonths: number;
  pendingReferrals: number;
  referrals: ReferralRow[];
}

export default function ReferralPage() {
  const { toast } = useToast();
  const school = useSchoolStore((s) => s.school);
  const [copied, setCopied] = useState(false);

  const { data = null, isLoading: loading } = useQuery<ReferralData | null>({
    queryKey: ["settings-referral", school?.id],
    queryFn: async () => {
      const res = await fetch("/api/referral/code");
      const json = await res.json();
      return (json.data ?? null) as ReferralData | null;
    },
    enabled: !!school?.id,
  });

  const appUrl =
    (typeof window !== "undefined" ? window.location.origin : "https://skuli.app");
  const link = data?.code ? `${appUrl}/onboard?ref=${data.code}` : "";

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "Copied!", description: "Referral link copied to clipboard.", variant: "success" });
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="w-6 h-6 text-warning-600" /> Referral Programme
        </h1>
        <p className="text-muted text-sm">
          Invite other schools and earn one free month for each that subscribes.
        </p>
      </motion.div>

      <Card className="border-warning-100 bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Your referral link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.code ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 rounded-lg bg-bg-tertiary px-3 py-2 text-sm break-all">{link}</code>
              <Button onClick={copyLink} variant="outline" className="shrink-0">
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">No referral code yet. Please contact support.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Successful referrals" value={data?.totalReferrals ?? 0} />
        <StatCard icon={Clock} label="Pending referrals" value={data?.pendingReferrals ?? 0} />
        <StatCard icon={CalendarCheck} label="Credited months" value={data?.creditedMonths ?? 0} />
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Your referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.referrals.length ?? 0) === 0 ? (
            <p className="text-sm text-muted py-6 text-center">No referrals yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="py-2 pr-4">School</th>
                    <th className="py-2 pr-4">Signup date</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.referrals.map((r) => (
                    <tr key={r.id} className="border-b border-border">
                      <td className="py-2 pr-4">{r.schoolName}</td>
                      <td className="py-2 pr-4">{new Date(r.signupDate).toLocaleDateString()}</td>
                      <td className="py-2">
                        <Badge className={r.status === "credited" ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}>
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>1. Share your unique referral link with another school.</p>
          <p>2. When they sign up using your link and pay for their first term, you both earn one free month.</p>
          <p>3. Credits accumulate and are automatically applied before your next invoice.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card className="bg-card">
      <CardContent className="flex items-center gap-3 py-5">
        <div className="w-10 h-10 rounded-lg bg-warning-100 flex items-center justify-center">
          <Icon className="w-5 h-5 text-warning-700" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

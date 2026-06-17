"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift } from "lucide-react";

interface AdminReferralRow {
  id: string;
  code: string;
  schoolName: string;
  isActive: boolean;
  totalReferrals: number;
  creditedMonths: number;
}

export default function AdminReferralsPage() {
  const [rows, setRows] = useState<AdminReferralRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/referrals")
      .then((r) => r.json())
      .then((res) => setRows(res.data?.referrals ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const leaderboard = [...rows].slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="w-6 h-6 text-warning-600" /> Referral Programme
        </h1>
        <p className="text-muted text-sm">All referral codes and top referrers.</p>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Top referrers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted">No referrals yet.</p>
          ) : (
            leaderboard.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm">
                  <span className="text-warning-600 font-bold mr-2">#{i + 1}</span>
                  {r.schoolName}
                </span>
                <span className="text-sm font-medium">{r.totalReferrals} referrals</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">All referral codes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="py-2 pr-4">School</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Referrals</th>
                  <th className="py-2 pr-4">Credited months</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-2 pr-4">{r.schoolName}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.code}</td>
                    <td className="py-2 pr-4">{r.totalReferrals}</td>
                    <td className="py-2 pr-4">{r.creditedMonths}</td>
                    <td className="py-2">
                      <Badge className={r.isActive ? "bg-success-50 text-success-600" : "bg-bg-tertiary text-muted"}>
                        {r.isActive ? "active" : "inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Wallet,
  CalendarCheck,
  School,
} from "lucide-react";

interface SchoolSummary {
  id: string;
  name: string;
  studentCount: number;
  feeCollected: number;
  attendanceRate: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  delay = 0,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className="border-border-subtle bg-surface hover:border-border-glow transition-all duration-300">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function GroupOverviewPage() {
  const { group } = useSchoolStore();
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalFees, setTotalFees] = useState(0);
  const [avgAttendance, setAvgAttendance] = useState(0);
  const [schoolSummaries, setSchoolSummaries] = useState<SchoolSummary[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!group) return;

      const { data: schools } = await supabase
        .from("schools")
        .select("id, name")
        .eq("group_id", group.id)
        .eq("is_deleted", false);

      if (!schools || schools.length === 0) {
        setLoading(false);
        return;
      }

      let totalStud = 0;
      let totalFee = 0;
      let totalAttPct = 0;
      let attSchools = 0;
      const summaries: SchoolSummary[] = [];

      for (const school of schools) {
        const { count: studCount } = await supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("school_id", school.id)
          .eq("is_deleted", false)
          .eq("status", "active");

        const sc = studCount ?? 0;
        totalStud += sc;

        const { data: payments } = await supabase
          .from("fee_payments")
          .select("amount")
          .eq("school_id", school.id)
          .eq("status", "confirmed");

        const fee = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
        totalFee += fee;

        const today = new Date().toISOString().split("T")[0];
        const { data: attRecords } = await supabase
          .from("attendance_records")
          .select("status")
          .eq("school_id", school.id)
          .eq("date", today);

        let attRate = 0;
        if (attRecords && attRecords.length > 0) {
          const present = attRecords.filter((r) => r.status === "present").length;
          attRate = Math.round((present / attRecords.length) * 100);
          totalAttPct += attRate;
          attSchools++;
        }

        summaries.push({
          id: school.id,
          name: school.name,
          studentCount: sc,
          feeCollected: fee,
          attendanceRate: attRate,
        });
      }

      setTotalStudents(totalStud);
      setTotalFees(totalFee);
      setAvgAttendance(attSchools > 0 ? Math.round(totalAttPct / attSchools) : 0);
      setSchoolSummaries(summaries);
      setLoading(false);
    }

    loadData();
  }, [group, supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{group?.name || "Group Overview"}</h1>
        <p className="text-foreground/60 text-sm">
          {schoolSummaries.length} school{schoolSummaries.length !== 1 ? "s" : ""} in this group
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Students"
          value={totalStudents.toLocaleString()}
          icon={Users}
          color="bg-amber-500/10 text-amber-400"
          delay={0}
        />
        <StatCard
          label="Total Fees Collected"
          value={formatUGX(totalFees)}
          icon={Wallet}
          color="bg-emerald-500/10 text-emerald-400"
          delay={0.1}
        />
        <StatCard
          label="Avg Attendance Today"
          value={`${avgAttendance}%`}
          icon={CalendarCheck}
          color="bg-blue-500/10 text-blue-400"
          delay={0.2}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Schools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {schoolSummaries.map((school, i) => (
            <motion.div
              key={school.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
            >
              <Card className="border-border-subtle bg-surface hover:border-border-glow transition-all duration-300">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <School className="w-4 h-4 text-amber-400" />
                    {school.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{school.studentCount}</p>
                      <p className="text-[10px] text-foreground/60">Students</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatUGX(school.feeCollected)}</p>
                      <p className="text-[10px] text-foreground/60">Fees</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {school.attendanceRate > 0 ? `${school.attendanceRate}%` : "—"}
                      </p>
                      <p className="text-[10px] text-foreground/60">Attendance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

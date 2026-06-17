"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSchoolStore } from "@/store/school";
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
  student_count: number;
  fee_collected: number;
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
      <Card className="bg-card transition-all duration-300">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-heading">{label}</p>
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
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalFees, setTotalFees] = useState(0);
  const [schoolSummaries, setSchoolSummaries] = useState<SchoolSummary[]>([]);

  useEffect(() => {
    async function loadData() {
      const res = await fetch("/api/group/schools");
      const json = await res.json();

      if (json.success && json.data) {
        const { schools, totals } = json.data;
        setSchoolSummaries(schools ?? []);
        setTotalStudents(totals?.students ?? 0);
        setTotalFees(totals?.fees ?? 0);
      }
      setLoading(false);
    }

    loadData();
  }, []);

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
        <p className="text-heading text-sm">
          {schoolSummaries.length} school{schoolSummaries.length !== 1 ? "s" : ""} in this group
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Students"
          value={(totalStudents ?? 0).toLocaleString()}
          icon={Users}
          color="bg-warning-50 text-warning-700"
          delay={0}
        />
        <StatCard
          label="Total Fees Collected"
          value={formatUGX(totalFees ?? 0)}
          icon={Wallet}
          color="bg-success-50 text-success-700"
          delay={0.1}
        />
        <StatCard
          label="Schools"
          value={String(schoolSummaries.length)}
          icon={CalendarCheck}
          color="bg-info-50 text-info-700"
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
              <Card className="bg-card transition-all duration-300">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <School className="w-4 h-4 text-warning-600" />
                    {school.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-text-heading">{school.student_count}</p>
                      <p className="text-[10px] text-text-muted">Students</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-success-700">{formatUGX(school.fee_collected)}</p>
                      <p className="text-[10px] text-text-muted">Fees</p>
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

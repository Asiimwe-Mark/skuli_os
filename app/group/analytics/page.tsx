"use client";

import { useEffect, useState } from "react";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

const CHART_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"];

interface FeeBySchool {
  name: string;
  amount: number;
}

interface AttendanceByWeek {
  week: string;
  [schoolName: string]: number | string;
}

interface AcademicByClass {
  className: string;
  [schoolName: string]: number | string;
}

export default function GroupAnalyticsPage() {
  const { group } = useSchoolStore();
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [feeBySchool, setFeeBySchool] = useState<FeeBySchool[]>([]);
  const [attendanceByWeek, setAttendanceByWeek] = useState<AttendanceByWeek[]>([]);
  const [academicByClass, setAcademicByClass] = useState<AcademicByClass[]>([]);
  const [schoolNames, setSchoolNames] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!group) return;

      const { data: schools } = await supabase
        .from("schools")
        .select("id, name")
        .eq("group_id", group.id)
        .eq("is_deleted", false)
        .order("name");

      if (!schools || schools.length === 0) {
        setLoading(false);
        return;
      }

      const names = schools.map((s) => s.name);
      setSchoolNames(names);

      // 1. Fee collection by school
      const feeData: FeeBySchool[] = [];
      for (const school of schools) {
        const { data: payments } = await supabase
          .from("fee_payments")
          .select("amount")
          .eq("school_id", school.id)
          .eq("status", "confirmed");

        const total = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
        feeData.push({ name: school.name, amount: total });
      }
      setFeeBySchool(feeData);

      // 2. Attendance rate by school over weeks (last 8 weeks)
      const weekMap = new Map<string, Record<string, { present: number; total: number }>>();
      const now = new Date();

      for (let w = 7; w >= 0; w--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const weekLabel = `W${8 - w}`;
        const startStr = weekStart.toISOString().split("T")[0];
        const endStr = weekEnd.toISOString().split("T")[0];

        const weekData: Record<string, { present: number; total: number }> = {};

        for (const school of schools) {
          const { data: records } = await supabase
            .from("attendance_records")
            .select("status")
            .eq("school_id", school.id)
            .gte("date", startStr)
            .lte("date", endStr);

          if (records && records.length > 0) {
            const present = records.filter((r) => r.status === "present").length;
            weekData[school.name] = { present, total: records.length };
          }
        }

        weekMap.set(weekLabel, weekData);
      }

      const attData: AttendanceByWeek[] = [];
      for (const [week, schoolData] of weekMap) {
        const row: AttendanceByWeek = { week };
        for (const school of schools) {
          const d = schoolData[school.name];
          row[school.name] = d && d.total > 0 ? Math.round((d.present / d.total) * 100) : 0;
        }
        attData.push(row);
      }
      setAttendanceByWeek(attData);

      // 3. Academic performance — average marks by class across schools
      const classMap = new Map<string, Record<string, { total: number; count: number }>>();

      for (const school of schools) {
        const { data: classes } = await supabase
          .from("classes")
          .select("id, name")
          .eq("school_id", school.id)
          .eq("is_deleted", false);

        if (!classes) continue;

        for (const cls of classes) {
          const { data: marks } = await supabase
            .from("marks")
            .select("score, max_score")
            .eq("school_id", school.id)
            .eq("class_id", cls.id);

          if (marks && marks.length > 0) {
            const avgPct = marks.reduce((sum, m) => sum + (Number(m.score) / Number(m.max_score)) * 100, 0) / marks.length;
            const existing = classMap.get(cls.name) ?? {};
            existing[school.name] = { total: avgPct, count: 1 };
            classMap.set(cls.name, existing);
          }
        }
      }

      const acData: AcademicByClass[] = [];
      for (const [className, schoolData] of classMap) {
        const row: AcademicByClass = { className };
        for (const school of schools) {
          const d = schoolData[school.name];
          row[school.name] = d ? Math.round(d.total / d.count) : 0;
        }
        acData.push(row);
      }
      setAcademicByClass(acData);

      setLoading(false);
    }

    loadData();
  }, [group, supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-foreground/60 text-sm">Cross-school performance comparison</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fee Collection by School */}
        {feeBySchool.length > 0 && (
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-lg">Fee Collection by School</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={feeBySchool}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip
                    formatter={(value) => [formatUGX(Number(value)), "Amount"]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Attendance Rate by School */}
        {attendanceByWeek.length > 0 && (
          <Card className="border-border-subtle bg-surface">
            <CardHeader>
              <CardTitle className="text-lg">Attendance Rate by School</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={attendanceByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Attendance"]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                  {schoolNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Academic Performance */}
        {academicByClass.length > 0 && (
          <Card className="border-border-subtle bg-surface lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Academic Performance by Class</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={academicByClass}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="className" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Average"]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                  {schoolNames.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
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

const CHART_COLORS = ["#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"];

interface FeeBySchool {
  name: string;
  value: number;
}

interface AttendanceByWeek {
  week: string;
  [schoolName: string]: number | string;
}

interface MarksBySchool {
  name: string;
  value: number;
}

export default function GroupAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [feeBySchool, setFeeBySchool] = useState<FeeBySchool[]>([]);
  const [attendanceByWeek, setAttendanceByWeek] = useState<AttendanceByWeek[]>([]);
  const [marksBySchool, setMarksBySchool] = useState<MarksBySchool[]>([]);
  const [schoolNames, setSchoolNames] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      const res = await fetch("/api/group/analytics");
      const json = await res.json();

      if (json.success && json.data) {
        const data = json.data;
        setFeeBySchool((data.fee_by_school ?? []).map((d: any) => ({ name: d.name, value: d.value })));
        setAttendanceByWeek(data.attendance_by_week ?? []);
        setMarksBySchool((data.marks_by_school ?? []).map((d: any) => ({ name: d.name, value: d.value })));

        // Extract school names from fee data
        const names = (data.fee_by_school ?? []).map((d: any) => d.name);
        setSchoolNames(names);
      }
      setLoading(false);
    }

    loadData();
  }, []);

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
        <p className="text-heading text-sm">Cross-school performance comparison</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fee Collection by School */}
        {feeBySchool.length > 0 && (
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Fee Collection by School</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={feeBySchool}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip
                    formatter={(value) => [`UGX ${Number(value).toLocaleString()}`, "Amount"]}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-body)" }}
                  />
                  <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Attendance Rate by School */}
        {attendanceByWeek.length > 0 && (
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Attendance Rate by School</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={attendanceByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Attendance"]}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-body)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }} />
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
        {marksBySchool.length > 0 && (
          <Card className="bg-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Academic Performance by School</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={marksBySchool}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Average"]}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-body)" }}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

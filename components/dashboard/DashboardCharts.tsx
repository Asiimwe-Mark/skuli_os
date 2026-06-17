"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUGX } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Brand-led palette
const CHART_COLORS = [
  "var(--chart-1)", // brand teal
  "var(--chart-2)", // emerald
  "var(--chart-3)", // amber
  "var(--chart-4)", // red
  "var(--chart-5)", // purple
  "var(--chart-6)", // cyan
];

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-heading)",
  boxShadow: "var(--shadow-pop)",
} as const;

export interface DashboardChartsProps {
  feeTrendData: { week: string; amount: number }[];
  paymentMethodData: { name: string; value: number }[];
  attendanceByClass: {
    className: string;
    teacher: string;
    present: number;
    total: number;
    pct: number;
  }[];
}

export default function DashboardCharts({
  feeTrendData,
  paymentMethodData,
  attendanceByClass,
}: DashboardChartsProps) {
  if (
    feeTrendData.length === 0 &&
    paymentMethodData.length === 0 &&
    attendanceByClass.length === 0
  ) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {feeTrendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fee Collection Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={feeTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [formatUGX(Number(value)), "Amount"]}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "var(--bg-tertiary)" }}
                />
                <Bar dataKey="amount" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {paymentMethodData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {paymentMethodData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatUGX(Number(value))}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {attendanceByClass.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {attendanceByClass.map((c) => (
                <div key={c.className} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold truncate block text-heading">{c.className}</span>
                      {c.teacher && (
                        <span className="text-[10px] text-muted">{c.teacher}</span>
                      )}
                    </div>
                    {c.pct === -1 ? (
                      <span className="text-xs text-warning-600 font-semibold shrink-0">Not marked</span>
                    ) : (
                      <span className="text-numeric text-xs shrink-0">{c.pct}%</span>
                    )}
                  </div>
                  {c.pct !== -1 && (
                    <div className="relative w-full h-2 rounded-full bg-bg-tertiary overflow-hidden">
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                          c.pct >= 80
                            ? "bg-success-600"
                            : c.pct >= 50
                            ? "bg-warning-600"
                            : "bg-danger-600"
                        )}
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

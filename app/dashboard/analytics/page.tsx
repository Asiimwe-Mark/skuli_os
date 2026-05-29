'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { createBrowserClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { formatUGX } from '@/lib/utils/currency';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Wallet,
  GraduationCap,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Send,
  BarChart3,
  Users,
  BookOpen,
} from 'lucide-react';
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
  LineChart,
  Line,
} from 'recharts';

const CHART_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

const tooltipStyle = {
  contentStyle: { background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 },
  itemStyle: { color: '#fff' },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassFeeRow {
  class_id: string;
  class_name: string;
  student_count: number;
  total_expected: number;
  total_paid: number;
  total_balance: number;
  collection_rate_pct: number;
}

interface SubjectPerfRow {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  term_id: string;
  student_count: number;
  avg_pct: number;
  max_score: number;
  min_score: number;
}

interface AttendanceWeeklyRow {
  class_id: string;
  class_name: string;
  week_start: string;
  total_records: number;
  present_count: number;
  attendance_pct: number;
}

interface DefaultingStudent {
  student_id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  balance: number;
  parent_phone: string | null;
}

interface TopStudent {
  student_id: string;
  student_name: string;
  admission_number: string;
  avg_pct: number;
  grade: string;
}

interface MonthlyPayment {
  month: string;
  total: number;
}

interface DayAbsence {
  day: string;
  absences: number;
}

interface CohortData {
  label: string;
  current: number;
  previous: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

function DeltaBadge({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs font-semibold',
        positive
          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
          : 'border-rose-500/30 text-rose-400 bg-rose-500/10'
      )}
    >
      {positive ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
      {positive ? '+' : ''}{value.toFixed(1)}{suffix}
    </Badge>
  );
}

function HeatmapCell({ value }: { value: number }) {
  let bg = 'bg-rose-500/30 text-rose-300';
  if (value >= 70) bg = 'bg-emerald-500/30 text-emerald-300';
  else if (value >= 50) bg = 'bg-amber-500/30 text-amber-300';
  else if (value >= 30) bg = 'bg-orange-500/30 text-orange-300';
  return (
    <div className={cn('rounded px-2 py-1 text-center text-xs font-medium', bg)}>
      {value.toFixed(0)}%
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const supabase = createBrowserClient();
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);

  const [activeTab, setActiveTab] = useState('fees');

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <motion.div {...fadeIn} className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Analytics</h1>
        <p className="text-gray-500">School intelligence dashboard — data-driven insights for better decisions.</p>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-surface border border-border-subtle">
          <TabsTrigger value="fees" className="gap-2">
            <Wallet className="w-4 h-4" /> Fee Analytics
          </TabsTrigger>
          <TabsTrigger value="academics" className="gap-2">
            <GraduationCap className="w-4 h-4" /> Academics
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <CalendarCheck className="w-4 h-4" /> Attendance
          </TabsTrigger>
          <TabsTrigger value="cohort" className="gap-2">
            <TrendingUp className="w-4 h-4" /> Cohort
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fees">
          <FeeAnalytics supabase={supabase} schoolId={school?.id} termId={currentTerm?.id} termStart={currentTerm?.start_date} />
        </TabsContent>
        <TabsContent value="academics">
          <AcademicAnalytics supabase={supabase} schoolId={school?.id} termId={currentTerm?.id} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceAnalytics supabase={supabase} schoolId={school?.id} termId={currentTerm?.id} termStart={currentTerm?.start_date} termEnd={currentTerm?.end_date} />
        </TabsContent>
        <TabsContent value="cohort">
          <CohortComparison supabase={supabase} schoolId={school?.id} termId={currentTerm?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Section 1: Fee Analytics ────────────────────────────────────────────────

function FeeAnalytics({ supabase, schoolId, termId, termStart }: { supabase: ReturnType<typeof createBrowserClient>; schoolId?: string; termId?: string; termStart?: string }) {
  const [classFees, setClassFees] = useState<ClassFeeRow[]>([]);
  const [defaulters, setDefaulters] = useState<DefaultingStudent[]>([]);
  const [monthlyPayments, setMonthlyPayments] = useState<MonthlyPayment[]>([]);
  const [avgDaysToPay, setAvgDaysToPay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);

    const load = async () => {
      const [feeView, defaulterData, paymentData] = await Promise.all([
        supabase.from('class_fee_summary').select('*').eq('school_id', schoolId),
        supabase
          .from('fee_accounts')
          .select(`
            student_id, balance,
            student:students(full_name, admission_number, parent_phone,
              current_class:classes(name))
          `)
          .eq('school_id', schoolId)
          .eq('is_deleted', false)
          .gt('balance', 0)
          .order('balance', { ascending: false })
          .limit(10),
        supabase
          .from('fee_payments')
          .select('amount, payment_date, created_at')
          .eq('school_id', schoolId)
          .eq('is_deleted', false)
          .eq('status', 'confirmed')
          .gte('payment_date', termStart || '2000-01-01')
          .order('payment_date'),
      ]);

      if (feeView.data) {
        setClassFees(feeView.data.sort((a: ClassFeeRow, b: ClassFeeRow) => a.class_name.localeCompare(b.class_name)));
      }

      if (defaulterData.data) {
        const mapped: DefaultingStudent[] = (defaulterData.data as any[]).map((d) => ({
          student_id: d.student_id,
          student_name: d.student?.full_name || 'Unknown',
          admission_number: d.student?.admission_number || '',
          class_name: d.student?.current_class?.name || 'Unknown',
          balance: d.balance,
          parent_phone: d.student?.parent_phone || null,
        }));
        setDefaulters(mapped);
      }

      if (paymentData.data) {
        const byMonth = new Map<string, number>();
        for (const p of paymentData.data) {
          const month = p.payment_date.slice(0, 7); // YYYY-MM
          byMonth.set(month, (byMonth.get(month) || 0) + p.amount);
        }
        const monthly: MonthlyPayment[] = Array.from(byMonth.entries())
          .map(([month, total]) => ({ month, total }))
          .sort((a, b) => a.month.localeCompare(b.month));
        setMonthlyPayments(monthly);
      }

      setLoading(false);
    };

    load();
  }, [schoolId, termId, termStart]);

  const stackedData = useMemo(() =>
    classFees.map((c) => ({
      name: c.class_name,
      collected: Number(c.collection_rate_pct),
      outstanding: 100 - Number(c.collection_rate_pct),
    })),
    [classFees]
  );

  const totalCollected = classFees.reduce((s, c) => s + Number(c.total_paid), 0);
  const totalExpected = classFees.reduce((s, c) => s + Number(c.total_expected), 0);
  const overallRate = totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(1) : '0';

  if (loading) return <SectionSkeleton />;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-surface border-border-subtle">
          <CardContent className="p-5">
            <p className="text-xs text-foreground/50 uppercase tracking-wider">Total Expected</p>
            <p className="text-2xl font-bold mt-1">{formatUGX(totalExpected)}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface border-border-subtle">
          <CardContent className="p-5">
            <p className="text-xs text-foreground/50 uppercase tracking-wider">Total Collected</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400">{formatUGX(totalCollected)}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface border-border-subtle">
          <CardContent className="p-5">
            <p className="text-xs text-foreground/50 uppercase tracking-wider">Outstanding</p>
            <p className="text-2xl font-bold mt-1 text-rose-400">{formatUGX(totalExpected - totalCollected)}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface border-border-subtle">
          <CardContent className="p-5">
            <p className="text-xs text-foreground/50 uppercase tracking-wider">Collection Rate</p>
            <p className="text-2xl font-bold mt-1 text-amber-400">{overallRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Stacked Bar: Collection by Class */}
        <Card className="bg-surface border-border-subtle">
          <CardHeader><CardTitle className="text-sm">Collection Rate by Class</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stackedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} domain={[0, 100]} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Legend />
                <Bar dataKey="collected" stackId="a" fill="#10b981" name="Collected %" radius={[0, 0, 0, 0]} />
                <Bar dataKey="outstanding" stackId="a" fill="#ef4444" name="Outstanding %" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Line: Monthly Trend */}
        <Card className="bg-surface border-border-subtle">
          <CardHeader><CardTitle className="text-sm">Monthly Collection Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyPayments}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => formatUGX(Number(v))} />
                <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="Collections" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Defaulters Table */}
      <Card className="bg-surface border-border-subtle">
        <CardHeader><CardTitle className="text-sm">Top 10 Defaulters</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">#</th>
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">Student</th>
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">Adm No.</th>
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">Class</th>
                  <th className="text-right py-2 px-3 text-foreground/50 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {defaulters.map((d, i) => (
                  <tr key={d.student_id} className="border-b border-border-subtle/50 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-foreground/40">{i + 1}</td>
                    <td className="py-2.5 px-3 font-medium">{d.student_name}</td>
                    <td className="py-2.5 px-3 text-foreground/60">{d.admission_number}</td>
                    <td className="py-2.5 px-3 text-foreground/60">{d.class_name}</td>
                    <td className="py-2.5 px-3 text-right text-rose-400 font-semibold">{formatUGX(d.balance)}</td>
                  </tr>
                ))}
                {defaulters.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-foreground/40">No defaulters found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Section 2: Academic Performance ─────────────────────────────────────────

function AcademicAnalytics({ supabase, schoolId, termId }: { supabase: ReturnType<typeof createBrowserClient>; schoolId?: string; termId?: string }) {
  const [subjectPerf, setSubjectPerf] = useState<SubjectPerfRow[]>([]);
  const [topStudents, setTopStudents] = useState<Map<string, TopStudent[]>>(new Map());
  const [prevTermId, setPrevTermId] = useState<string | null>(null);
  const [prevSubjectPerf, setPrevSubjectPerf] = useState<SubjectPerfRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId || !termId) return;
    setLoading(true);

    const load = async () => {
      // Get previous term
      const { data: terms } = await supabase
        .from('terms')
        .select('id, name, start_date')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: true });

      const currentIdx = terms?.findIndex((t: any) => t.id === termId) ?? -1;
      const prevTerm = currentIdx > 0 ? terms![currentIdx - 1] : null;
      if (prevTerm) setPrevTermId(prevTerm.id);

      const [perfData, prevPerfData, marksData] = await Promise.all([
        supabase.from('subject_performance_summary').select('*').eq('school_id', schoolId).eq('term_id', termId),
        prevTerm
          ? supabase.from('subject_performance_summary').select('*').eq('school_id', schoolId).eq('term_id', prevTerm.id)
          : Promise.resolve({ data: [] }),
        supabase
          .from('marks')
          .select(`
            student_id, class_id, score, max_score,
            student:students(full_name, admission_number),
            class:classes(name)
          `)
          .eq('school_id', schoolId)
          .eq('term_id', termId)
          .eq('is_deleted', false)
          .in('review_status', ['approved', 'submitted']),
      ]);

      if (perfData.data) setSubjectPerf(perfData.data);
      if (prevPerfData.data) setPrevSubjectPerf(prevPerfData.data as SubjectPerfRow[]);

      // Compute top 5 per class
      if (marksData.data) {
        const byStudent = new Map<string, { name: string; adm: string; classId: string; className: string; totalPct: number; count: number }>();
        for (const m of marksData.data as any[]) {
          const key = `${m.student_id}:${m.class_id}`;
          const existing = byStudent.get(key);
          if (existing) {
            existing.totalPct += (m.score / (m.max_score || 100)) * 100;
            existing.count++;
          } else {
            byStudent.set(key, {
              name: m.student?.full_name || 'Unknown',
              adm: m.student?.admission_number || '',
              classId: m.class_id,
              className: m.class?.name || 'Unknown',
              totalPct: (m.score / (m.max_score || 100)) * 100,
              count: 1,
            });
          }
        }

        const byClass = new Map<string, TopStudent[]>();
        for (const [key, val] of byStudent) {
          const avg = val.totalPct / val.count;
          const grade = getGrade(avg);
          const classArr = byClass.get(val.classId) || [];
          classArr.push({ student_id: key.split(':')[0], student_name: val.name, admission_number: val.adm, avg_pct: avg, grade });
          byClass.set(val.classId, classArr);
        }

        // Sort and take top 5
        for (const [classId, students] of byClass) {
          students.sort((a, b) => b.avg_pct - a.avg_pct);
          byClass.set(classId, students.slice(0, 5));
        }
        setTopStudents(byClass);
      }

      setLoading(false);
    };

    load();
  }, [schoolId, termId]);

  // Subject averages for bar chart
  const subjectAverages = useMemo(() => {
    const bySubject = new Map<string, { name: string; totalPct: number; count: number }>();
    for (const row of subjectPerf) {
      const existing = bySubject.get(row.subject_id);
      if (existing) {
        existing.totalPct += Number(row.avg_pct) * row.student_count;
        existing.count += row.student_count;
      } else {
        bySubject.set(row.subject_id, { name: row.subject_name, totalPct: Number(row.avg_pct) * row.student_count, count: row.student_count });
      }
    }
    return Array.from(bySubject.values())
      .map((s) => ({ name: s.name, avg: s.count > 0 ? s.totalPct / s.count : 0 }))
      .sort((a, b) => b.avg - a.avg);
  }, [subjectPerf]);

  // Class comparison: this term vs last term
  const classComparison = useMemo(() => {
    const byClass = new Map<string, { name: string; current: number; currentCount: number; prev: number; prevCount: number }>();
    for (const row of subjectPerf) {
      const existing = byClass.get(row.class_id);
      if (existing) {
        existing.current += Number(row.avg_pct) * row.student_count;
        existing.currentCount += row.student_count;
      } else {
        byClass.set(row.class_id, { name: row.class_name, current: Number(row.avg_pct) * row.student_count, currentCount: row.student_count, prev: 0, prevCount: 0 });
      }
    }
    for (const row of prevSubjectPerf) {
      const existing = byClass.get(row.class_id);
      if (existing) {
        existing.prev += Number(row.avg_pct) * row.student_count;
        existing.prevCount += row.student_count;
      }
    }
    return Array.from(byClass.values()).map((c) => ({
      name: c.name,
      current: c.currentCount > 0 ? c.current / c.currentCount : 0,
      prev: c.prevCount > 0 ? c.prev / c.prevCount : 0,
      delta: c.currentCount > 0 && c.prevCount > 0 ? (c.current / c.currentCount) - (c.prev / c.prevCount) : 0,
    }));
  }, [subjectPerf, prevSubjectPerf]);

  // Heatmap: class x subject
  const heatmap = useMemo(() => {
    const grid = new Map<string, Map<string, number>>();
    const subjects = new Set<string>();
    const classes = new Set<string>();

    for (const row of subjectPerf) {
      subjects.add(row.subject_name);
      classes.add(row.class_name);
      if (!grid.has(row.class_name)) grid.set(row.class_name, new Map());
      grid.get(row.class_name)!.set(row.subject_name, Number(row.avg_pct));
    }

    return {
      subjects: Array.from(subjects).sort(),
      classes: Array.from(classes).sort(),
      grid,
    };
  }, [subjectPerf]);

  if (loading) return <SectionSkeleton />;

  return (
    <div className="space-y-6">
      {/* Subject Averages Bar Chart */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-surface border-border-subtle">
          <CardHeader><CardTitle className="text-sm">Average Marks by Subject</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={subjectAverages} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} width={100} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Bar dataKey="avg" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Avg %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Class Comparison */}
        <Card className="bg-surface border-border-subtle">
          <CardHeader><CardTitle className="text-sm">Class Comparison: This Term vs Last Term</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={classComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Legend />
                <Bar dataKey="current" fill="#f59e0b" name="This Term" radius={[4, 4, 0, 0]} />
                <Bar dataKey="prev" fill="#6b7280" name="Last Term" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Delta badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              {classComparison.map((c) =>
                c.delta !== 0 ? (
                  <div key={c.name} className="flex items-center gap-1.5 text-xs">
                    <span className="text-foreground/60">{c.name}:</span>
                    <DeltaBadge value={c.delta} />
                  </div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="bg-surface border-border-subtle">
        <CardHeader><CardTitle className="text-sm">Subject Difficulty Heatmap</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">Class</th>
                  {heatmap.subjects.map((s) => (
                    <th key={s} className="text-center py-2 px-2 text-foreground/50 font-medium text-xs">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.classes.map((cls) => (
                  <tr key={cls} className="border-t border-border-subtle/30">
                    <td className="py-2 px-3 font-medium text-sm">{cls}</td>
                    {heatmap.subjects.map((sub) => {
                      const val = heatmap.grid.get(cls)?.get(sub);
                      return (
                        <td key={sub} className="py-1 px-1 text-center">
                          {val !== undefined ? <HeatmapCell value={val} /> : <span className="text-foreground/20 text-xs">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-foreground/50">
            <span>Legend:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/30" /> 70%+</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/30" /> 50-69%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/30" /> 30-49%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500/30" /> &lt;30%</span>
          </div>
        </CardContent>
      </Card>

      {/* Top 5 Students per Class */}
      <Card className="bg-surface border-border-subtle">
        <CardHeader><CardTitle className="text-sm">Top 5 Students per Class</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from(topStudents.entries()).map(([classId, students]) => {
              const className = students[0] ? subjectPerf.find((s) => s.class_id === classId)?.class_name || 'Unknown' : 'Unknown';
              return (
                <div key={classId}>
                  <h4 className="text-sm font-semibold mb-2 text-foreground/70">{className}</h4>
                  <div className="space-y-1.5">
                    {students.map((s, i) => (
                      <div key={s.student_id} className="flex items-center gap-2 text-sm">
                        <span className="w-5 text-foreground/40 text-xs">{i + 1}.</span>
                        <span className="flex-1 truncate">{s.student_name}</span>
                        <span className="text-foreground/50 text-xs">{s.admission_number}</span>
                        <Badge variant="outline" className="text-xs">{s.avg_pct.toFixed(1)}%</Badge>
                        <Badge className={cn('text-xs text-white', getGradeColor(s.grade))}>{s.grade}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {topStudents.size === 0 && <p className="text-foreground/40 text-sm col-span-full">No marks data available</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Section 3: Attendance Intelligence ──────────────────────────────────────

function AttendanceAnalytics({ supabase, schoolId, termId, termStart, termEnd }: { supabase: ReturnType<typeof createBrowserClient>; schoolId?: string; termId?: string; termStart?: string; termEnd?: string }) {
  const [weeklyData, setWeeklyData] = useState<AttendanceWeeklyRow[]>([]);
  const [classAttendance, setClassAttendance] = useState<{ name: string; pct: number }[]>([]);
  const [chronicAbsentees, setChronicAbsentees] = useState<{ student_id: string; name: string; adm: string; className: string; absentDays: number; totalDays: number; pct: number; parentPhone: string | null }[]>([]);
  const [dayPattern, setDayPattern] = useState<DayAbsence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);

    const load = async () => {
      const [weeklyResult, recordsResult] = await Promise.all([
        supabase.from('attendance_weekly_summary').select('*').eq('school_id', schoolId),
        supabase
          .from('attendance_records')
          .select(`
            student_id, class_id, date, status,
            student:students(full_name, admission_number, parent_phone),
            class:classes(name)
          `)
          .eq('school_id', schoolId)
          .eq('is_deleted', false)
          .gte('date', termStart || '2000-01-01')
          .lte('date', termEnd || '2099-12-31'),
      ]);

      if (weeklyResult.data) {
        const rows = weeklyResult.data as AttendanceWeeklyRow[];
        // Aggregate by week for overall trend
        const byWeek = new Map<string, { total: number; present: number }>();
        for (const r of rows) {
          const week = r.week_start.slice(0, 10);
          const existing = byWeek.get(week) || { total: 0, present: 0 };
          existing.total += Number(r.total_records);
          existing.present += Number(r.present_count);
          byWeek.set(week, existing);
        }
        const trend = Array.from(byWeek.entries())
          .map(([week, d]) => ({ week_start: week, total_records: d.total, present_count: d.present, attendance_pct: d.total > 0 ? (d.present / d.total) * 100 : 0, class_id: '', class_name: '' }))
          .sort((a, b) => a.week_start.localeCompare(b.week_start));
        setWeeklyData(trend);

        // Class ranking
        const byClass = new Map<string, { total: number; present: number; name: string }>();
        for (const r of rows) {
          const existing = byClass.get(r.class_id) || { total: 0, present: 0, name: r.class_name };
          existing.total += Number(r.total_records);
          existing.present += Number(r.present_count);
          byClass.set(r.class_id, existing);
        }
        const ranked = Array.from(byClass.values())
          .map((c) => ({ name: c.name, pct: c.total > 0 ? (c.present / c.total) * 100 : 0 }))
          .sort((a, b) => b.pct - a.pct);
        setClassAttendance(ranked);
      }

      if (recordsResult.data) {
        const records = recordsResult.data as any[];

        // Day-of-week pattern
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        for (const r of records) {
          if (r.status === 'absent') {
            const dow = new Date(r.date).getDay();
            dayCounts[dow]++;
          }
        }
        setDayPattern(dayNames.map((day, i) => ({ day, absences: dayCounts[i] })));

        // Chronic absentees (below 75%)
        const byStudent = new Map<string, { name: string; adm: string; className: string; present: number; total: number; parentPhone: string | null }>();
        for (const r of records) {
          const key = r.student_id;
          const existing = byStudent.get(key) || { name: r.student?.full_name || 'Unknown', adm: r.student?.admission_number || '', className: r.class?.name || 'Unknown', present: 0, total: 0, parentPhone: r.student?.parent_phone || null };
          existing.total++;
          if (r.status === 'present') existing.present++;
          byStudent.set(key, existing);
        }
        const chronic = Array.from(byStudent.entries())
          .map(([id, s]) => ({ student_id: id, name: s.name, adm: s.adm, className: s.className, absentDays: s.total - s.present, totalDays: s.total, pct: s.total > 0 ? (s.present / s.total) * 100 : 0, parentPhone: s.parentPhone }))
          .filter((s) => s.pct < 75 && s.totalDays >= 5)
          .sort((a, b) => a.pct - b.pct)
          .slice(0, 20);
        setChronicAbsentees(chronic);
      }

      setLoading(false);
    };

    load();
  }, [schoolId, termId, termStart, termEnd]);

  const handleNotifyParent = async (studentId: string, phone: string | null) => {
    if (!phone) return;
    // Reuse existing SMS pattern from attendance page
    try {
      await fetch('/api/communication/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [phone],
          message: `Your child has been flagged for chronic absence (below 75% attendance). Please contact the school.`,
        }),
      });
    } catch { /* silent */ }
  };

  if (loading) return <SectionSkeleton />;

  return (
    <div className="space-y-6">
      {/* Trend + Class Ranking */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-surface border-border-subtle">
          <CardHeader><CardTitle className="text-sm">Weekly Attendance Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="week_start" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Line type="monotone" dataKey="attendance_pct" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Attendance %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-surface border-border-subtle">
          <CardHeader><CardTitle className="text-sm">Class Attendance Ranking</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={classAttendance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} width={80} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Bar dataKey="pct" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Attendance %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Day-of-week pattern */}
      <Card className="bg-surface border-border-subtle">
        <CardHeader><CardTitle className="text-sm">Absences by Day of Week</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dayPattern}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="absences" fill="#ef4444" radius={[4, 4, 0, 0]} name="Absences" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Chronic Absentees */}
      <Card className="bg-surface border-border-subtle">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Chronic Absentees (Below 75%)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">#</th>
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">Student</th>
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">Adm No.</th>
                  <th className="text-left py-2 px-3 text-foreground/50 font-medium">Class</th>
                  <th className="text-center py-2 px-3 text-foreground/50 font-medium">Absent Days</th>
                  <th className="text-center py-2 px-3 text-foreground/50 font-medium">Rate</th>
                  <th className="text-right py-2 px-3 text-foreground/50 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {chronicAbsentees.map((s, i) => (
                  <tr key={s.student_id} className="border-b border-border-subtle/50 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-foreground/40">{i + 1}</td>
                    <td className="py-2.5 px-3 font-medium">{s.name}</td>
                    <td className="py-2.5 px-3 text-foreground/60">{s.adm}</td>
                    <td className="py-2.5 px-3 text-foreground/60">{s.className}</td>
                    <td className="py-2.5 px-3 text-center text-rose-400">{s.absentDays}/{s.totalDays}</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="outline" className="text-rose-400 border-rose-500/30">{s.pct.toFixed(1)}%</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {s.parentPhone && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => handleNotifyParent(s.student_id, s.parentPhone)}
                        >
                          <Send className="w-3 h-3 mr-1" /> Notify
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {chronicAbsentees.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-foreground/40">No chronic absentees found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Section 4: Cohort Comparison ────────────────────────────────────────────

function CohortComparison({ supabase, schoolId, termId }: { supabase: ReturnType<typeof createBrowserClient>; schoolId?: string; termId?: string }) {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [terms, setTerms] = useState<{ id: string; name: string; academic_year_id: string }[]>([]);
  const [feeData, setFeeData] = useState<CohortData[]>([]);
  const [marksData, setMarksData] = useState<CohortData[]>([]);
  const [attendanceData, setAttendanceData] = useState<CohortData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    const load = async () => {
      const [clsResult, termResult] = await Promise.all([
        supabase.from('classes').select('id, name').eq('school_id', schoolId).eq('is_deleted', false).order('name'),
        supabase.from('terms').select('id, name, academic_year_id').eq('school_id', schoolId).order('start_date'),
      ]);
      if (clsResult.data) {
        setClasses(clsResult.data);
        if (clsResult.data.length > 0) setSelectedClassId(clsResult.data[0].id);
      }
      if (termResult.data) setTerms(termResult.data);
    };
    load();
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !selectedClassId || !termId || terms.length === 0) return;
    setLoading(true);

    const load = async () => {
      // Find previous year's equivalent term
      const currentTerm = terms.find((t) => t.id === termId);
      if (!currentTerm) { setLoading(false); return; }

      const { data: currentYear } = await supabase
        .from('academic_years').select('name').eq('id', currentTerm.academic_year_id).single();

      const prevYearName = currentYear ? String(Number(currentYear.name) - 1) : null;
      let prevTermId: string | null = null;
      if (prevYearName) {
        const { data: prevYear } = await supabase
          .from('academic_years').select('id').eq('school_id', schoolId).eq('name', prevYearName).single();
        if (prevYear) {
          // Find same term (Term 1/2/3) in previous year
          const prevTerm = terms.find((t) => t.academic_year_id === prevYear.id && t.name === currentTerm.name);
          if (prevTerm) prevTermId = prevTerm.id;
        }
      }

      // Get students currently in this class
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .eq('class_id', selectedClassId)
        .eq('term_id', termId)
        .eq('is_deleted', false);

      const studentIds = (enrollments || []).map((e: any) => e.student_id);
      if (studentIds.length === 0) { setLoading(false); return; }

      // Find where these students were last year (same class name)
      const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name;
      let prevClassId: string | null = null;
      if (prevYearName && selectedClassName) {
        const { data: prevClass } = await supabase
          .from('classes').select('id').eq('school_id', schoolId).eq('name', selectedClassName).eq('is_deleted', false).single();
        if (prevClass) prevClassId = prevClass.id;
      }

      const [feeResult, marksResult, attendanceResult] = await Promise.all([
        // Fee collection
        supabase
          .from('fee_accounts')
          .select('total_expected, total_paid, student_id, term_id')
          .eq('school_id', schoolId)
          .eq('is_deleted', false)
          .in('student_id', studentIds),
        // Marks
        supabase
          .from('marks')
          .select('score, max_score, student_id, term_id')
          .eq('school_id', schoolId)
          .eq('class_id', selectedClassId)
          .eq('is_deleted', false)
          .in('review_status', ['approved', 'submitted']),
        // Attendance
        supabase
          .from('attendance_records')
          .select('status, student_id, date')
          .eq('school_id', schoolId)
          .eq('class_id', selectedClassId)
          .eq('is_deleted', false),
      ]);

      // Fee comparison
      const currentFees = (feeResult.data || []).filter((f: any) => f.term_id === termId);
      const prevFees = prevTermId ? (feeResult.data || []).filter((f: any) => f.term_id === prevTermId) : [];
      const currFeeTotal = currentFees.reduce((s: number, f: any) => s + Number(f.total_expected), 0);
      const currFeePaid = currentFees.reduce((s: number, f: any) => s + Number(f.total_paid), 0);
      const prevFeeTotal = prevFees.reduce((s: number, f: any) => s + Number(f.total_expected), 0);
      const prevFeePaid = prevFees.reduce((s: number, f: any) => s + Number(f.total_paid), 0);
      setFeeData([
        { label: 'Collection Rate', current: currFeeTotal > 0 ? (currFeePaid / currFeeTotal) * 100 : 0, previous: prevFeeTotal > 0 ? (prevFeePaid / prevFeeTotal) * 100 : 0 },
      ]);

      // Marks comparison
      const currMarks = (marksResult.data || []).filter((m: any) => m.term_id === termId);
      const prevMarks = prevTermId ? (marksResult.data || []).filter((m: any) => m.term_id === prevTermId) : [];
      const currAvg = currMarks.length > 0 ? currMarks.reduce((s: number, m: any) => s + (Number(m.score) / (Number(m.max_score) || 100)) * 100, 0) / currMarks.length : 0;
      const prevAvg = prevMarks.length > 0 ? prevMarks.reduce((s: number, m: any) => s + (Number(m.score) / (Number(m.max_score) || 100)) * 100, 0) / prevMarks.length : 0;
      setMarksData([{ label: 'Average Marks', current: currAvg, previous: prevAvg }]);

      // Attendance comparison
      const { data: termDates } = await supabase.from('terms').select('start_date, end_date').eq('id', termId).single();
      const prevTermDates = prevTermId ? await supabase.from('terms').select('start_date, end_date').eq('id', prevTermId).single() : null;

      const currAtt = (attendanceResult.data || []).filter((a: any) => {
        if (!termDates) return false;
        return a.date >= termDates.start_date && a.date <= termDates.end_date;
      });
      const prevAtt = prevTermDates?.data ? (attendanceResult.data || []).filter((a: any) => a.date >= prevTermDates.data.start_date && a.date <= prevTermDates.data.end_date) : [];
      const currAttPct = currAtt.length > 0 ? (currAtt.filter((a: any) => a.status === 'present').length / currAtt.length) * 100 : 0;
      const prevAttPct = prevAtt.length > 0 ? (prevAtt.filter((a: any) => a.status === 'present').length / prevAtt.length) * 100 : 0;
      setAttendanceData([{ label: 'Attendance Rate', current: currAttPct, previous: prevAttPct }]);

      setLoading(false);
    };

    load();
  }, [schoolId, selectedClassId, termId, terms]);

  if (loading) return <SectionSkeleton />;

  const allMetrics = [...feeData, ...marksData, ...attendanceData];

  return (
    <div className="space-y-6">
      {/* Class Selector */}
      <Card className="bg-surface border-border-subtle">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Compare Class:</label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-60">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-foreground/50">vs same class last year</span>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {allMetrics.map((m) => {
          const delta = m.current - m.previous;
          const positive = delta >= 0;
          return (
            <Card key={m.label} className="bg-surface border-border-subtle">
              <CardContent className="p-6">
                <p className="text-xs text-foreground/50 uppercase tracking-wider mb-2">{m.label}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">{m.current.toFixed(1)}%</p>
                    <p className="text-xs text-foreground/40 mt-1">Last year: {m.previous.toFixed(1)}%</p>
                  </div>
                  <DeltaBadge value={delta} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Side-by-side bars */}
      <Card className="bg-surface border-border-subtle">
        <CardHeader><CardTitle className="text-sm">Year-on-Year Comparison</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={allMetrics.map((m) => ({ name: m.label, 'This Year': m.current, 'Last Year': m.previous }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="This Year" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Last Year" fill="#6b7280" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Grade Helpers ───────────────────────────────────────────────────────────

function getGrade(pct: number): string {
  if (pct >= 80) return 'D1';
  if (pct >= 70) return 'D2';
  if (pct >= 60) return 'C3';
  if (pct >= 50) return 'C4';
  if (pct >= 40) return 'C5';
  if (pct >= 30) return 'C6';
  if (pct >= 20) return 'P7';
  if (pct >= 10) return 'P8';
  return 'F9';
}

function getGradeColor(grade: string): string {
  if (grade.startsWith('D')) return 'bg-emerald-500';
  if (grade.startsWith('C')) return 'bg-blue-500';
  if (grade.startsWith('P')) return 'bg-amber-500';
  return 'bg-rose-500';
}

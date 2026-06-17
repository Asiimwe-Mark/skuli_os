'use client';

import { useEffect, useState, useMemo, useRef} from 'react';
import { useDocumentTitle } from '@/lib/hooks/useDocumentTitle';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useSupabaseBrowser, createClient as createBrowserClient } from '@/lib/supabase/client';
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

// ?"EUR?"EUR?"EUR Types ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
interface ClassFeeRow {
  class_id: string | null;
  class_name: string | null;
  student_count: number | null;
  total_expected: number | null;
  total_paid: number | null;
  total_balance: number | null;
  collection_rate_pct: number | null;
}

interface SubjectPerfRow {
  class_id: string | null;
  class_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  term_id: string | null;
  student_count: number | null;
  avg_pct: number | null;
  max_score: number | null;
  min_score: number | null;
}

interface AttendanceWeeklyRow {
  class_id: string | null;
  class_name: string | null;
  week_start: string | null;
  total_records: number | null;
  present_count: number | null;
  attendance_pct?: number;
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

// Join query result types
interface DefaulterRow {
  student_id: string;
  balance: number;
  student?: { full_name?: string; admission_number?: string; parent_phone?: string; current_class?: { name?: string } };
}

interface MarkJoinRow {
  student_id: string;
  class_id: string;
  score: number;
  max_score: number | null;
  student?: { full_name?: string; admission_number?: string };
  class?: { name?: string };
}

interface AttendanceJoinRow {
  student_id: string;
  class_id: string;
  date: string;
  status: string;
  student?: { full_name?: string; admission_number?: string; parent_phone?: string };
  class?: { name?: string };
}

interface TermRow {
  id: string;
  name: string;
  start_date: string | null;
}

interface FeeAccountRow {
  total_expected: number;
  total_paid: number;
  student_id: string;
  term_id: string;
}

interface MarkResultRow {
  score: number;
  max_score: number | null;
  student_id: string;
  term_id: string;
}

interface AttendanceResultRow {
  status: string;
  student_id: string;
  date: string;
}

interface EnrollmentRow {
  student_id: string;
}

type RechartsValue = string | number;

// ?"EUR?"EUR?"EUR Helpers ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
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
          ? 'border-success-500 text-success-700 bg-success-100'
          : 'border-danger-500 text-danger-700 bg-danger-100'
      )}
    >
      {positive ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
      {positive ? '+' : ''}{value.toFixed(1)}{suffix}
    </Badge>
  );
}

function HeatmapCell({ value }: { value: number }) {
  let bg = 'bg-danger-100 text-danger-700';
  if (value >= 70) bg = 'bg-success-100 text-success-700';
  else if (value >= 50) bg = 'bg-warning-100 text-warning-700';
  return (
    <div className={cn('rounded px-2 py-1 text-center text-xs font-semibold', bg)}>
      {value.toFixed(0)}%
    </div>
  );
}

// ?"EUR?"EUR?"EUR Main Page ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
export default function AnalyticsPage() {
  useDocumentTitle("Analytics");
  const supabase = useSupabaseBrowser();
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);

  const [activeTab, setActiveTab] = useState('fees');

  return (
    <div className="px-4 py-6 sm:p-8 max-w-[1400px] mx-auto">
      <motion.div {...fadeIn} className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-text-heading mb-2">Analytics</h1>
        <p className="text-muted">School intelligence dashboard - data-driven insights for better decisions.</p>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card border overflow-x-auto flex-nowrap">
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
          <FeeAnalytics supabase={supabase} schoolId={school?.id} termId={currentTerm?.id} termStart={currentTerm?.start_date ?? undefined} />
        </TabsContent>
        <TabsContent value="academics">
          <AcademicAnalytics supabase={supabase} schoolId={school?.id} termId={currentTerm?.id} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceAnalytics supabase={supabase} schoolId={school?.id} termId={currentTerm?.id} termStart={currentTerm?.start_date ?? undefined} termEnd={currentTerm?.end_date ?? undefined} />
        </TabsContent>
        <TabsContent value="cohort">
          <CohortComparison supabase={supabase} schoolId={school?.id} termId={currentTerm?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ?"EUR?"EUR?"EUR Section 1: Fee Analytics ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
function FeeAnalytics({ supabase, schoolId, termId, termStart }: { supabase: ReturnType<typeof createBrowserClient>; schoolId?: string; termId?: string; termStart?: string }) {
  const queryClient = useQueryClient();

  const { data: classFees = [], isLoading: loadingClassFees } = useQuery({
    queryKey: ['analytics-class-fees', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_fee_summary')
        .select('*')
        .eq('school_id', schoolId!);
      if (error) throw error;
      return (data ?? []).sort((a: ClassFeeRow, b: ClassFeeRow) =>
        (a.class_name ?? '').localeCompare(b.class_name ?? '')
      ) as ClassFeeRow[];
    },
    enabled: !!schoolId,
  });

  const { data: defaulters = [], isLoading: loadingDefaulters } = useQuery({
    queryKey: ['analytics-defaulters', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fee_accounts')
        .select(`
          student_id, balance,
          student:students(full_name, admission_number, parent_phone,
            current_class:classes(name))
        `)
        .eq('school_id', schoolId!)
        .eq('is_deleted', false)
        .gt('balance', 0)
        .order('balance', { ascending: false })
        .limit(10);
      if (error) throw error;
      return ((data ?? []) as DefaulterRow[]).map((d) => ({
        student_id: d.student_id,
        student_name: d.student?.full_name || 'Unknown',
        admission_number: d.student?.admission_number || '',
        class_name: d.student?.current_class?.name || 'Unknown',
        balance: d.balance,
        parent_phone: d.student?.parent_phone || null,
      })) as DefaultingStudent[];
    },
    enabled: !!schoolId,
  });

  const { data: monthlyPayments = [], isLoading: loadingMonthly } = useQuery({
    queryKey: ['analytics-monthly-payments', schoolId, termId, termStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fee_payments')
        .select('amount, payment_date, created_at')
        .eq('school_id', schoolId!)
        .eq('is_deleted', false)
        .eq('status', 'confirmed')
        .gte('payment_date', termStart || '2000-01-01')
        .order('payment_date');
      if (error) throw error;
      const byMonth = new Map<string, number>();
      for (const p of (data ?? []) as any[]) {
        const month = p.payment_date.slice(0, 7);
        byMonth.set(month, (byMonth.get(month) || 0) + p.amount);
      }
      return Array.from(byMonth.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));
    },
    enabled: !!schoolId,
  });

  // Refetch all sections when term changes
  useEffect(() => {
    if (!schoolId) return;
    queryClient.invalidateQueries({ queryKey: ['analytics-class-fees', schoolId] });
    queryClient.invalidateQueries({ queryKey: ['analytics-defaulters', schoolId] });
    queryClient.invalidateQueries({ queryKey: ['analytics-monthly-payments', schoolId, termId, termStart] });
  }, [termId, termStart, schoolId, queryClient]);

  const loading = loadingClassFees || loadingDefaulters || loadingMonthly;

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
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card">
          <CardContent className="p-5">
            <p className="text-xs text-heading uppercase tracking-wider">Total Expected</p>
            <p className="text-2xl font-bold mt-1">{formatUGX(totalExpected)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-5">
            <p className="text-xs text-heading uppercase tracking-wider">Total Collected</p>
            <p className="text-2xl font-bold mt-1 text-success-700">{formatUGX(totalCollected)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-5">
            <p className="text-xs text-heading uppercase tracking-wider">Outstanding</p>
            <p className="text-2xl font-bold mt-1 text-danger-700">{formatUGX(totalExpected - totalCollected)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-5">
            <p className="text-xs text-heading uppercase tracking-wider">Collection Rate</p>
            <p className="text-2xl font-bold mt-1 text-info-700">{overallRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Stacked Bar: Collection by Class */}
        <Card className="bg-card">
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
        <Card className="bg-card">
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
      <Card className="bg-card">
        <CardHeader><CardTitle className="text-sm">Top 10 Defaulters</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-heading font-medium">#</th>
                  <th className="text-left py-2 px-3 text-heading font-medium">Student</th>
                  <th className="text-left py-2 px-3 text-heading font-medium">Adm No.</th>
                  <th className="text-left py-2 px-3 text-heading font-medium">Class</th>
                  <th className="text-right py-2 px-3 text-heading font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {defaulters.map((d, i) => (
                  <tr key={d.student_id} className="border-b /50 hover:bg-card-hover">
                    <td className="py-2.5 px-3 text-heading">{i + 1}</td>
                    <td className="py-2.5 px-3 font-medium">{d.student_name}</td>
                    <td className="py-2.5 px-3 text-heading">{d.admission_number}</td>
                    <td className="py-2.5 px-3 text-heading">{d.class_name}</td>
                    <td className="py-2.5 px-3 text-right text-danger-700 font-semibold">{formatUGX(d.balance)}</td>
                  </tr>
                ))}
                {defaulters.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-heading">No defaulters found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ?"EUR?"EUR?"EUR Section 2: Academic Performance ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
function AcademicAnalytics({ supabase, schoolId, termId }: { supabase: ReturnType<typeof createBrowserClient>; schoolId?: string; termId?: string }) {
  const queryClient = useQueryClient();

  const { data: terms = [] } = useQuery({
    queryKey: ['analytics-terms', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('id, name, start_date')
        .eq('school_id', schoolId!)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
    enabled: !!schoolId,
  });

  const prevTermId = useMemo(() => {
    const currentIdx = terms.findIndex((t) => t.id === termId);
    return currentIdx > 0 ? terms[currentIdx - 1].id : null;
  }, [terms, termId]);

  const { data: subjectPerf = [], isLoading: loadingSubjectPerf } = useQuery({
    queryKey: ['analytics-subject-perf', schoolId, termId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subject_performance_summary')
        .select('*')
        .eq('school_id', schoolId!)
        .eq('term_id', termId!);
      if (error) throw error;
      return (data ?? []) as SubjectPerfRow[];
    },
    enabled: !!schoolId && !!termId,
  });

  const { data: prevSubjectPerf = [] } = useQuery({
    queryKey: ['analytics-prev-subject-perf', schoolId, prevTermId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subject_performance_summary')
        .select('*')
        .eq('school_id', schoolId!)
        .eq('term_id', prevTermId!);
      if (error) throw error;
      return (data ?? []) as SubjectPerfRow[];
    },
    enabled: !!schoolId && !!prevTermId,
  });

  const { data: topStudents = new Map<string, TopStudent[]>(), isLoading: loadingTop } = useQuery({
    queryKey: ['analytics-top-students', schoolId, termId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marks')
        .select(`
          student_id, class_id, score, max_score,
          student:students(full_name, admission_number),
          class:classes(name)
        `)
        .eq('school_id', schoolId!)
        .eq('term_id', termId!)
        .eq('is_deleted', false)
        .in('review_status', ['approved', 'submitted']);
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const byStudent = new Map<string, { name: string; adm: string; classId: string; className: string; totalPct: number; count: number }>();
      for (const m of rows) {
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

      for (const [classId, students] of byClass) {
        students.sort((a, b) => b.avg_pct - a.avg_pct);
        byClass.set(classId, students.slice(0, 5));
      }
      return byClass;
    },
    enabled: !!schoolId && !!termId,
  });

  // Refetch all sections when term changes
  useEffect(() => {
    if (!schoolId) return;
    queryClient.invalidateQueries({ queryKey: ['analytics-terms', schoolId] });
    queryClient.invalidateQueries({ queryKey: ['analytics-subject-perf', schoolId, termId] });
    queryClient.invalidateQueries({ queryKey: ['analytics-prev-subject-perf', schoolId] });
    queryClient.invalidateQueries({ queryKey: ['analytics-top-students', schoolId, termId] });
  }, [termId, schoolId, queryClient]);

  const loading = loadingSubjectPerf || loadingTop;

  // Subject averages for bar chart
  const subjectAverages = useMemo(() => {
    const bySubject = new Map<string, { name: string; totalPct: number; count: number }>();
    for (const row of subjectPerf) {
      const existing = bySubject.get(row.subject_id ?? '');
      if (existing) {
        existing.totalPct += Number(row.avg_pct) * (row.student_count ?? 0);
        existing.count += row.student_count ?? 0;
      } else {
        bySubject.set(row.subject_id ?? '', { name: row.subject_name ?? '', totalPct: Number(row.avg_pct) * (row.student_count ?? 0), count: row.student_count ?? 0 });
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
      const existing = byClass.get(row.class_id ?? '');
      if (existing) {
        existing.current += Number(row.avg_pct) * (row.student_count ?? 0);
        existing.currentCount += row.student_count ?? 0;
      } else {
        byClass.set(row.class_id ?? '', { name: row.class_name ?? '', current: Number(row.avg_pct) * (row.student_count ?? 0), currentCount: row.student_count ?? 0, prev: 0, prevCount: 0 });
      }
    }
    for (const row of prevSubjectPerf) {
      const existing = byClass.get(row.class_id ?? '');
      if (existing) {
        existing.prev += Number(row.avg_pct) * (row.student_count ?? 0);
        existing.prevCount += row.student_count ?? 0;
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
      subjects.add(row.subject_name ?? '');
      classes.add(row.class_name ?? '');
      if (!grid.has(row.class_name ?? '')) grid.set(row.class_name ?? '', new Map());
      grid.get(row.class_name ?? '')!.set(row.subject_name ?? '', Number(row.avg_pct));
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
        <Card className="bg-card">
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
        <Card className="bg-card">
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
                    <span className="text-heading">{c.name}:</span>
                    <DeltaBadge value={c.delta} />
                  </div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="bg-card">
        <CardHeader><CardTitle className="text-sm">Subject Difficulty Heatmap</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-heading font-medium">Class</th>
                  {heatmap.subjects.map((s) => (
                    <th key={s} className="text-center py-2 px-2 text-heading font-medium text-xs">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.classes.map((cls) => (
                  <tr key={cls} className="border-t /30">
                    <td className="py-2 px-3 font-medium text-sm">{cls}</td>
                    {heatmap.subjects.map((sub) => {
                      const val = heatmap.grid.get(cls)?.get(sub);
                      return (
                        <td key={sub} className="py-1 px-1 text-center">
                          {val !== undefined ? <HeatmapCell value={val} /> : <span className="text-heading text-xs">-</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-heading">
            <span>Legend:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success-50" /> 70%+</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning-50" /> 50-69%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/30" /> 30-49%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-danger-50" /> {'<30%'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Top 5 Students per Class */}
      <Card className="bg-card">
        <CardHeader><CardTitle className="text-sm">Top 5 Students per Class</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from(topStudents.entries()).map(([classId, students]) => {
              const className = students[0] ? subjectPerf.find((s) => s.class_id === classId)?.class_name || 'Unknown' : 'Unknown';
              return (
                <div key={classId}>
                  <h4 className="text-sm font-semibold mb-2 text-heading">{className}</h4>
                  <div className="space-y-1.5">
                    {students.map((s, i) => (
                      <div key={s.student_id} className="flex items-center gap-2 text-sm">
                        <span className="w-5 text-heading text-xs">{i + 1}.</span>
                        <span className="flex-1 truncate">{s.student_name}</span>
                        <span className="text-heading text-xs">{s.admission_number}</span>
                        <Badge variant="outline" className="text-xs">{s.avg_pct.toFixed(1)}%</Badge>
                        <Badge className={cn('text-xs text-heading', getGradeColor(s.grade))}>{s.grade}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {topStudents.size === 0 && <p className="text-heading text-sm col-span-full">No marks data available</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ?"EUR?"EUR?"EUR Section 3: Attendance Intelligence ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
function AttendanceAnalytics({ supabase, schoolId, termId, termStart, termEnd }: { supabase: ReturnType<typeof createBrowserClient>; schoolId?: string; termId?: string; termStart?: string; termEnd?: string }) {
  const queryClient = useQueryClient();

  const { data: weeklyData = [] } = useQuery({
    queryKey: ['analytics-attendance-weekly-summary', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_weekly_summary')
        .select('*')
        .eq('school_id', schoolId!);
      if (error) throw error;
      const rows = (data ?? []) as AttendanceWeeklyRow[];

      const byWeek = new Map<string, { total: number; present: number }>();
      for (const r of rows) {
        const week = r.week_start?.slice(0, 10) ?? '';
        const existing = byWeek.get(week) || { total: 0, present: 0 };
        existing.total += Number(r.total_records);
        existing.present += Number(r.present_count);
        byWeek.set(week, existing);
      }
      return Array.from(byWeek.entries())
        .map(([week, d]) => ({ week_start: week, total_records: d.total, present_count: d.present, attendance_pct: d.total > 0 ? (d.present / d.total) * 100 : 0, class_id: '', class_name: '' }))
        .sort((a, b) => a.week_start.localeCompare(b.week_start));
    },
    enabled: !!schoolId,
  });

  const { data: classAttendance = [] } = useQuery({
    queryKey: ['analytics-attendance-class-rank', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_weekly_summary')
        .select('*')
        .eq('school_id', schoolId!);
      if (error) throw error;
      const rows = (data ?? []) as AttendanceWeeklyRow[];

      const byClass = new Map<string, { total: number; present: number; name: string }>();
      for (const r of rows) {
        const existing = byClass.get(r.class_id ?? '') || { total: 0, present: 0, name: r.class_name ?? '' };
        existing.total += Number(r.total_records);
        existing.present += Number(r.present_count);
        byClass.set(r.class_id ?? '', existing);
      }
      return Array.from(byClass.values())
        .map((c) => ({ name: c.name, pct: c.total > 0 ? (c.present / c.total) * 100 : 0 }))
        .sort((a, b) => b.pct - a.pct);
    },
    enabled: !!schoolId,
  });

  const { data: chronicAbsentees = [], isLoading: loadingChronic } = useQuery({
    queryKey: ['analytics-attendance-chronic', schoolId, termId, termStart, termEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select(`
          student_id, class_id, date, status,
          student:students(full_name, admission_number, parent_phone),
          class:classes(name)
        `)
        .eq('school_id', schoolId!)
        .gte('date', termStart || '2000-01-01')
        .lte('date', termEnd || '2099-12-31');
      if (error) throw error;

      const records = (data ?? []) as any[];

      const byStudent = new Map<string, { name: string; adm: string; className: string; present: number; total: number; parentPhone: string | null }>();
      for (const r of records) {
        const key = r.student_id;
        const existing = byStudent.get(key) || { name: r.student?.full_name || 'Unknown', adm: r.student?.admission_number || '', className: r.class?.name || 'Unknown', present: 0, total: 0, parentPhone: r.student?.parent_phone || null };
        existing.total++;
        if (r.status === 'present') existing.present++;
        byStudent.set(key, existing);
      }
      return Array.from(byStudent.entries())
        .map(([id, s]) => ({ student_id: id, name: s.name, adm: s.adm, className: s.className, absentDays: s.total - s.present, totalDays: s.total, pct: s.total > 0 ? (s.present / s.total) * 100 : 0, parentPhone: s.parentPhone }))
        .filter((s) => s.pct < 75 && s.totalDays >= 5)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 20);
    },
    enabled: !!schoolId,
  });

  const { data: dayPattern = [] } = useQuery({
    queryKey: ['analytics-attendance-day-pattern', schoolId, termId, termStart, termEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select(`
          student_id, class_id, date, status,
          student:students(full_name, admission_number, parent_phone),
          class:classes(name)
        `)
        .eq('school_id', schoolId!)
        .gte('date', termStart || '2000-01-01')
        .lte('date', termEnd || '2099-12-31');
      if (error) throw error;

      const records = (data ?? []) as any[];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayCounts = [0, 0, 0, 0, 0, 0, 0];
      for (const r of records) {
        if (r.status === 'absent') {
          const dow = new Date(r.date).getDay();
          dayCounts[dow]++;
        }
      }
      return dayNames.map((day, i) => ({ day, absences: dayCounts[i] }));
    },
    enabled: !!schoolId,
  });

  // Refetch all sections when term changes
  useEffect(() => {
    if (!schoolId) return;
    queryClient.invalidateQueries({ queryKey: ['analytics-attendance-weekly-summary', schoolId] });
    queryClient.invalidateQueries({ queryKey: ['analytics-attendance-class-rank', schoolId] });
    queryClient.invalidateQueries({ queryKey: ['analytics-attendance-chronic', schoolId, termId, termStart, termEnd] });
    queryClient.invalidateQueries({ queryKey: ['analytics-attendance-day-pattern', schoolId, termId, termStart, termEnd] });
  }, [termId, termStart, termEnd, schoolId, queryClient]);

  const loading = loadingChronic;

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
        <Card className="bg-card">
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

        <Card className="bg-card">
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
      <Card className="bg-card">
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
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger-700" />
            Chronic Absentees (Below 75%)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-heading font-medium">#</th>
                  <th className="text-left py-2 px-3 text-heading font-medium">Student</th>
                  <th className="text-left py-2 px-3 text-heading font-medium">Adm No.</th>
                  <th className="text-left py-2 px-3 text-heading font-medium">Class</th>
                  <th className="text-center py-2 px-3 text-heading font-medium">Absent Days</th>
                  <th className="text-center py-2 px-3 text-heading font-medium">Rate</th>
                  <th className="text-right py-2 px-3 text-heading font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {chronicAbsentees.map((s, i) => (
                  <tr key={s.student_id} className="border-b /50 hover:bg-card-hover">
                    <td className="py-2.5 px-3 text-heading">{i + 1}</td>
                    <td className="py-2.5 px-3 font-medium">{s.name}</td>
                    <td className="py-2.5 px-3 text-heading">{s.adm}</td>
                    <td className="py-2.5 px-3 text-heading">{s.className}</td>
                    <td className="py-2.5 px-3 text-center text-danger-700 font-semibold">{s.absentDays}/{s.totalDays}</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="outline" className="text-danger-700 border-danger-500">{s.pct.toFixed(1)}%</Badge>
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
                  <tr><td colSpan={7} className="py-8 text-center text-heading">No chronic absentees found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ?"EUR?"EUR?"EUR Section 4: Cohort Comparison ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
function CohortComparison({ supabase, schoolId, termId }: { supabase: ReturnType<typeof createBrowserClient>; schoolId?: string; termId?: string }) {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState('');

  const { data: classes = [] } = useQuery({
    queryKey: ['analytics-cohort-classes', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', schoolId!)
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!schoolId,
  });

  const { data: terms = [] } = useQuery({
    queryKey: ['analytics-cohort-terms', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('id, name, academic_year_id')
        .eq('school_id', schoolId!)
        .order('start_date');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; academic_year_id: string }[];
    },
    enabled: !!schoolId,
  });

  // Auto-select first class when classes load
  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  // IMPORTANT: `terms` is intentionally NOT in the queryKey. Its array reference
  // changes on every render (it's the result of another useQuery), which would
  // mark this query as changed on every render and trigger an infinite refetch
  // loop (React error #185). The enabled guard and queryFn both read `terms`
  // via closure; refetch is driven by selectedClassId/termId, not by identity.
  const { data: cohortMetrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ['analytics-cohort-metrics', schoolId, selectedClassId, termId],
    queryFn: async () => {
      if (!selectedClassId || !termId || terms.length === 0) {
        return { feeData: [], marksData: [], attendanceData: [] } as { feeData: CohortData[]; marksData: CohortData[]; attendanceData: CohortData[] };
      }

      // Find previous year's equivalent term
      const currentTerm = terms.find((t) => t.id === termId);
      if (!currentTerm) return { feeData: [], marksData: [], attendanceData: [] };

      const { data: currentYear } = await supabase
        .from('academic_years').select('name').eq('id', currentTerm.academic_year_id).single();

      const prevYearName = currentYear ? String(Number(currentYear.name) - 1) : null;
      let prevTermId: string | null = null;
      if (prevYearName) {
        const { data: prevYear } = await supabase
          .from('academic_years').select('id').eq('school_id', schoolId!).eq('name', prevYearName).single();
        if (prevYear) {
          const prevTerm = terms.find((t) => t.academic_year_id === prevYear.id && t.name === currentTerm.name);
          if (prevTerm) prevTermId = prevTerm.id;
        }
      }

      // Get students currently in this class
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .eq('class_id', selectedClassId)
        .eq('term_id', termId);

      const studentIds = (enrollments || []).map((e: any) => e.student_id);
      if (studentIds.length === 0) return { feeData: [], marksData: [], attendanceData: [] };

      // Find where these students were last year (same class name)
      const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name;
      let prevClassId: string | null = null;
      if (prevYearName && selectedClassName) {
        const { data: prevClass } = await supabase
          .from('classes').select('id').eq('school_id', schoolId!).eq('name', selectedClassName).eq('is_deleted', false).single();
        if (prevClass) prevClassId = prevClass.id;
      }

      const [feeResult, marksResult, attendanceResult] = await Promise.all([
        (supabase
          .from('fee_accounts')
          .select('total_expected, total_paid, student_id, term_id')
          .eq('school_id', schoolId!)
          .eq('is_deleted', false)
          .in('student_id', studentIds) as any),
        (supabase
          .from('marks')
          .select('score, max_score, student_id, term_id')
          .eq('school_id', schoolId!)
          .eq('class_id', selectedClassId)
          .eq('is_deleted', false)
          .in('review_status', ['approved', 'submitted']) as any),
        (supabase
          .from('attendance_records')
          .select('status, student_id, date')
          .eq('school_id', schoolId!)
          .eq('class_id', selectedClassId) as any),
      ]);

      // Fee comparison
      const currentFees = (feeResult.data || []).filter((f: any) => f.term_id === termId);
      const prevFees = prevTermId ? (feeResult.data || []).filter((f: any) => f.term_id === prevTermId) : [];
      const currFeeTotal = currentFees.reduce((s: number, f: any) => s + Number(f.total_expected), 0);
      const currFeePaid = currentFees.reduce((s: number, f: any) => s + Number(f.total_paid), 0);
      const prevFeeTotal = prevFees.reduce((s: number, f: any) => s + Number(f.total_expected), 0);
      const prevFeePaid = prevFees.reduce((s: number, f: any) => s + Number(f.total_paid), 0);
      const feeData: CohortData[] = [
        { label: 'Collection Rate', current: currFeeTotal > 0 ? (currFeePaid / currFeeTotal) * 100 : 0, previous: prevFeeTotal > 0 ? (prevFeePaid / prevFeeTotal) * 100 : 0 },
      ];

      // Marks comparison
      const currMarks = (marksResult.data || []).filter((m: any) => m.term_id === termId);
      const prevMarks = prevTermId ? (marksResult.data || []).filter((m: any) => m.term_id === prevTermId) : [];
      const currAvg = currMarks.length > 0 ? currMarks.reduce((s: number, m: any) => s + (Number(m.score) / (Number(m.max_score) || 100)) * 100, 0) / currMarks.length : 0;
      const prevAvg = prevMarks.length > 0 ? prevMarks.reduce((s: number, m: any) => s + (Number(m.score) / (Number(m.max_score) || 100)) * 100, 0) / prevMarks.length : 0;
      const marksData: CohortData[] = [{ label: 'Average Marks', current: currAvg, previous: prevAvg }];

      // Attendance comparison
      const { data: termDates } = await supabase.from('terms').select('start_date, end_date').eq('id', termId).single();
      const prevTermDates = prevTermId ? await supabase.from('terms').select('start_date, end_date').eq('id', prevTermId).single() : null;

      const currAtt = (attendanceResult.data || []).filter((a: any) => {
        if (!termDates?.start_date || !termDates?.end_date) return false;
        return a.date >= termDates.start_date && a.date <= termDates.end_date;
      });
      const prevAtt = prevTermDates?.data ? (attendanceResult.data || []).filter((a: any) => a.date >= (prevTermDates.data.start_date ?? '') && a.date <= (prevTermDates.data.end_date ?? '')) : [];
      const currAttPct = currAtt.length > 0 ? (currAtt.filter((a: any) => a.status === 'present').length / currAtt.length) * 100 : 0;
      const prevAttPct = prevAtt.length > 0 ? (prevAtt.filter((a: any) => a.status === 'present').length / prevAtt.length) * 100 : 0;
      const attendanceData: CohortData[] = [{ label: 'Attendance Rate', current: currAttPct, previous: prevAttPct }];

      return { feeData, marksData, attendanceData };
    },
    enabled: !!schoolId && !!selectedClassId && !!termId && terms.length > 0,
  });

  // Refetch all sections when term changes.
  // The metrics query already includes termId in its queryKey, so React Query
  // will refetch it automatically when termId changes — no explicit
  // invalidation needed (and previously caused an extra refetch cycle).
  // Skip the first run so we don't double-fire on mount.
  const prevTermIdRef = useRef<string | undefined>(termId);
  useEffect(() => {
    if (!schoolId) return;
    if (prevTermIdRef.current === termId) return;
    prevTermIdRef.current = termId;
    queryClient.invalidateQueries({ queryKey: ['analytics-cohort-classes', schoolId] });
    queryClient.invalidateQueries({ queryKey: ['analytics-cohort-terms', schoolId] });
  }, [termId, schoolId, queryClient]);

  const loading = loadingMetrics;
  const feeData = cohortMetrics?.feeData ?? [];
  const marksData = cohortMetrics?.marksData ?? [];
  const attendanceData = cohortMetrics?.attendanceData ?? [];

  if (loading) return <SectionSkeleton />;

  const allMetrics = [...feeData, ...marksData, ...attendanceData];

  return (
    <div className="space-y-6">
      {/* Class Selector */}
      <Card className="bg-card">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <label className="text-sm font-medium">Compare Class:</label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-full sm:w-60">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-heading">vs same class last year</span>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {allMetrics.map((m) => {
          const delta = m.current - m.previous;
          const positive = delta >= 0;
          return (
            <Card key={m.label} className="bg-card">
              <CardContent className="p-6">
                <p className="text-xs text-heading uppercase tracking-wider mb-2">{m.label}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">{m.current.toFixed(1)}%</p>
                    <p className="text-xs text-heading mt-1">Last year: {m.previous.toFixed(1)}%</p>
                  </div>
                  <DeltaBadge value={delta} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Side-by-side bars */}
      <Card className="bg-card">
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

// ?"EUR?"EUR?"EUR Grade Helpers ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR
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
  if (grade.startsWith('D')) return 'bg-bg-tertiary';
  if (grade.startsWith('C')) return 'bg-bg-tertiary';
  if (grade.startsWith('P')) return 'bg-bg-tertiary';
  return 'bg-bg-tertiary';
}

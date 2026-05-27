'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { formatUGX } from '@/lib/utils/currency';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  Calendar,
  Users,
  Wallet,
  TrendingUp,
  Smartphone,
  Banknote,
  Building2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface DailyCollection {
  date: string;
  total: number;
  mobile_money: number;
  cash: number;
  bank: number;
  waiver: number;
  count: number;
}

interface ClassCollection {
  class_name: string;
  total_expected: number;
  total_paid: number;
  outstanding: number;
  rate: number;
  student_count: number;
}

interface StaffCollection {
  user_id: string;
  name: string;
  total_collected: number;
  payment_count: number;
}

interface PaymentWithJoins {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  created_at: string;
  received_by_user_id: string | null;
  student?: { full_name?: string; admission_number?: string } | null;
  received_by?: { full_name?: string } | null;
}

interface FeeAccountWithStudent {
  id: string;
  total_expected: number;
  total_paid: number;
  balance: number;
  student?: { current_class?: { name?: string } | null } | null;
}

export default function FeeReportsPage() {
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentWithJoins[]>([]);
  const [feeAccounts, setFeeAccounts] = useState<FeeAccountWithStudent[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState('daily');

  const loadData = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    const supabase = createClient();

    const termStart = currentTerm?.start_date;
    const termEnd = currentTerm?.end_date;

    const [payResult, accResult, clsResult] = await Promise.all([
      supabase
        .from('fee_payments')
        .select(`
          id, amount, payment_method, payment_date, created_at, received_by_user_id,
          student:students(full_name, admission_number),
          received_by:users!received_by_user_id(full_name)
        `)
        .eq('school_id', school.id)
        .eq('is_deleted', false)
        .eq('status', 'confirmed')
        .gte('payment_date', termStart || '2000-01-01')
        .lte('payment_date', termEnd || '2099-12-31')
        .order('created_at', { ascending: false }),
      supabase
        .from('fee_accounts')
        .select('id, total_expected, total_paid, balance, student:students(current_class:classes(name))')
        .eq('school_id', school.id)
        .eq('is_deleted', false),
      supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', school.id)
        .eq('is_deleted', false)
        .order('name'),
    ]);

    if (payResult.data) {
      setPayments(
        ((payResult.data || []) as unknown as PaymentWithJoins[]).map((p) => ({
          ...p,
          student: Array.isArray(p.student) ? p.student[0] : p.student,
          received_by: Array.isArray(p.received_by) ? p.received_by[0] : p.received_by,
        }))
      );
    }
    if (accResult.data) setFeeAccounts(accResult.data);
    if (clsResult.data) setClasses(clsResult.data);
    setLoading(false);
  }, [school?.id, currentTerm?.id, currentTerm?.start_date, currentTerm?.end_date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredPayments = useMemo(() => {
    let result = [...payments];
    if (dateFrom) result = result.filter((p) => p.payment_date >= dateFrom);
    if (dateTo) result = result.filter((p) => p.payment_date <= dateTo);
    return result;
  }, [payments, dateFrom, dateTo]);

  const dailyCollections = useMemo((): DailyCollection[] => {
    const byDate = new Map<string, DailyCollection>();
    for (const p of filteredPayments) {
      const date = p.payment_date;
      if (!byDate.has(date)) {
        byDate.set(date, { date, total: 0, mobile_money: 0, cash: 0, bank: 0, waiver: 0, count: 0 });
      }
      const dc = byDate.get(date)!;
      dc.total += p.amount;
      dc.count++;
      if (p.payment_method === 'mobile_money') dc.mobile_money += p.amount;
      else if (p.payment_method === 'cash') dc.cash += p.amount;
      else if (p.payment_method === 'bank') dc.bank += p.amount;
      else if (p.payment_method === 'waiver') dc.waiver += p.amount;
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredPayments]);

  const classCollections = useMemo((): ClassCollection[] => {
    const byClass = new Map<string, ClassCollection>();
    for (const cls of classes) {
      byClass.set(cls.name, { class_name: cls.name, total_expected: 0, total_paid: 0, outstanding: 0, rate: 0, student_count: 0 });
    }
    for (const acc of feeAccounts) {
      const student = Array.isArray(acc.student) ? acc.student[0] : acc.student;
      const cls = Array.isArray(student?.current_class) ? student.current_class[0] : student?.current_class;
      const className = cls?.name || 'Unknown';
      let cc = byClass.get(className);
      if (!cc) {
        cc = { class_name: className, total_expected: 0, total_paid: 0, outstanding: 0, rate: 0, student_count: 0 };
        byClass.set(className, cc);
      }
      cc.total_expected += acc.total_expected || 0;
      cc.total_paid += acc.total_paid || 0;
      cc.outstanding += Math.max(acc.balance || 0, 0);
      cc.student_count++;
    }
    const result = Array.from(byClass.values());
    for (const cc of result) {
      cc.rate = cc.total_expected > 0 ? Math.round((cc.total_paid / cc.total_expected) * 100) : 0;
    }
    return result.filter((c) => c.student_count > 0).sort((a, b) => b.student_count - a.student_count);
  }, [feeAccounts, classes]);

  const staffCollections = useMemo((): StaffCollection[] => {
    const byStaff = new Map<string, StaffCollection>();
    for (const p of filteredPayments) {
      const userId = p.received_by_user_id || 'unknown';
      if (!byStaff.has(userId)) {
        byStaff.set(userId, { user_id: userId, name: p.received_by?.full_name || 'Unknown', total_collected: 0, payment_count: 0 });
      }
      const sc = byStaff.get(userId)!;
      sc.total_collected += p.amount;
      sc.payment_count++;
    }
    return Array.from(byStaff.values()).sort((a, b) => b.total_collected - a.total_collected);
  }, [filteredPayments]);

  function exportCSV(data: Record<string, unknown>[], filename: string) {
    if (data.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }
    const headers = Object.keys(data[0]);
    const rows = data.map((row) => headers.map((h) => `"${String(row[h] ?? '')}"`).join(','));
    const csv = [headers.map((h) => `"${h}"`).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalCollected = filteredPayments.reduce((s, p) => s + p.amount, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-3"><Skeleton className="h-10 w-[150px]" /><Skeleton className="h-10 w-[150px]" /></div>
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financial Reports</h1>
        <p className="text-sm text-gray-400">Fee collection reports and analytics</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
          <span className="text-gray-500 text-sm">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear dates</Button>
        )}
      </div>

      <Card className="border-border-subtle bg-surface">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-400">{formatUGX(totalCollected)}</p>
              <p className="text-xs text-gray-500 mt-1">{filteredPayments.length} payments</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-400/10"><Wallet className="w-6 h-6 text-emerald-400" /></div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="daily">Daily Collection</TabsTrigger>
          <TabsTrigger value="term">Term Summary</TabsTrigger>
          <TabsTrigger value="staff">Staff Collection</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <Card className="border-border-subtle bg-surface">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Daily Collection Breakdown</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(dailyCollections.map((dc) => ({ Date: dc.date, Total: dc.total, 'Mobile Money': dc.mobile_money, Cash: dc.cash, Bank: dc.bank, Waiver: dc.waiver, 'Payment Count': dc.count })), 'daily-collection')}>
                <Download className="w-4 h-4 mr-2" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyCollections}>
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#1a1f36', border: '1px solid #2d3555', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#D1D5DB' }}
                    />
                    <Bar dataKey="mobile_money" stackId="a" fill="#F59E0B" name="Mobile Money" />
                    <Bar dataKey="cash" stackId="a" fill="#10B981" name="Cash" />
                    <Bar dataKey="bank" stackId="a" fill="#3B82F6" name="Bank" />
                    <Bar dataKey="waiver" stackId="a" fill="#8B5CF6" name="Waiver" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {dailyCollections.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No payment data for the selected period</p>
                </div>
              ) : (
                <div className="rounded-xl border border-navy-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-navy-800 border-b border-navy-700">
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Mobile Money</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Cash</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Bank</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Waiver</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Total</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyCollections.map((dc) => (
                          <tr key={dc.date} className="border-b border-navy-700/50 bg-navy-900 hover:bg-navy-800/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium">{formatDate(dc.date)}</td>
                            <td className="px-4 py-3 text-sm text-right text-amber-400">{dc.mobile_money > 0 ? formatUGX(dc.mobile_money) : '\u2014'}</td>
                            <td className="px-4 py-3 text-sm text-right text-emerald-400">{dc.cash > 0 ? formatUGX(dc.cash) : '\u2014'}</td>
                            <td className="px-4 py-3 text-sm text-right text-blue-400">{dc.bank > 0 ? formatUGX(dc.bank) : '\u2014'}</td>
                            <td className="px-4 py-3 text-sm text-right text-purple-400">{dc.waiver > 0 ? formatUGX(dc.waiver) : '\u2014'}</td>
                            <td className="px-4 py-3 text-sm text-right font-bold">{formatUGX(dc.total)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-400">{dc.count}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-navy-800 border-t border-navy-700 font-bold">
                          <td className="px-4 py-3 text-sm">Total</td>
                          <td className="px-4 py-3 text-sm text-right text-amber-400">{formatUGX(dailyCollections.reduce((s, d) => s + d.mobile_money, 0))}</td>
                          <td className="px-4 py-3 text-sm text-right text-emerald-400">{formatUGX(dailyCollections.reduce((s, d) => s + d.cash, 0))}</td>
                          <td className="px-4 py-3 text-sm text-right text-blue-400">{formatUGX(dailyCollections.reduce((s, d) => s + d.bank, 0))}</td>
                          <td className="px-4 py-3 text-sm text-right text-purple-400">{formatUGX(dailyCollections.reduce((s, d) => s + d.waiver, 0))}</td>
                          <td className="px-4 py-3 text-sm text-right">{formatUGX(dailyCollections.reduce((s, d) => s + d.total, 0))}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-400">{dailyCollections.reduce((s, d) => s + d.count, 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="term">
          <Card className="border-border-subtle bg-surface">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Per-Class Collection Summary</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(classCollections.map((cc) => ({ Class: cc.class_name, Students: cc.student_count, 'Total Expected': cc.total_expected, 'Total Paid': cc.total_paid, Outstanding: cc.outstanding, 'Collection Rate': `${cc.rate}%` })), 'term-summary')}>
                <Download className="w-4 h-4 mr-2" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <ResponsiveContainer width="100%" height={200}>
                  <RechartsPieChart>
                    <Pie
                      data={classCollections}
                      dataKey="total_paid"
                      nameKey="class_name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {classCollections.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1'][index % 8]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#1a1f36', border: '1px solid #2d3555', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#D1D5DB' }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              {classCollections.length === 0 ? (
                <div className="text-center py-12 text-gray-500"><Users className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>No class data available</p></div>
              ) : (
                <div className="rounded-xl border border-navy-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="bg-navy-800 border-b border-navy-700">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Class</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Students</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Expected</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Collected</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Outstanding</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Rate</th>
                      </tr></thead>
                      <tbody>
                        {classCollections.map((cc) => (
                          <tr key={cc.class_name} className="border-b border-navy-700/50 bg-navy-900 hover:bg-navy-800/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium">{cc.class_name}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-400">{cc.student_count}</td>
                            <td className="px-4 py-3 text-sm text-right">{formatUGX(cc.total_expected)}</td>
                            <td className="px-4 py-3 text-sm text-right text-emerald-400">{formatUGX(cc.total_paid)}</td>
                            <td className="px-4 py-3 text-sm text-right text-rose-400">{formatUGX(cc.outstanding)}</td>
                            <td className="px-4 py-3 text-right"><Badge variant={cc.rate >= 80 ? 'success' : cc.rate >= 50 ? 'warning' : 'destructive'} className="text-xs">{cc.rate}%</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr className="bg-navy-800 border-t border-navy-700 font-bold">
                        <td className="px-4 py-3 text-sm">Total</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-400">{classCollections.reduce((s, c) => s + c.student_count, 0)}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatUGX(classCollections.reduce((s, c) => s + c.total_expected, 0))}</td>
                        <td className="px-4 py-3 text-sm text-right text-emerald-400">{formatUGX(classCollections.reduce((s, c) => s + c.total_paid, 0))}</td>
                        <td className="px-4 py-3 text-sm text-right text-rose-400">{formatUGX(classCollections.reduce((s, c) => s + c.outstanding, 0))}</td>
                        <td className="px-4 py-3 text-sm text-right">{(() => { const te = classCollections.reduce((s, c) => s + c.total_expected, 0); const tp = classCollections.reduce((s, c) => s + c.total_paid, 0); return te > 0 ? `${Math.round((tp / te) * 100)}%` : '\u2014'; })()}</td>
                      </tr></tfoot>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card className="border-border-subtle bg-surface">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Staff Collection Performance</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(staffCollections.map((sc) => ({ 'Staff Name': sc.name, 'Total Collected': sc.total_collected, 'Payment Count': sc.payment_count })), 'staff-collection')}>
                <Download className="w-4 h-4 mr-2" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {staffCollections.length === 0 ? (
                <div className="text-center py-12 text-gray-500"><Users className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>No payment data available</p></div>
              ) : (
                <div className="rounded-xl border border-navy-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="bg-navy-800 border-b border-navy-700">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Staff Name</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Payments</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Total Collected</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">% of Total</th>
                      </tr></thead>
                      <tbody>
                        {staffCollections.map((sc) => (
                          <tr key={sc.user_id} className="border-b border-navy-700/50 bg-navy-900 hover:bg-navy-800/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium">{sc.name}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-400">{sc.payment_count}</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-400">{formatUGX(sc.total_collected)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-400">{totalCollected > 0 ? `${Math.round((sc.total_collected / totalCollected) * 100)}%` : '\u2014'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

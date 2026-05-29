'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatUGX } from '@/lib/utils/currency';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import { useSchoolStore } from '@/store/school';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Download,
  FileText,
  Search,
  Wallet,
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
} from 'recharts';

const CHART_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];

interface Expense {
  id: string;
  category_id: string | null;
  term_id: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  receipt_number: string | null;
  recorded_by: string | null;
  notes: string | null;
  expense_categories?: { name: string } | null;
  users?: { full_name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

export default function ExpensesPage() {
  const { currentTerm } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 20;

  const [form, setForm] = useState({
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    category_id: '',
    payment_method: 'cash',
    receipt_number: '',
    notes: '',
  });

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses', currentTerm?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentTerm?.id) params.set('term_id', currentTerm.id);
      const res = await fetch(`/api/fees/expenses?${params}`);
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!currentTerm?.id,
  });

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await fetch('/api/fees/expenses/categories');
      const json = await res.json();
      return json.data || [];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ['fee-payments-income', currentTerm?.id],
    queryFn: async () => {
      const res = await fetch(`/api/fees/payments?term_id=${currentTerm?.id}`);
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!currentTerm?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/fees/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          amount: parseFloat(data.amount),
          term_id: currentTerm?.id || null,
          category_id: data.category_id || null,
          receipt_number: data.receipt_number || null,
          notes: data.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create expense');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: 'Expense recorded' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setForm({
      description: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      category_id: '',
      payment_method: 'cash',
      receipt_number: '',
      notes: '',
    });
  };

  const totalIncome = useMemo(() => {
    if (!payments) return 0;
    return payments
      .filter((p: any) => p.status === 'confirmed')
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  }, [payments]);

  const totalExpenses = useMemo(() => {
    if (!expenses) return 0;
    return expenses.reduce((sum: number, e: Expense) => sum + Number(e.amount), 0);
  }, [expenses]);

  const netSurplus = totalIncome - totalExpenses;

  const weeklyChartData = useMemo(() => {
    if (!expenses || !payments) return [];
    const weekMap = new Map<number, { income: number; expenses: number }>();

    payments
      .filter((p: any) => p.status === 'confirmed')
      .forEach((p: any) => {
        const week = getWeekNumber(p.payment_date);
        const entry = weekMap.get(week) || { income: 0, expenses: 0 };
        entry.income += Number(p.amount);
        weekMap.set(week, entry);
      });

    expenses.forEach((e: Expense) => {
      const week = getWeekNumber(e.expense_date);
      const entry = weekMap.get(week) || { income: 0, expenses: 0 };
      entry.expenses += Number(e.amount);
      weekMap.set(week, entry);
    });

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([week, data]) => ({
        week: `Wk ${week}`,
        Income: data.income,
        Expenses: data.expenses,
      }));
  }, [expenses, payments]);

  const categoryChartData = useMemo(() => {
    if (!expenses) return [];
    const map = new Map<string, number>();
    expenses.forEach((e: Expense) => {
      const name = e.expense_categories?.name || 'Uncategorized';
      map.set(name, (map.get(name) || 0) + Number(e.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter((e: Expense) => {
      const matchesSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || e.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, search, categoryFilter]);

  const paginatedExpenses = useMemo(() => {
    return filteredExpenses.slice(page * perPage, (page + 1) * perPage);
  }, [filteredExpenses, page]);

  const totalPages = Math.ceil(filteredExpenses.length / perPage);

  const handleExportCSV = async () => {
    const params = new URLSearchParams();
    if (currentTerm?.id) params.set('term_id', currentTerm.id);
    const res = await fetch(`/api/fees/expenses/export?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${currentTerm?.id || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPL = async () => {
    if (!currentTerm?.id) return;
    const res = await fetch(`/api/fees/pl-report?term_id=${currentTerm.id}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pl-report.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const methodLabels: Record<string, string> = {
    cash: 'Cash',
    bank: 'Bank',
    mobile_money: 'Mobile Money',
    cheque: 'Cheque',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expense Tracking</h1>
          <p className="text-foreground/60 mt-1">Track and analyze school expenses</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g. Electricity bill - May"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount (UGX)</Label>
                    <Input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.expense_date}
                      onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((c: Category) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Receipt Number (optional)</Label>
                  <Input
                    value={form.receipt_number}
                    onChange={(e) => setForm({ ...form, receipt_number: e.target.value })}
                    placeholder="Receipt reference"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Additional notes"
                  />
                </div>
                <Button
                  onClick={() => createMutation.mutate(form)}
                  disabled={!form.description || !form.amount || createMutation.isPending}
                  className="w-full"
                >
                  Record Expense
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleExportPL} className="bg-purple-600 text-white hover:bg-purple-700">
            <FileText className="w-4 h-4 mr-2" />
            P&L Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/60">Total Income</p>
                  <p className="text-2xl font-bold mt-1 text-green-500">{formatUGX(totalIncome)}</p>
                  <p className="text-xs text-foreground/40 mt-1">Fee payments this term</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-500/10">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/60">Total Expenses</p>
                  <p className="text-2xl font-bold mt-1 text-red-500">{formatUGX(totalExpenses)}</p>
                  <p className="text-xs text-foreground/40 mt-1">This term</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-500/10">
                  <TrendingDown className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border-subtle bg-surface">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/60">Net {netSurplus >= 0 ? 'Surplus' : 'Deficit'}</p>
                  <p className={cn('text-2xl font-bold mt-1', netSurplus >= 0 ? 'text-amber-500' : 'text-red-500')}>
                    {formatUGX(Math.abs(netSurplus))}
                  </p>
                  <p className="text-xs text-foreground/40 mt-1">{netSurplus >= 0 ? 'Surplus' : 'Deficit'} this term</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10">
                  <Wallet className="w-6 h-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-4">Income vs Expenses by Week</h3>
            {weeklyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3050" />
                  <XAxis dataKey="week" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#1a1f36', border: '1px solid #2a3050', borderRadius: 8 }}
                    labelStyle={{ color: '#ccc' }}
                    formatter={((value: number) => formatUGX(value)) as any}
                  />
                  <Bar dataKey="Income" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-foreground/40">
                No data for this term
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-4">Expenses by Category</h3>
            {categoryChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <RechartsPieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      nameKey="name"
                    >
                      {categoryChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#1a1f36', border: '1px solid #2a3050', borderRadius: 8 }}
                      formatter={((value: number) => formatUGX(value)) as any}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1">
                  {categoryChartData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs text-foreground/60">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      {entry.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-foreground/40">
                No expenses yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Expense Records</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                <Input
                  placeholder="Search expenses..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((c: Category) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : paginatedExpenses.length === 0 ? (
            <div className="py-12 text-center text-foreground/40">
              {search || categoryFilter !== 'all' ? 'No matching expenses' : 'No expenses recorded yet'}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Receipt #</TableHead>
                    <TableHead>Recorded By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedExpenses.map((expense: Expense, i: number) => (
                    <motion.tr
                      key={expense.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <TableCell>{formatDate(expense.expense_date)}</TableCell>
                      <TableCell>
                        {expense.expense_categories?.name ? (
                          <Badge variant="secondary">{expense.expense_categories.name}</Badge>
                        ) : (
                          <span className="text-foreground/30">--</span>
                        )}
                      </TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell className="text-right text-red-400 font-medium">
                        {formatUGX(Number(expense.amount))}
                      </TableCell>
                      <TableCell>{methodLabels[expense.payment_method || ''] || '--'}</TableCell>
                      <TableCell>{expense.receipt_number || '--'}</TableCell>
                      <TableCell>{expense.users?.full_name || '--'}</TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-foreground/60">
                    Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, filteredExpenses.length)} of {filteredExpenses.length}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

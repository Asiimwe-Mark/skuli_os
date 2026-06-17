'use client';

/**
 * app/dashboard/fees/expenses/pl-report/page.tsx
 *
 * AP-1 fix: useEffect+fetch('/api/terms') → useQuery(queryKeys.terms)
 * AP-6 fix: callbacks in useCallback
 * AP-11 fix: no dangling setLoading — useMutation handles loading state
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSchoolStore } from '@/store/school';
import { queryKeys } from '@/lib/query-keys';
import { formatUGX } from '@/lib/utils/currency';
import { TrendingUp, Download, Printer, Loader2, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorBoundary } from '@/components/error-boundary';
import { useToast } from '@/components/ui/use-toast';

interface Term {
  id: string;
  name: string;
  academic_year?: { name: string };
}

interface PlData {
  income_total: number;
  expense_total: number;
  net: number;
  income_by_class: {
    class: string;
    expected: number;
    collected: number;
    outstanding: number;
    collection_pct: number;
  }[];
  expenses_by_category: { category: string; amount: number; pct: number }[];
}

export default function PlReportPage() {
  const { toast } = useToast();
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const [selectedTermId, setSelectedTermId] = useState<string>(
    () => currentTerm?.id ?? '',
  );

  // AP-1 fix: useQuery replaces useEffect+fetch+setState
  const { data: terms = [], isLoading: termsLoading } = useQuery<Term[]>({
    queryKey: queryKeys.terms?.(school?.id ?? '') ?? ['terms', school?.id],
    queryFn: async () => {
      const res = await fetch('/api/terms', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to load terms');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!school?.id,
    staleTime: 2 * 60_000,
    // AP-12 fix: no AbortController needed — React Query handles cancellation
  });

  // Auto-select current term once terms load
  // (selectedTermId is initialised from currentTerm above, so usually no-op)

  // AP-11 fix: useMutation manages loading/error state — no manual setLoading
  const generateMutation = useMutation<PlData, Error, string>({
    mutationFn: async (termId: string) => {
      const res = await fetch(
        `/api/fees/pl-report?term_id=${termId}`,
        { credentials: 'same-origin' },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to generate report');
      }
      const json = await res.json();
      return json.data as PlData;
    },
    onError: (err) => {
      toast({ title: 'Report failed', description: err.message, variant: 'destructive' });
    },
  });

  // AP-6 fix: stable callback reference
  const handleGenerate = useCallback(() => {
    if (!selectedTermId) return;
    generateMutation.mutate(selectedTermId);
  }, [selectedTermId, generateMutation]);

  const handleDownloadPdf = useCallback(() => {
    window.open(
      `/api/fees/pl-report?term_id=${selectedTermId}&format=pdf`,
      '_blank',
    );
  }, [selectedTermId]);

  const data = generateMutation.data ?? null;

  return (
    <ErrorBoundary section="P&L Report">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Profit &amp; Loss Report</h1>
            <p className="text-muted">Income vs expenses for the selected term</p>
          </div>
          {data && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <Select value={selectedTermId} onValueChange={setSelectedTermId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={termsLoading ? 'Loading terms…' : 'Select term'} />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.academic_year ? ` — ${t.academic_year.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleGenerate}
              disabled={!selectedTermId || generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4 mr-1" />
              )}
              Generate Report
            </Button>
            {generateMutation.isError && (
              <p className="text-sm text-danger-600 flex items-center gap-1">
                <WifiOff className="h-4 w-4" />
                {generateMutation.error.message}
              </p>
            )}
          </CardContent>
        </Card>

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted">Total Fees Collected</p>
                  <p className="text-2xl font-bold text-success-600 dark:text-success-400">
                    {formatUGX(data.income_total)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted">Total Expenses</p>
                  <p className="text-2xl font-bold text-danger-600 dark:text-danger-400">
                    {formatUGX(data.expense_total)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted">Net Position</p>
                  <p
                    className={`text-2xl font-bold ${
                      data.net >= 0
                        ? 'text-success-600 dark:text-success-400'
                        : 'text-danger-600 dark:text-danger-400'
                    }`}
                  >
                    {data.net >= 0 ? '+' : ''}
                    {formatUGX(data.net)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Income by Class</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted">
                        <th className="py-2 pr-4">Class</th>
                        <th className="py-2 pr-4 text-right">Expected</th>
                        <th className="py-2 pr-4 text-right">Collected</th>
                        <th className="py-2 pr-4 text-right">Outstanding</th>
                        <th className="py-2 text-right">Collection %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.income_by_class.map((row) => (
                        <tr key={row.class} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{row.class}</td>
                          <td className="py-2 pr-4 text-right">{formatUGX(row.expected)}</td>
                          <td className="py-2 pr-4 text-right text-success-600">
                            {formatUGX(row.collected)}
                          </td>
                          <td className="py-2 pr-4 text-right text-danger-600">
                            {formatUGX(row.outstanding)}
                          </td>
                          <td className="py-2 text-right">{row.collection_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Expenses by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted">
                        <th className="py-2 pr-4">Category</th>
                        <th className="py-2 pr-4 text-right">Amount</th>
                        <th className="py-2 text-right">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expenses_by_category.map((row) => (
                        <tr key={row.category} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{row.category}</td>
                          <td className="py-2 pr-4 text-right">{formatUGX(row.amount)}</td>
                          <td className="py-2 text-right">{row.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useSchoolStore } from '@/store/school';
import { formatUGX } from '@/lib/utils/currency';
import { TrendingUp, Download, Printer, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Term {
  id: string;
  name: string;
}

interface PlData {
  income_total: number;
  expense_total: number;
  net: number;
  income_by_class: { class: string; expected: number; collected: number; outstanding: number; collection_pct: number }[];
  expenses_by_category: { category: string; amount: number; pct: number }[];
}

export default function PlReportPage() {
  const { currentTerm, school } = useSchoolStore();
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [data, setData] = useState<PlData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/terms')
      .then((r) => r.json())
      .then(({ data }) => {
        setTerms(data ?? []);
        if (currentTerm) setSelectedTermId(currentTerm.id);
      })
      .catch(() => {});
  }, [currentTerm]);

  async function generateReport() {
    if (!selectedTermId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fees/pl-report?term_id=${selectedTermId}`);
      const { data: reportData } = await res.json();
      setData(reportData);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  function downloadPdf() {
    window.open(`/api/fees/pl-report?term_id=${selectedTermId}&format=pdf`, '_blank');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profit & Loss Report</h1>
          <p className="text-gray-500">Income vs expenses for the selected term</p>
        </div>
        <div className="flex gap-2">
          {data && (
            <>
              <Button variant="outline" size="sm" onClick={downloadPdf}>
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <Select value={selectedTermId} onValueChange={setSelectedTermId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={generateReport} disabled={!selectedTermId || loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-1" />}
            Generate Report
          </Button>
        </CardContent>
      </Card>

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-500">Total Fees Collected</p>
                <p className="text-2xl font-bold text-green-600">{formatUGX(data.income_total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-500">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600">{formatUGX(data.expense_total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-500">Net Position</p>
                <p className={`text-2xl font-bold ${data.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.net >= 0 ? '+' : ''}{formatUGX(data.net)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Income breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Income by Class</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
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
                        <td className="py-2 pr-4 text-right text-green-600">{formatUGX(row.collected)}</td>
                        <td className="py-2 pr-4 text-right text-red-600">{formatUGX(row.outstanding)}</td>
                        <td className="py-2 text-right">{row.collection_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Expense breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
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
  );
}

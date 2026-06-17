'use client';

/**
 * app/portal/fees/page.tsx
 * AP-1 fix: useEffect+supabase.from('users') + 2× fetch → useQuery hooks
 * AP-3 fix: typed interfaces — no `as any`
 * AP-7 fix: memoized term grouping
 */

import { useMemo } from 'react';
import { usePortal } from '@/app/portal/PortalContext';
import { formatUGX } from '@/lib/utils/currency';
import { Receipt, Loader2, WifiOff, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePortalFeeAccounts } from '@/hooks/use-portal-data';
import { ErrorBoundary } from '@/components/error-boundary';
import type { PortalFeeAccount } from '@/hooks/use-portal-data';

const statusIcon = {
  paid:     <CheckCircle className="h-4 w-4 text-success-600" />,
  partial:  <Clock className="h-4 w-4 text-warning-600" />,
  unpaid:   <AlertCircle className="h-4 w-4 text-danger-600" />,
  overpaid: <CheckCircle className="h-4 w-4 text-blue-600" />,
};

const statusLabel: Record<string, string> = {
  paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', overpaid: 'Overpaid',
};

const statusClass: Record<string, string> = {
  paid: 'bg-success-50 text-success-700',
  partial: 'bg-warning-100 text-warning-700',
  unpaid: 'bg-danger-50 text-danger-700',
  overpaid: 'bg-blue-50 text-blue-700',
};

export default function PortalFeesPage() {
  const { selectedStudentId, selectedStudent, linkedStudents, setSelectedStudentId, loading: portalLoading } = usePortal();

  // AP-1 fix: usePortalFeeAccounts replaces useEffect+fetch('/api/portal/fees')
  const { data: accounts = [], isLoading, isError, refetch } = usePortalFeeAccounts(
    selectedStudentId || undefined
  );

  // AP-7 fix: memoize sort so it doesn't re-run on unrelated state changes
  const sorted = useMemo<PortalFeeAccount[]>(
    () => [...accounts].sort((a, b) => (b.term?.name ?? '').localeCompare(a.term?.name ?? '')),
    [accounts]
  );

  // Latest term for the summary card
  const current = sorted[0] ?? null;

  if (portalLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-warning-600" /></div>;
  }

  if (isError) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center px-4">
        <WifiOff className="h-10 w-10 text-muted" />
        <p className="text-muted text-sm">Could not load fee accounts.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  return (
    <ErrorBoundary section="Fees">
      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">School Fees</h1>
            <p className="text-muted">{selectedStudent?.student.full_name}</p>
          </div>
          {linkedStudents.length > 1 && (
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {linkedStudents.map((ls) => (
                  <SelectItem key={ls.student_id} value={ls.student_id}>
                    {ls.student.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-warning-600" /></div>
        ) : accounts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Receipt className="h-12 w-12 text-muted mx-auto mb-3" />
              <p className="text-muted">No fee records found.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {current && (
              <Card className="border-warning-50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Current Term — {current.term?.name ?? 'N/A'}
                    <Badge className={statusClass[current.status] ?? ''}>
                      {statusLabel[current.status] ?? current.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted">Total Due</p>
                      <p className="text-xl font-bold">{formatUGX(current.total_expected)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Paid</p>
                      <p className="text-xl font-bold text-success-600">{formatUGX(current.total_paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Balance</p>
                      <p className={`text-xl font-bold ${current.balance > 0 ? 'text-danger-600' : 'text-success-600'}`}>
                        {formatUGX(Math.abs(current.balance))}
                        {current.balance < 0 ? ' (credit)' : ''}
                      </p>
                    </div>
                  </div>
                  {current.balance > 0 && (
                    <p className="text-xs text-muted mt-4">
                      Please pay the outstanding balance to the school bursar or via the school's payment portal.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              <h2 className="font-semibold text-heading">Fee History</h2>
              {sorted.map((acc) => (
                <Card key={acc.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {statusIcon[acc.status]}
                      <div>
                        <p className="font-medium text-sm">{acc.term?.name ?? 'Unknown term'}</p>
                        <p className="text-xs text-muted">
                          Due {formatUGX(acc.total_expected)} · Paid {formatUGX(acc.total_paid)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-semibold text-sm ${acc.balance > 0 ? 'text-danger-600' : 'text-success-600'}`}>
                        {acc.balance > 0 ? `− ${formatUGX(acc.balance)}` : 'Clear'}
                      </p>
                      <Badge className={`text-[10px] ${statusClass[acc.status] ?? ''}`}>
                        {statusLabel[acc.status] ?? acc.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

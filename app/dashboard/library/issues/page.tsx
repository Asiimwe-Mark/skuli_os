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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BookMarked,
  Download,
  Search,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';

const FINE_PER_DAY = 500;

interface Issue {
  id: string;
  book_id: string;
  student_id: string;
  issued_at: string;
  due_date: string;
  returned_at: string | null;
  fine_amount: number | null;
  fine_paid: boolean;
  issued_by: string | null;
  library_books?: { title: string; author: string | null; isbn: string | null };
  students?: { full_name: string; admission_number: string };
}

export default function LibraryIssuesPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [finePaid, setFinePaid] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Fetch issues
  const { data: issues, isLoading } = useQuery<Issue[]>({
    queryKey: ['library-issues', school?.id],
    queryFn: async () => {
      const res = await fetch('/api/library/issues');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    enabled: !!school?.id,
  });

  // Return book mutation
  const returnBook = useMutation({
    mutationFn: async ({ issueId, finePaid }: { issueId: string; finePaid: boolean }) => {
      const res = await fetch('/api/library/issues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: issueId, fine_paid: finePaid }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-issues'] });
      queryClient.invalidateQueries({ queryKey: ['library-books'] });
      toast({ title: 'Book returned successfully' });
      setReturnDialogOpen(false);
      setSelectedIssue(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/library/issues/export${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `library-issues-${statusFilter}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export complete' });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  // Filtered issues
  const filteredIssues = useMemo(() => {
    if (!issues) return [];
    const today = new Date().toISOString().split('T')[0];
    return issues.filter(issue => {
      const matchesSearch = !search ||
        issue.library_books?.title.toLowerCase().includes(search.toLowerCase()) ||
        issue.students?.full_name.toLowerCase().includes(search.toLowerCase()) ||
        issue.students?.admission_number.toLowerCase().includes(search.toLowerCase());

      const isOverdue = !issue.returned_at && issue.due_date < today;
      const isOutstanding = !issue.returned_at;
      const isReturned = !!issue.returned_at;

      let matchesStatus = true;
      if (statusFilter === 'returned') matchesStatus = isReturned;
      else if (statusFilter === 'outstanding') matchesStatus = isOutstanding && !isOverdue;
      else if (statusFilter === 'overdue') matchesStatus = isOverdue;

      return matchesSearch && matchesStatus;
    });
  }, [issues, search, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredIssues.length / pageSize);
  const paginatedIssues = filteredIssues.slice(page * pageSize, (page + 1) * pageSize);

  // Status counts
  const today = new Date().toISOString().split('T')[0];
  const outstandingCount = issues?.filter(i => !i.returned_at).length ?? 0;
  const overdueCount = issues?.filter(i => !i.returned_at && i.due_date < today).length ?? 0;
  const returnedCount = issues?.filter(i => i.returned_at).length ?? 0;

  // Calculate fine for selected issue
  const calculateFine = (issue: Issue) => {
    if (issue.returned_at) return issue.fine_amount ?? 0;
    const dueDate = new Date(issue.due_date);
    const now = new Date();
    if (now <= dueDate) return 0;
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
    return daysOverdue * FINE_PER_DAY;
  };

  const handleReturnClick = (issue: Issue) => {
    setSelectedIssue(issue);
    setFinePaid(false);
    setReturnDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookMarked className="w-6 h-6" />
            Issues & Returns
          </h1>
          <p className="text-foreground/60 mt-1">Track book issues and process returns</p>
        </div>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: 'All', count: issues?.length ?? 0 },
          { key: 'outstanding', label: 'Outstanding', count: outstandingCount },
          { key: 'overdue', label: 'Overdue', count: overdueCount },
          { key: 'returned', label: 'Returned', count: returnedCount },
        ].map(tab => (
          <Button
            key={tab.key}
            variant={statusFilter === tab.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setStatusFilter(tab.key); setPage(0); }}
            className={cn(
              statusFilter === tab.key && tab.key === 'overdue' && 'bg-rose-500 hover:bg-rose-600',
            )}
          >
            {tab.key === 'overdue' && <AlertTriangle className="w-3 h-3 mr-1" />}
            {tab.key === 'outstanding' && <Clock className="w-3 h-3 mr-1" />}
            {tab.key === 'returned' && <CheckCircle2 className="w-3 h-3 mr-1" />}
            {tab.label}
            <Badge variant="secondary" className="ml-2 text-xs">{tab.count}</Badge>
          </Button>
        ))}
      </div>

      {/* Search */}
      <Card className="border-border-subtle bg-surface">
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
            <Input
              placeholder="Search by book, student, or admission #..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Issues Table */}
      <Card className="border-border-subtle bg-surface">
        <CardContent className="p-0">
          <div className="rounded-xl border border-navy-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-navy-800 border-b border-navy-700">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Book</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Issued</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Due Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Fine</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700/50">
                  {paginatedIssues.map((issue, i) => {
                    const isOverdue = !issue.returned_at && issue.due_date < today;
                    const isReturned = !!issue.returned_at;
                    const fine = calculateFine(issue);

                    return (
                      <motion.tr
                        key={issue.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="bg-navy-900 hover:bg-navy-800/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{issue.library_books?.title}</p>
                          <p className="text-xs text-foreground/50">{issue.library_books?.author}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm">{issue.students?.full_name}</p>
                          <p className="text-xs text-foreground/50">{issue.students?.admission_number}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground/70">
                          {formatDate(issue.issued_at)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={cn(isOverdue && 'text-rose-400 font-medium')}>
                            {formatDate(issue.due_date)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isReturned ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                              Returned
                            </Badge>
                          ) : isOverdue ? (
                            <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                              Overdue
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                              Outstanding
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {fine > 0 ? (
                            <div>
                              <p className={cn('font-medium', issue.fine_paid ? 'text-emerald-400' : 'text-rose-400')}>
                                {formatUGX(fine)}
                              </p>
                              {issue.fine_paid && (
                                <p className="text-xs text-emerald-400/70">Paid</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!isReturned && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReturnClick(issue)}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Return
                            </Button>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                  {paginatedIssues.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-foreground/40">
                        No issues found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-navy-700">
              <p className="text-sm text-foreground/60">
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredIssues.length)} of {filteredIssues.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return Book Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return Book</DialogTitle>
          </DialogHeader>
          {selectedIssue && (
            <div className="space-y-4 py-4">
              <div className="bg-navy-800 rounded-lg p-4 space-y-2">
                <p className="font-medium">{selectedIssue.library_books?.title}</p>
                <p className="text-sm text-foreground/60">
                  Issued to: {selectedIssue.students?.full_name} ({selectedIssue.students?.admission_number})
                </p>
                <p className="text-sm text-foreground/60">
                  Due: {formatDate(selectedIssue.due_date)}
                </p>
              </div>

              {calculateFine(selectedIssue) > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-rose-400">
                    Overdue Fine: {formatUGX(calculateFine(selectedIssue))}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">
                    {Math.floor((new Date().getTime() - new Date(selectedIssue.due_date).getTime()) / 86400000)} days × {formatUGX(FINE_PER_DAY)}/day
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Checkbox
                      id="fine-paid"
                      checked={finePaid}
                      onCheckedChange={(checked) => setFinePaid(checked as boolean)}
                    />
                    <Label htmlFor="fine-paid" className="text-sm cursor-pointer">
                      Fine has been paid
                    </Label>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => returnBook.mutate({ issueId: selectedIssue.id, finePaid })}
                disabled={returnBook.isPending}
              >
                {returnBook.isPending ? 'Processing...' : 'Confirm Return'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/components/ui/use-toast';
import {
  Shield,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  ArrowRight,
  Loader2,
  Clock,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  school_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
  user?: { full_name: string; role: string } | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_TYPES = [
  { value: 'all', label: 'All Actions' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'bulk_import', label: 'Bulk Import' },
  { value: 'login', label: 'Login' },
  { value: 'export', label: 'Export' },
];

const ENTITY_TYPES = [
  { value: 'all', label: 'All Entities' },
  { value: 'student', label: 'Student' },
  { value: 'fee_payment', label: 'Fee Payment' },
  { value: 'staff', label: 'Staff' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'marks', label: 'Marks' },
  { value: 'settings', label: 'Settings' },
  { value: 'fee_structure', label: 'Fee Structure' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'report_card', label: 'Report Card' },
  { value: 'discipline', label: 'Discipline' },
  { value: 'message', label: 'Message' },
];

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  updated: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  deleted: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  bulk_import: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  login: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  export: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getActionCategory(action: string): string {
  if (action.includes('creat')) return 'created';
  if (action.includes('updat')) return 'updated';
  if (action.includes('delet') || action.includes('remov')) return 'deleted';
  if (action.includes('bulk') || action.includes('import')) return 'bulk_import';
  if (action.includes('login') || action.includes('logout') || action.includes('auth')) return 'login';
  if (action.includes('export') || action.includes('download')) return 'export';
  return action;
}

function DiffView({ oldVal, newVal }: { oldVal: Record<string, any> | null; newVal: Record<string, any> | null }) {
  if (!oldVal && !newVal) return <p className="text-foreground/40 text-xs">No changes recorded</p>;

  // Created: show new values
  if (!oldVal && newVal) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-emerald-400 mb-2">New Record</p>
        {Object.entries(newVal).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="text-foreground/50 w-32 truncate">{key}</span>
            <span className="text-foreground">{formatValue(value)}</span>
          </div>
        ))}
      </div>
    );
  }

  // Deleted: show old values
  if (oldVal && !newVal) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-rose-400 mb-2">Deleted Record</p>
        {Object.entries(oldVal).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="text-foreground/50 w-32 truncate">{key}</span>
            <span className="text-foreground/60 line-through">{formatValue(value)}</span>
          </div>
        ))}
      </div>
    );
  }

  // Updated: show diff
  if (oldVal && newVal) {
    const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
    const changedKeys = Array.from(allKeys).filter((key) => JSON.stringify(oldVal[key]) !== JSON.stringify(newVal[key]));

    if (changedKeys.length === 0) {
      return <p className="text-foreground/40 text-xs">No field changes detected</p>;
    }

    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-blue-400 mb-2">Changed Fields ({changedKeys.length})</p>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-1 items-center">
          <span className="text-[10px] uppercase tracking-wider text-foreground/40">Old Value</span>
          <span />
          <span className="text-[10px] uppercase tracking-wider text-foreground/40">New Value</span>
          {changedKeys.map((key) => (
            <Row key={key} field={key} oldVal={oldVal[key]} newVal={newVal[key]} />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function Row({ field, oldVal, newVal }: { field: string; oldVal: any; newVal: any }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-foreground/50 text-xs w-28 truncate">{field}</span>
        <span className="text-xs text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded">{formatValue(oldVal)}</span>
      </div>
      <ArrowRight className="w-3 h-3 text-foreground/30" />
      <span className="text-xs text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded">{formatValue(newVal)}</span>
    </>
  );
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const supabase = createBrowserClient();
  const school = useSchoolStore((s) => s.school);
  const { toast } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Load users for filter dropdown
  useEffect(() => {
    if (!school?.id) return;
    const loadUsers = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('school_id', school.id)
        .eq('is_deleted', false)
        .order('full_name');
      setUsers(data || []);
    };
    loadUsers();
  }, [school?.id]);

  // Load audit logs
  useEffect(() => {
    if (!school?.id) return;
    setLoading(true);

    const load = async () => {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .eq('school_id', school.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');
      if (userFilter !== 'all') query = query.eq('user_id', userFilter);

      const { data, error } = await query;

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Fetch user names for the logs
      const userIds = [...new Set((data || []).map((l: any) => l.user_id).filter(Boolean))];
      let userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', userIds);
        if (userData) {
          for (const u of userData) userMap.set(u.id, u.full_name);
        }
      }

      const enriched = (data || []).map((log: any) => ({
        ...log,
        user: log.user_id ? { full_name: userMap.get(log.user_id) || 'Unknown', role: '' } : null,
      }));

      setLogs(enriched);
      setLoading(false);
    };

    load();
  }, [school?.id, dateFrom, dateTo, userFilter, page]);

  // Client-side filters for action and entity type
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter !== 'all') {
        const category = getActionCategory(log.action);
        if (category !== actionFilter) return false;
      }
      if (entityFilter !== 'all') {
        if (log.entity_type !== entityFilter) return false;
      }
      return true;
    });
  }, [logs, actionFilter, entityFilter]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const headers = ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Changed By', 'Old Value', 'New Value'];
    const rows = filteredLogs.map((log) => [
      formatDate(log.created_at),
      log.action,
      log.entity_type || '',
      log.entity_id || '',
      log.user?.full_name || '',
      log.old_value ? JSON.stringify(log.old_value) : '',
      log.new_value ? JSON.stringify(log.new_value) : '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2 flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-400" />
          Audit Log
        </h1>
        <p className="text-gray-500">Track all changes made to your school data. Records are append-only and cannot be deleted.</p>
      </div>

      {/* Filters */}
      <Card className="mb-6 bg-surface border-border-subtle">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filters
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleExport} className="h-7 text-xs">
              <Download className="w-3 h-3 mr-1" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label className="text-xs mb-1 block">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Action</Label>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Entity</Label>
              <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">User</Label>
              <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card className="bg-surface border-border-subtle">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={Clock} title="No Audit Logs" description="No records match your current filters." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-white/[0.02]">
                    <th className="text-left py-3 px-4 text-foreground/50 font-medium w-8" />
                    <th className="text-left py-3 px-4 text-foreground/50 font-medium">Timestamp</th>
                    <th className="text-left py-3 px-4 text-foreground/50 font-medium">Action</th>
                    <th className="text-left py-3 px-4 text-foreground/50 font-medium">Entity Type</th>
                    <th className="text-left py-3 px-4 text-foreground/50 font-medium">Entity ID</th>
                    <th className="text-left py-3 px-4 text-foreground/50 font-medium">Changed By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const isExpanded = expandedRows.has(log.id);
                    const actionCategory = getActionCategory(log.action);
                    const colorClass = ACTION_COLORS[actionCategory] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
                    const hasChanges = log.old_value || log.new_value;

                    return (
                      <>
                        <tr
                          key={log.id}
                          className={cn(
                            'border-b border-border-subtle/50 hover:bg-white/[0.02] cursor-pointer',
                            isExpanded && 'bg-white/[0.03]'
                          )}
                          onClick={() => hasChanges && toggleRow(log.id)}
                        >
                          <td className="py-3 px-4">
                            {hasChanges && (
                              isExpanded
                                ? <ChevronDown className="w-4 h-4 text-foreground/40" />
                                : <ChevronRight className="w-4 h-4 text-foreground/40" />
                            )}
                          </td>
                          <td className="py-3 px-4 text-foreground/70 whitespace-nowrap">{formatDate(log.created_at)}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={cn('text-xs', colorClass)}>
                              {log.action}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-foreground/60">{log.entity_type || '—'}</td>
                          <td className="py-3 px-4 text-foreground/40 font-mono text-xs">{log.entity_id ? log.entity_id.slice(0, 8) + '...' : '—'}</td>
                          <td className="py-3 px-4 text-foreground/60">{log.user?.full_name || 'System'}</td>
                        </tr>
                        {isExpanded && hasChanges && (
                          <tr key={`${log.id}-detail`}>
                            <td colSpan={6} className="px-4 py-4 bg-white/[0.01]">
                              <DiffView oldVal={log.old_value} newVal={log.new_value} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-foreground/50">
          Page {page + 1} — Showing {filteredLogs.length} records
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={filteredLogs.length < pageSize}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

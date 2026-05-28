'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatUGX } from '@/lib/utils/currency';
import { formatDate } from '@/lib/utils/dates';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, FileText, MessageSquare, Plus, Download, User } from 'lucide-react';

interface DisciplineRecord {
  id: string;
  incident_date: string;
  incident_type: string;
  description: string;
  action_taken: string | null;
  parent_notified: boolean;
  parent_notified_at: string | null;
  recorded_by: { full_name: string } | null;
}

const formSchema = z.object({
  incident_date: z.string().min(1, 'Incident date is required'),
  incident_type: z.enum([
    'verbal_warning',
    'written_warning',
    'detention',
    'suspension',
    'parent_called',
    'referred_to_head',
    'other',
  ]),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  action_taken: z.string().optional(),
  parent_notified: z.boolean().default(false),
});

type FormData = z.infer<typeof formSchema>;

interface DisciplineTabProps {
  studentId: string;
  schoolId: string;
}

export function DisciplineTab({ studentId, schoolId }: DisciplineTabProps) {
  const [records, setRecords] = useState<DisciplineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      incident_date: new Date().toISOString().split('T')[0],
      incident_type: 'verbal_warning',
      description: '',
      action_taken: '',
      parent_notified: false,
    },
  });

  useEffect(() => {
    fetchRecords();
  }, [studentId]);

  async function fetchRecords() {
    try {
      setLoading(true);
      const response = await fetch(`/api/discipline?student_id=${studentId}`);
      if (!response.ok) throw new Error('Failed to fetch records');
      const data = await response.json();
      setRecords(data.records || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load discipline records',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit( FormData) {
    try {
      const response = await fetch('/api/discipline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          student_id: studentId,
          school_id: schoolId,
        }),
      });

      if (!response.ok) throw new Error('Failed to create record');

      toast({
        title: 'Success',
        description: 'Discipline record created successfully',
      });

      setDialogOpen(false);
      form.reset();
      fetchRecords();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create discipline record',
        variant: 'destructive',
      });
    }
  }

  async function handleNotifyParent(recordId: string) {
    try {
      setNotifyingId(recordId);
      const response = await fetch('/api/discipline/notify-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          record_id: recordId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to notify parent');
      }

      toast({
        title: 'Success',
        description: 'Parent notified successfully',
      });

      fetchRecords();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to notify parent',
        variant: 'destructive',
      });
    } finally {
      setNotifyingId(null);
    }
  }

  async function handlePrintSummary() {
    try {
      setGeneratingPdf(true);
      const response = await fetch('/api/reports/discipline-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `discipline-summary-${studentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Success',
        description: 'PDF downloaded successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate PDF',
        variant: 'destructive',
      });
    } finally {
      setGeneratingPdf(false);
    }
  }

  function getIncidentTypeLabel(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  function getIncidentTypeBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (type) {
      case 'verbal_warning':
        return 'outline';
      case 'written_warning':
        return 'secondary';
      case 'detention':
        return 'default';
      case 'suspension':
        return 'destructive';
      default:
        return 'outline';
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-semibold">Discipline Records</h3>
          {records.length > 0 && (
            <Badge variant="outline" className="ml-2">
              {records.length} incident{records.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintSummary}
            disabled={generatingPdf || records.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Print Summary
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Record
          </Button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h4 className="text-lg font-semibold mb-2">No discipline records</h4>
          <p className="text-muted-foreground mb-4">
            This student has no recorded disciplinary incidents.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Record
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Action Taken</TableHead>
              <TableHead>Recorded By</TableHead>
              <TableHead>Parent Notified</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map(record => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">
                  {formatDate(record.incident_date)}
                </TableCell>
                <TableCell>
                  <Badge variant={getIncidentTypeBadgeVariant(record.incident_type)}>
                    {getIncidentTypeLabel(record.incident_type)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {record.description}
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {record.action_taken || '—'}
                </TableCell>
                <TableCell>
                  {record.recorded_by ? (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{record.recorded_by.full_name}</span>
                    </div>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  {record.parent_notified ? (
                    <Badge className="bg-emerald/10 text-emerald">
                      Yes {record.parent_notified_at && `(${formatDate(record.parent_notified_at)})`}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      Not Notified
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!record.parent_notified && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNotifyParent(record.id)}
                      disabled={notifyingId === record.id}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {notifyingId === record.id ? 'Sending...' : 'Notify Parent'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Discipline Record</DialogTitle>
            <DialogDescription>
              Record a disciplinary incident for this student.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="incident_date" className="text-sm font-medium">
                    Incident Date
                  </label>
                  <Input
                    id="incident_date"
                    type="date"
                    {...form.register('incident_date')}
                  />
                  {form.formState.errors.incident_date && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.incident_date.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label htmlFor="incident_type" className="text-sm font-medium">
                    Incident Type
                  </label>
                  <Select
                    onValueChange={(value) => form.setValue('incident_type', value as any)}
                    defaultValue={form.getValues('incident_type')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verbal_warning">Verbal Warning</SelectItem>
                      <SelectItem value="written_warning">Written Warning</SelectItem>
                      <SelectItem value="detention">Detention</SelectItem>
                      <SelectItem value="suspension">Suspension</SelectItem>
                      <SelectItem value="parent_called">Parent Called</SelectItem>
                      <SelectItem value="referred_to_head">Referred to Head</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.formState.errors.incident_type && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.incident_type.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="description"
                  {...form.register('description')}
                  placeholder="Describe the incident in detail..."
                  rows={4}
                />
                {form.formState.errors.description && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="action_taken" className="text-sm font-medium">
                  Action Taken
                </label>
                <Textarea
                  id="action_taken"
                  {...form.register('action_taken')}
                  placeholder="What action was taken?"
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="parent_notified"
                  {...form.register('parent_notified')}
                  className="h-4 w-4"
                />
                <label htmlFor="parent_notified" className="text-sm font-medium">
                  Parent already notified
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating...' : 'Create Record'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

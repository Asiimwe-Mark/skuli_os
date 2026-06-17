'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseBrowser } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { slotFormSchema, periodFormSchema } from '@/lib/utils/timetable-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Download, Printer, Loader2 } from 'lucide-react';
import type { Database } from '@/types/database';

type TimetablePeriod = Database['public']['Tables']['timetable_periods']['Row'];
type TimetableSlot = Database['public']['Tables']['timetable_slots']['Row'] & {
  subject?: { id: string; name: string | null; color?: string | null } | null;
  teacher?: { id: string; full_name: string | null } | null;
};
type Class = Database['public']['Tables']['classes']['Row'];
type Subject = Database['public']['Tables']['subjects']['Row'] & { color?: string | null };
type User = Database['public']['Tables']['users']['Row'];
type AcademicYear = Database['public']['Tables']['academic_years']['Row'];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_MAP: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };

export default function TimetablePage() {
  const supabase = useSupabaseBrowser();
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Audit 5.12: 5 useState fetches collapsed into 5 useQuery keys
  // that share React Query's cache with the rest of the dashboard
  // (matches the calendar refactor in 5.11).
  const classesQuery = useQuery({
    queryKey: ['classes', school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', school!.id)
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Class[];
    },
    enabled: !!school?.id,
  });

  const academicYearQuery = useQuery({
    queryKey: ['academic-years-current', school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .eq('school_id', school!.id)
        .eq('is_current', true)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data as AcademicYear | null;
    },
    enabled: !!school?.id,
  });

  const periodsQuery = useQuery({
    queryKey: ['timetable-periods', school?.id],
    queryFn: async () => {
      const res = await fetch('/api/timetable/periods');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load periods");
      return (json.data ?? []) as TimetablePeriod[];
    },
    enabled: !!school?.id,
  });

  const subjectsQuery = useQuery({
    queryKey: ['subjects', school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('school_id', school!.id)
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
    enabled: !!school?.id,
  });

  const teachersQuery = useQuery({
    queryKey: ['teachers', school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, role, is_active, is_deleted')
        .eq('school_id', school!.id)
        .eq('role', 'TEACHER')
        .eq('is_active', true)
        .eq('is_deleted', false);
      if (error) throw error;
      return (data ?? []) as User[];
    },
    enabled: !!school?.id,
  });

  const classes = classesQuery.data ?? [];
  const academicYear = academicYearQuery.data ?? null;
  const periods = periodsQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];
  const teachers = teachersQuery.data ?? [];

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [editingSlot, setEditingSlot] = useState<{ day: number; periodId: string } | null>(null);
  const [isAddPeriodOpen, setIsAddPeriodOpen] = useState(false);
  const [isEditSlotOpen, setIsEditSlotOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ name: '', startTime: '08:00', endTime: '08:40', isBreak: false });
  const [slotForm, setSlotForm] = useState({ subjectId: '', teacherId: '', room: '' });

  // Initialise dropdowns once the lists arrive.
  useEffect(() => {
    if (classes.length && !selectedClassId) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (academicYear && !selectedAcademicYearId) setSelectedAcademicYearId(academicYear.id);
  }, [academicYear, selectedAcademicYearId]);

  const slotsQueryKey = useMemo(
    () => ['timetable-slots', selectedClassId, selectedAcademicYearId] as const,
    [selectedClassId, selectedAcademicYearId]
  );

  const slotsQuery = useQuery({
    queryKey: slotsQueryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/timetable/slots?class_id=${selectedClassId}&academic_year_id=${selectedAcademicYearId}`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load slots");
      return (json.data ?? []) as TimetableSlot[];
    },
    enabled: !!selectedClassId && !!selectedAcademicYearId,
  });

  const slots = slotsQuery.data ?? [];
  const loading =
    classesQuery.isLoading ||
    academicYearQuery.isLoading ||
    periodsQuery.isLoading ||
    subjectsQuery.isLoading ||
    teachersQuery.isLoading;

  async function handleAddPeriod() {
    const parsed = periodFormSchema.safeParse(newPeriod);
    if (!parsed.success) {
      toast({
        title: 'Validation',
        description: parsed.error.issues[0].message,
        variant: 'destructive',
      });
      return;
    }
    try {
      const sortOrder = periods.length + 1;
      const res = await fetch('/api/timetable/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: parsed.data.name,
          start_time: parsed.data.startTime,
          end_time: parsed.data.endTime,
          is_break: parsed.data.isBreak,
          sort_order: sortOrder,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      toast({ title: 'Success', description: 'Period added successfully' });
      setIsAddPeriodOpen(false);
      setNewPeriod({ name: '', startTime: '08:00', endTime: '08:40', isBreak: false });
      queryClient.invalidateQueries({ queryKey: ['timetable-periods', school?.id] });
    } catch (error) {
      console.error('Error adding period:', error);
      toast({ title: 'Error', description: 'Failed to add period', variant: 'destructive' });
    }
  }

  function handleCellClick(day: number, periodId: string) {
    const existingSlot = slots.find(s => s.period_id === periodId && s.day_of_week === day);

    if (existingSlot) {
      setSlotForm({
        subjectId: existingSlot.subject_id || '',
        teacherId: existingSlot.teacher_id || '',
        room: existingSlot.room || '',
      });
    } else {
      setSlotForm({ subjectId: '', teacherId: '', room: '' });
    }

    setEditingSlot({ day, periodId });
    setIsEditSlotOpen(true);
  }

  async function handleSaveSlot() {
    if (!editingSlot || !selectedClassId || !selectedAcademicYearId) return;

    const parsed = slotFormSchema.safeParse(slotForm);
    if (!parsed.success) {
      toast({
        title: 'Validation',
        description: parsed.error.issues[0].message,
        variant: 'destructive',
      });
      return;
    }

    try {
      const res = await fetch('/api/timetable/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selectedClassId,
          period_id: editingSlot.periodId,
          day_of_week: editingSlot.day,
          subject_id: parsed.data.subjectId || null,
          teacher_id: parsed.data.teacherId || null,
          room: parsed.data.room || null,
          academic_year_id: selectedAcademicYearId,
        }),
      });

      if (res.status === 409) {
        const { error } = await res.json();
        toast({ title: 'Teacher Conflict', description: error, variant: 'destructive' });
        return;
      }

      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      toast({ title: 'Success', description: 'Slot saved successfully' });
      setIsEditSlotOpen(false);
      setEditingSlot(null);
      queryClient.invalidateQueries({ queryKey: slotsQueryKey });
    } catch (error) {
      console.error('Error saving slot:', error);
      toast({ title: 'Error', description: 'Failed to save slot', variant: 'destructive' });
    }
  }

  async function handleDeleteSlot() {
    if (!editingSlot) return;

    try {
      const existingSlot = slots.find(
        s => s.period_id === editingSlot.periodId && s.day_of_week === editingSlot.day
      );

      if (existingSlot) {
        const res = await fetch(`/api/timetable/slots?id=${existingSlot.id}`, { method: 'DELETE' });
        const result = await res.json();
        if (!result.success) throw new Error(result.error);
        toast({ title: 'Success', description: 'Slot deleted successfully' });
      }

      setIsEditSlotOpen(false);
      setEditingSlot(null);
      queryClient.invalidateQueries({ queryKey: slotsQueryKey });
    } catch (error) {
      console.error('Error deleting slot:', error);
      toast({ title: 'Error', description: 'Failed to delete slot', variant: 'destructive' });
    }
  }

  async function handleExportPDF() {
    if (!selectedClassId || !selectedAcademicYearId) {
      toast({ title: 'Error', description: 'Please select a class', variant: 'destructive' });
      return;
    }

    const windowObj = window.open('', '_blank');
    if (!windowObj) {
      toast({ title: 'Error', description: 'Please allow popups for PDF export', variant: 'destructive' });
      return;
    }

    try {
      const response = await fetch(`/api/pdf/timetable?classId=${selectedClassId}&academicYearId=${selectedAcademicYearId}`);
      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      windowObj.location.href = url;
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({ title: 'Error', description: 'Failed to export PDF', variant: 'destructive' });
      windowObj.close();
    }
  }

  function getSlotForCell(day: number, periodId: string) {
    return slots.find(s => s.period_id === periodId && s.day_of_week === day);
  }

  function getSubjectColor(subjectId: string | null) {
    if (!subjectId) return 'bg-bg-tertiary';
    const subject = subjects.find(s => s.id === subjectId);
    return subject?.color || 'bg-bg-tertiary';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Timetable Builder</h1>
          <p className="text-muted">Manage class schedules and period assignments</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label>Class</Label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(cls => (
                    <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label>Academic Year</Label>
              <Select value={selectedAcademicYearId} onValueChange={setSelectedAcademicYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYear && (
                    <SelectItem key={academicYear.id} value={academicYear.id}>{academicYear.name}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:ml-auto">
              <Label> </Label>
              <Dialog open={isAddPeriodOpen} onOpenChange={setIsAddPeriodOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Period
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Period</DialogTitle>
                    <DialogDescription>Define a new period with timing details</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="periodName">Period Name</Label>
                      <Input
                        id="periodName"
                        value={newPeriod.name}
                        onChange={(e) => setNewPeriod(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Period 1"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="startTime">Start Time</Label>
                        <Input
                          id="startTime"
                          type="time"
                          value={newPeriod.startTime}
                          onChange={(e) => setNewPeriod(prev => ({ ...prev, startTime: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="endTime">End Time</Label>
                        <Input
                          id="endTime"
                          type="time"
                          value={newPeriod.endTime}
                          onChange={(e) => setNewPeriod(prev => ({ ...prev, endTime: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isBreak"
                        checked={newPeriod.isBreak}
                        onCheckedChange={(checked) => setNewPeriod(prev => ({ ...prev, isBreak: checked }))}
                      />
                      <Label htmlFor="isBreak">This is a break period</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddPeriodOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddPeriod}>Add Period</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timetable Grid */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-bg-tertiary">
                  <th className="border p-2 text-left min-w-[100px]">Period</th>
                  {DAYS.map(day => (
                    <th key={day} className="border p-2 text-center min-w-[150px]">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map(period => (
                  <tr key={period.id}>
                    <td className="border p-3 font-medium bg-bg-tertiary">
                      <div>{period.name}</div>
                      <div className="text-xs text-muted">
                        {period.start_time} - {period.end_time}
                      </div>
                    </td>
                    {DAYS.map((_, index) => {
                      const dayNum = index + 1;
                      const slot = getSlotForCell(dayNum, period.id);
                      const isBreak = period.is_break;

                      if (isBreak) {
                        return (
                          <td
                            key={`${period.id}-${dayNum}`}
                            className="border p-2 text-center bg-bg-tertiary"
                            colSpan={1}
                          >
                            <Badge variant="outline" className="text-muted">
                              Break
                            </Badge>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={`${period.id}-${dayNum}`}
                          className="border p-1 h-24 cursor-pointer hover:bg-card-hover transition-colors relative"
                          onClick={() => handleCellClick(dayNum, period.id)}
                        >
                          {slot ? (
                            <div className={`h-full p-2 rounded ${getSubjectColor(slot.subject_id)}`}>
                              <div className="font-medium text-sm truncate">
                                {slot.subject?.name || 'No Subject'}
                              </div>
                              {slot.teacher && (
                                <div className="text-xs text-muted truncate">
                                  {slot.teacher.full_name}
                                </div>
                              )}
                              {slot.room && (
                                <div className="text-xs text-muted mt-1">
                                  Room: {slot.room}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-muted text-sm">
                              Click to assign
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Slot Dialog */}
      <Dialog open={isEditSlotOpen} onOpenChange={setIsEditSlotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {slots.find(s => s.period_id === editingSlot?.periodId && s.day_of_week === editingSlot?.day)
                ? 'Edit Slot'
                : 'Assign Slot'}
            </DialogTitle>
            <DialogDescription>
              {DAY_MAP[editingSlot?.day || 0]} - {periods.find(p => p.id === editingSlot?.periodId)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Select value={slotForm.subjectId} onValueChange={(val) => setSlotForm(prev => ({ ...prev, subjectId: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map(subject => (
                    <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="teacher">Teacher</Label>
              <Select value={slotForm.teacherId} onValueChange={(val) => setSlotForm(prev => ({ ...prev, teacherId: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map(teacher => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="room">Room (optional)</Label>
              <Input
                id="room"
                value={slotForm.room}
                onChange={(e) => setSlotForm(prev => ({ ...prev, room: e.target.value }))}
                placeholder="e.g., Room 101"
                maxLength={50}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {slots.find(s => s.period_id === editingSlot?.periodId && s.day_of_week === editingSlot?.day) && (
              <Button variant="destructive" onClick={handleDeleteSlot}>
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsEditSlotOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSlot}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

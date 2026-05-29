'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Download, Printer, AlertTriangle, X, Loader2 } from 'lucide-react';
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
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [editingSlot, setEditingSlot] = useState<{ day: number; periodId: string } | null>(null);
  const [isAddPeriodOpen, setIsAddPeriodOpen] = useState(false);
  const [isEditSlotOpen, setIsEditSlotOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ name: '', startTime: '08:00', endTime: '08:40', isBreak: false });
  const [slotForm, setSlotForm] = useState({ subjectId: '', teacherId: '', room: '' });
  const [teacherConflicts, setTeacherConflicts] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const [classesRes, yearsRes, periodsRes, subjectsRes, teachersRes] = await Promise.all([
        supabase.from('classes').select('*').eq('is_deleted', false).order('name'),
        supabase.from('academic_years').select('*').eq('is_current', true).single(),
        supabase.from('timetable_periods').select('*').eq('is_deleted', false).order('sort_order'),
        supabase.from('subjects').select('*').eq('is_deleted', false).order('name'),
        supabase.from('users').select('*').eq('role', 'TEACHER').eq('is_deleted', false),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (yearsRes.error && yearsRes.status !== 406) throw yearsRes.error;
      if (periodsRes.error) throw periodsRes.error;
      if (subjectsRes.error) throw subjectsRes.error;
      if (teachersRes.error) throw teachersRes.error;

      setClasses(classesRes.data || []);
      if (yearsRes.data) setAcademicYears([yearsRes.data]);
      setPeriods(periodsRes.data || []);
      setSubjects(subjectsRes.data || []);
      setTeachers(teachersRes.data || []);

      if (classesRes.data?.length) setSelectedClassId(classesRes.data[0].id);
      if (yearsRes.data) setSelectedAcademicYearId(yearsRes.data.id);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load timetable data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedClassId && selectedAcademicYearId) {
      fetchSlots();
    }
  }, [selectedClassId, selectedAcademicYearId]);

  async function fetchSlots() {
    const { data, error } = await supabase
      .from('timetable_slots')
      .select(`
        *,
        subject:subjects(id, name, color),
        teacher:users(id, full_name)
      `)
      .eq('class_id', selectedClassId)
      .eq('academic_year_id', selectedAcademicYearId)
      .eq('is_deleted', false);

    if (error) {
      toast({ title: 'Error', description: 'Failed to load slots', variant: 'destructive' });
      return;
    }

    setSlots(data || []);
    checkConflicts(data || []);
  }

  async function checkConflicts(currentSlots: TimetableSlot[]) {
    const conflicts = new Set<string>();

    for (const slot of currentSlots) {
      if (!slot.teacher_id) continue;

      const { data: otherSlots } = await supabase
        .from('timetable_slots')
        .select('id, class_id')
        .eq('teacher_id', slot.teacher_id)
        .eq('period_id', slot.period_id)
        .eq('day_of_week', slot.day_of_week)
        .eq('academic_year_id', selectedAcademicYearId)
        .eq('is_deleted', false)
        .neq('id', slot.id);

      if (otherSlots && otherSlots.length > 0) {
        conflicts.add(`${slot.period_id}-${slot.day_of_week}`);
      }
    }

    setTeacherConflicts(conflicts);
  }

  async function handleAddPeriod() {
    try {
      const sortOrder = periods.length + 1;
      const { error } = await supabase.from('timetable_periods').insert({
        school_id: (await supabase.auth.getSession()).data.session?.user.user_metadata?.school_id,
        name: newPeriod.name,
        start_time: newPeriod.startTime,
        end_time: newPeriod.endTime,
        is_break: newPeriod.isBreak,
        sort_order: sortOrder,
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Period added successfully' });
      setIsAddPeriodOpen(false);
      setNewPeriod({ name: '', startTime: '08:00', endTime: '08:40', isBreak: false });
      fetchData();
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

    try {
      const existingSlot = slots.find(
        s => s.period_id === editingSlot.periodId && s.day_of_week === editingSlot.day
      );

      if (existingSlot) {
        const { error } = await supabase
          .from('timetable_slots')
          .update({
            subject_id: slotForm.subjectId || null,
            teacher_id: slotForm.teacherId || null,
            room: slotForm.room || null,
          })
          .eq('id', existingSlot.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Slot updated successfully' });
      } else {
        const { error } = await supabase.from('timetable_slots').insert({
          school_id: (await supabase.auth.getSession()).data.session?.user.user_metadata?.school_id,
          class_id: selectedClassId,
          period_id: editingSlot.periodId,
          day_of_week: editingSlot.day,
          subject_id: slotForm.subjectId || null,
          teacher_id: slotForm.teacherId || null,
          room: slotForm.room || null,
          academic_year_id: selectedAcademicYearId,
        });

        if (error) throw error;
        toast({ title: 'Success', description: 'Slot created successfully' });
      }

      setIsEditSlotOpen(false);
      setEditingSlot(null);
      fetchSlots();
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
        const { error } = await supabase
          .from('timetable_slots')
          .update({ is_deleted: true })
          .eq('id', existingSlot.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Slot deleted successfully' });
      }

      setIsEditSlotOpen(false);
      setEditingSlot(null);
      fetchSlots();
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
    if (!subjectId) return 'bg-gray-100';
    const subject = subjects.find(s => s.id === subjectId);
    return subject?.color || 'bg-blue-100';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const selectedClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Timetable Builder</h1>
          <p className="text-muted-foreground">Manage class schedules and period assignments</p>
        </div>
        <div className="flex gap-2">
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
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[200px]">
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
            <div className="min-w-[200px]">
              <Label>Academic Year</Label>
              <Select value={selectedAcademicYearId} onValueChange={setSelectedAcademicYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map(year => (
                    <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto">
              <Label>&nbsp;</Label>
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
                    <div className="grid grid-cols-2 gap-4">
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
                <tr className="bg-muted">
                  <th className="border p-2 text-left min-w-[100px]">Period</th>
                  {DAYS.map(day => (
                    <th key={day} className="border p-2 text-center min-w-[150px]">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map(period => (
                  <tr key={period.id}>
                    <td className="border p-3 font-medium bg-muted/50">
                      <div>{period.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {period.start_time} - {period.end_time}
                      </div>
                    </td>
                    {DAYS.map((_, index) => {
                      const dayNum = index + 1;
                      const slot = getSlotForCell(dayNum, period.id);
                      const conflictKey = `${period.id}-${dayNum}`;
                      const hasConflict = teacherConflicts.has(conflictKey);
                      const isBreak = period.is_break;

                      if (isBreak) {
                        return (
                          <td
                            key={`${period.id}-${dayNum}`}
                            className="border p-2 text-center bg-muted/30"
                            colSpan={1}
                          >
                            <Badge variant="outline" className="text-muted-foreground">
                              Break
                            </Badge>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={`${period.id}-${dayNum}`}
                          className="border p-1 h-24 cursor-pointer hover:bg-muted/50 transition-colors relative"
                          onClick={() => handleCellClick(dayNum, period.id)}
                        >
                          {slot ? (
                            <div className={`h-full p-2 rounded ${getSubjectColor(slot.subject_id)} relative`}>
                              {hasConflict && (
                                <AlertTriangle className="absolute top-1 right-1 h-4 w-4 text-red-500" />
                              )}
                              <div className="font-medium text-sm truncate">
                                {slot.subject?.name || 'No Subject'}
                              </div>
                              {slot.teacher && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {slot.teacher.full_name}
                                </div>
                              )}
                              {slot.room && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Room: {slot.room}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
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

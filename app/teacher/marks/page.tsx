'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { cn } from '@/lib/utils/cn';
import { getGrade, getGradeBgColor } from '@/lib/utils/grades';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/components/ui/use-toast';
import { Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

interface MarkEntry {
  student_id: string;
  student_name: string;
  admission_number: string;
  score: string;
  remarks: string;
  existing_id?: string;
}

interface Assignment {
  class_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  class: { name: string; stream: string | null } | null;
  subject: { name: string } | null;
}

export default function TeacherMarksPage() {
  const { school, currentTerm } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createBrowserClient();
  const searchParams = useSearchParams();

  const [selectedClass, setSelectedClass] = useState(searchParams.get('classId') || '');
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get('subjectId') || '');
  const [marks, setMarks] = useState<MarkEntry[]>([]);
  const [savingMarks, setSavingMarks] = useState<Set<string>>(new Set());
  const [savedMarks, setSavedMarks] = useState<Set<string>>(new Set());
  const [errorMarks, setErrorMarks] = useState<Set<string>>(new Set());

  const scoreRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Fetch teacher's assignments
  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ['teacher-assignments', school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('teacher_class_assignments')
        .select(`
          class_id,
          subject_id,
          is_class_teacher,
          class:classes(id, name, stream),
          subject:subjects(id, name)
        `)
        .eq('teacher_id', user.id)
        .eq('is_deleted', false);

      if (error) throw error;
      return data || [];
    },
  });

  // Auto-select first assignment if none selected
  useEffect(() => {
    if (assignments.length > 0 && !selectedClass) {
      const first = assignments[0];
      setSelectedClass(first.class_id);
      if (first.subject_id) setSelectedSubject(first.subject_id);
    }
  }, [assignments, selectedClass]);

  // Get students for selected class
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ['class-students', selectedClass, currentTerm?.id],
    enabled: !!selectedClass && !!currentTerm?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_enrollments')
        .select('student_id, students(id, full_name, admission_number)')
        .eq('class_id', selectedClass)
        .eq('term_id', currentTerm!.id);

      if (error) throw error;
      return data || [];
    },
  });

  // Get existing marks
  const { data: existingMarks = [] } = useQuery({
    queryKey: ['teacher-marks', selectedClass, selectedSubject, currentTerm?.id],
    enabled: !!selectedClass && !!selectedSubject && !!currentTerm?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marks')
        .select('id, student_id, score, remarks')
        .eq('class_id', selectedClass)
        .eq('subject_id', selectedSubject)
        .eq('term_id', currentTerm!.id)
        .eq('exam_type', 'eot');

      if (error) throw error;
      return data || [];
    },
  });

  // Sync marks state when data loads
  useEffect(() => {
    if (!students.length) return;
    const marksMap = new Map(existingMarks.map((m: any) => [m.student_id, m as any]));
    setMarks(
      students.map((e: any) => {
        const existing = marksMap.get(e.student_id) as any;
        return {
          student_id: e.student_id,
          student_name: e.students?.full_name || 'Unknown',
          admission_number: e.students?.admission_number || '',
          score: existing?.score?.toString() || '',
          remarks: existing?.remarks || '',
          existing_id: existing?.id,
        };
      })
    );
  }, [students, existingMarks]);

  // Auto-save mark mutation
  const autoSaveMark = useCallback(
    async (mark: MarkEntry) => {
      if (!currentTerm?.id || !school?.id || !selectedSubject) return;

      const score = parseFloat(mark.score);
      if (isNaN(score) || score < 0 || score > 100) return;

      const markKey = mark.student_id;
      setSavingMarks((prev) => new Set(prev).add(markKey));
      setErrorMarks((prev) => {
        const next = new Set(prev);
        next.delete(markKey);
        return next;
      });

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const markData = {
          school_id: school.id,
          student_id: mark.student_id,
          subject_id: selectedSubject,
          class_id: selectedClass,
          term_id: currentTerm.id,
          academic_year_id: currentTerm.academic_year_id,
          exam_type: 'eot',
          score,
          max_score: 100,
          remarks: mark.remarks || null,
          entered_by: user?.id,
          review_status: 'draft',
        };

        if (mark.existing_id) {
          await supabase.from('marks').update(markData).eq('id', mark.existing_id);
        } else {
          const { data } = await supabase
            .from('marks')
            .insert(markData)
            .select('id')
            .single();
          if (data) {
            setMarks((prev) =>
              prev.map((m: MarkEntry) =>
                m.student_id === mark.student_id ? { ...m, existing_id: data.id } : m
              )
            );
          }
        }

        setSavedMarks((prev) => new Set(prev).add(markKey));
        setTimeout(() => {
          setSavedMarks((prev) => {
            const next = new Set(prev);
            next.delete(markKey);
            return next;
          });
        }, 1500);
      } catch {
        setErrorMarks((prev) => new Set(prev).add(markKey));
        toast({
          title: `Failed to save ${mark.student_name}`,
          variant: 'destructive',
        });
      } finally {
        setSavingMarks((prev) => {
          const next = new Set(prev);
          next.delete(markKey);
          return next;
        });
      }
    },
    [currentTerm, school, selectedSubject, selectedClass, supabase, toast]
  );

  const handleScoreChange = (index: number, value: string) => {
    setMarks((prev) =>
      prev.map((m, i) => (i === index ? { ...m, score: value } : m))
    );
  };

  const handleScoreBlur = async (index: number) => {
    const mark = marks[index];
    if (mark.score !== '') {
      await autoSaveMark(mark);
    }
  };

  const enteredCount = marks.filter((m) => m.score !== '').length;

  if (!assignments.length) {
    return (
      <div className="p-8">
        <EmptyState
          icon={AlertCircle}
          title="No Classes Assigned"
          description="You have not been assigned to any classes yet. Please contact your school administrator."
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Marks Entry</h1>
        <p className="text-gray-600">Enter and manage marks for your assigned classes.</p>
      </div>

      {/* Class/Subject Selector */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Class</Label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md"
              >
                {assignments.map((a) => (
                  <option key={a.class_id} value={a.class_id}>
                    {a.class?.name}
                    {a.class?.stream ? ` - ${a.class.stream}` : ''}
                    {a.is_class_teacher ? ' (Homeroom)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Subject</Label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md"
                disabled={!selectedClass}
              >
                {assignments
                  .filter((a) => a.class_id === selectedClass && a.subject_id)
                  .map((a) => (
                    <option key={a.subject_id!} value={a.subject_id!}>
                      {a.subject?.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Marks Table */}
      {studentsLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : marks.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No Students Found"
          description="There are no students enrolled in this class for the current term."
        />
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-600">
              Entered: <span className="font-semibold">{enteredCount}</span> /{' '}
              {marks.length} students
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Student Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Admission No.
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Score (0-100)
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Grade
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {marks.map((mark, index) => {
                  const score = parseFloat(mark.score) || 0;
                  const grade = getGrade(score);
                  const gradeBg = getGradeBgColor(grade);
                  const isSaving = savingMarks.has(mark.student_id);
                  const isSaved = savedMarks.has(mark.student_id);
                  const isError = errorMarks.has(mark.student_id);

                  return (
                    <tr key={mark.student_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{mark.student_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{mark.admission_number}</td>
                      <td className="px-4 py-3">
                        <Input
                          ref={(el: HTMLInputElement | null) => { scoreRefs.current[index] = el; }}
                          type="number"
                          min="0"
                          max="100"
                          value={mark.score}
                          onChange={(e) => handleScoreChange(index, e.target.value)}
                          onBlur={() => handleScoreBlur(index)}
                          className={cn(
                            'w-24',
                            isError && 'border-rose focus-visible:ring-rose'
                          )}
                          disabled={isSaving}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {mark.score !== '' && (
                          <Badge className={cn('text-white', gradeBg)}>
                            {grade}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isSaving && (
                          <Loader2 className="w-4 h-4 animate-spin text-amber" />
                        )}
                        {isSaved && !isSaving && (
                          <CheckCircle2 className="w-4 h-4 text-emerald" />
                        )}
                        {isError && (
                          <AlertCircle className="w-4 h-4 text-rose" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

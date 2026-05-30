import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Users, BookOpen, CheckCircle, TrendingUp } from 'lucide-react';

interface Assignment {
  class_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  class: { name: string; stream: string | null } | null;
  subject: { name: string } | null;
}

export default async function TeacherDashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch teacher's assignments
  const { data: assignments } = await supabase
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

  if (!assignments || assignments.length === 0) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>No Classes Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You have not been assigned to any classes yet. Please contact your school administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get unique classes
  const uniqueClasses = Array.from(
    new Map(assignments.map((a: any) => [a.class_id, a])).values()
  );

  // Fetch student counts and recent activity for each class
  const classStats = await Promise.all(
    uniqueClasses.map(async (assignment: any) => {
      const { count: studentCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('current_class_id', assignment.class_id)
        .eq('is_deleted', false);

      // Get marks completion for this class
      const { data: marksData } = await supabase
        .from('marks')
        .select('student_id, subject_id')
        .eq('current_class_id', assignment.class_id)
        .eq('is_deleted', false);

      // Get today's attendance
      const today = new Date().toISOString().split('T')[0];
      const { count: attendanceCount } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('current_class_id', assignment.class_id)
        .eq('date', today)
        .eq('is_deleted', false);

      return {
        assignment,
        studentCount: studentCount || 0,
        marksCount: marksData?.length || 0,
        attendanceCount: attendanceCount || 0,
      };
    })
  );

  // Get recent marks submissions
  const { data: recentMarks } = await supabase
    .from('marks')
    .select(`
      id,
      score,
      exam_type,
      created_at,
      student:students(full_name),
      subject:subjects(name),
      class:classes(name)
    `)
    .eq('class_id', assignments[0].class_id)
    .order('created_at', { ascending: false })
    .limit(5);

  // Get recent attendance sessions
  const { data: recentAttendance } = await supabase
    .from('attendance_records')
    .select(`
      id,
      date,
      status,
      student:students(full_name),
      class:classes(name)
    `)
    .eq('class_id', assignments[0].class_id)
    .order('date', { ascending: false })
    .limit(5);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Teacher Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here&apos;s an overview of your classes.</p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
            <BookOpen className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueClasses.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {classStats.reduce((sum, stat) => sum + stat.studentCount, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Marks Entries</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {classStats.reduce((sum, stat) => sum + stat.marksCount, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attendance Today</CardTitle>
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {classStats.reduce((sum, stat) => sum + stat.attendanceCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* My Classes */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">My Classes</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classStats.map(({ assignment, studentCount, marksCount, attendanceCount }: any) => (
            <Card key={assignment.class_id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>
                    {assignment.class?.name}
                    {assignment.class?.stream ? ` - ${assignment.class.stream}` : ''}
                  </span>
                  {assignment.is_class_teacher && (
                    <span className="text-xs bg-amber/10 text-amber px-2 py-1 rounded-full">
                      Homeroom
                    </span>
                  )}
                </CardTitle>
                {assignment.subject && (
                  <p className="text-sm text-muted-foreground">{assignment.subject.name}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Students:</span>
                    <span className="font-medium">{studentCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Marks entries:</span>
                    <span className="font-medium">{marksCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Attendance today:</span>
                    <span className="font-medium">{attendanceCount}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/teacher/marks?classId=${assignment.class_id}&subjectId=${assignment.subject_id || ''}`}>
                      Enter Marks
                    </Link>
                  </Button>
                  {assignment.is_class_teacher && (
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link href={`/teacher/attendance?classId=${assignment.class_id}`}>
                        Take Attendance
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Marks Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {recentMarks && recentMarks.length > 0 ? (
              <ul className="space-y-3">
                {recentMarks.map((mark: any) => (
                  <li key={mark.id} className="text-sm border-b pb-2 last:border-0">
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {mark.student?.full_name || 'Unknown'}
                      </span>
                      <span className="text-amber font-semibold">{mark.score}%</span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {mark.subject?.name} • {mark.exam_type} •{' '}
                      {new Date(mark.created_at).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No marks submitted yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAttendance && recentAttendance.length > 0 ? (
              <ul className="space-y-3">
                {recentAttendance.map((record: any) => (
                  <li key={record.id} className="text-sm border-b pb-2 last:border-0">
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {record.student?.full_name || 'Unknown'}
                      </span>
                      <span
                        className={`font-semibold ${
                          record.status === 'present'
                            ? 'text-emerald'
                            : record.status === 'absent'
                            ? 'text-rose'
                            : 'text-amber'
                        }`}
                      >
                        {record.status}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {record.class?.name} • {new Date(record.date).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No attendance records yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function TeacherNoticesPage() {
  const supabase = createServerClient();

  const {  { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch teacher profile to get school_id
  const {  userProfile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single();

  if (!userProfile) {
    redirect('/login');
  }

  // Fetch announcements for the teacher's school
  const {  announcements } = await supabase
    .from('announcements')
    .select('id, title, message_body, target_audience, created_at, created_by:users(full_name)')
    .eq('school_id', userProfile.school_id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Notices</h1>
        <p className="text-gray-600">View school-wide announcements and notices.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {announcements && announcements.length > 0 ? (
            <ul className="space-y-4">
              {announcements.map((announcement) => (
                <li
                  key={announcement.id}
                  className="border-b pb-4 last:border-0"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg">{announcement.title}</h3>
                    <Badge variant="outline">
                      {announcement.target_audience}
                    </Badge>
                  </div>
                  <p className="text-gray-700 mb-2">{announcement.message_body}</p>
                  <div className="text-xs text-gray-500 flex gap-4">
                    <span>
                      By: {announcement.created_by?.full_name || 'Unknown'}
                    </span>
                    <span>
                      {new Date(announcement.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No announcements yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

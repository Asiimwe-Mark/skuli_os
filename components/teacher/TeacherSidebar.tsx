'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  BookOpen,
  CheckSquare,
  Megaphone,
  User,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Assignment {
  class_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  class: { name: string; stream: string | null } | null;
  subject: { name: string } | null;
}

interface TeacherSidebarProps {
  teacher: {
    full_name: string;
    avatar_url: string | null;
    school_id: string | null;
  };
  assignments: Assignment[];
}

export default function TeacherSidebar({ teacher, assignments }: TeacherSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient();

  const navItems = [
    { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/teacher/marks', label: 'Marks Entry', icon: BookOpen },
    { href: '/teacher/attendance', label: 'Attendance', icon: CheckSquare },
    { href: '/teacher/notices', label: 'Notices', icon: Megaphone },
    { href: '/teacher/profile', label: 'Profile', icon: User },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const homeroomClasses = assignments.filter(a => a.is_class_teacher);
  const subjectClasses = assignments.filter(a => !a.is_class_teacher && a.subject);

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <Link href="/teacher" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-navy">
            SK<span className="text-amber">U</span>LI
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-navy text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Assigned Classes Section */}
        {assignments.length > 0 && (
          <div className="mt-6 px-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              My Classes
            </h3>
            <div className="space-y-2">
              {homeroomClasses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-400">Homeroom</span>
                  {homeroomClasses.map((a) => (
                    <div
                      key={a.class_id}
                      className="text-sm text-gray-700 px-2 py-1"
                    >
                      {a.class?.name}{a.class?.stream ? ` - ${a.class.stream}` : ''}
                    </div>
                  ))}
                </div>
              )}
              {subjectClasses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-400">Subjects</span>
                  {subjectClasses.map((a) => (
                    <div
                      key={`${a.class_id}-${a.subject_id}`}
                      className="text-sm text-gray-700 px-2 py-1"
                    >
                      {a.subject?.name} - {a.class?.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Teacher Profile Footer */}
      <div className="p-4 border-t border-gray-200">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 h-auto py-2 px-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={teacher.avatar_url || undefined} />
                <AvatarFallback>
                  {teacher.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-medium truncate">{teacher.full_name}</p>
                <p className="text-xs text-gray-500 truncate">Teacher</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push('/teacher/profile')}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="text-rose">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

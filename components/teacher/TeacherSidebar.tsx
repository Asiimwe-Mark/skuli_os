'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  CheckSquare,
  Megaphone,
  User,
  LogOut,
  ChevronDown,
  Clock,
  ClipboardList,
  UserCheck,
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
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function TeacherSidebar({ teacher, assignments, mobileOpen = false, onMobileClose }: TeacherSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      try {
        const pending = JSON.parse(localStorage.getItem('skuli-pending-attendance') || '[]');
        setPendingSyncCount(pending.length);
      } catch {
        setPendingSyncCount(0);
      }
    };

    updateCount();
    window.addEventListener('pending-attendance-changed', updateCount);
    window.addEventListener('storage', updateCount);
    return () => {
      window.removeEventListener('pending-attendance-changed', updateCount);
      window.removeEventListener('storage', updateCount);
    };
  }, []);

  const navItems = [
    { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/teacher/marks', label: 'Marks Entry', icon: BookOpen },
    { href: '/teacher/attendance', label: 'Take Attendance', icon: CheckSquare, badge: pendingSyncCount },
    { href: '/teacher/timetable', label: 'My Timetable', icon: Clock },
    { href: '/teacher/assignments', label: 'My Assignments', icon: ClipboardList },
    { href: '/teacher/meetings', label: 'Meetings', icon: UserCheck },
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
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar - mobile overlay, desktop fixed */}
      <div className={cn(
        "fixed left-0 top-0 h-full w-64 bg-navy border-r border-white/10 flex flex-col z-40 transition-transform duration-300",
        "lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/10">
        <Link href="/teacher" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-white">
            SK<span className="text-amber">U</span>LI
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const badge = 'badge' in item && typeof item.badge === 'number' ? item.badge : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'bg-amber/15 text-amber'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="flex items-center gap-1 text-xs font-semibold bg-amber text-navy rounded-full px-2 py-0.5">
                      <Clock className="w-3 h-3" />
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Assigned Classes Section */}
        {assignments.length > 0 && (
          <div className="mt-6 px-3">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              My Classes
            </h3>
            <div className="space-y-2">
              {homeroomClasses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-white/30">Homeroom</span>
                  {homeroomClasses.map((a) => (
                    <div
                      key={a.class_id}
                      className="text-sm text-white/60 px-2 py-1"
                    >
                      {a.class?.name}{a.class?.stream ? ` - ${a.class.stream}` : ''}
                    </div>
                  ))}
                </div>
              )}
              {subjectClasses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-white/30">Subjects</span>
                  {subjectClasses.map((a) => (
                    <div
                      key={`${a.class_id}-${a.subject_id}`}
                      className="text-sm text-white/60 px-2 py-1"
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
      <div className="p-4 border-t border-white/10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 h-auto py-2 px-2 text-white hover:bg-white/10">
              <Avatar className="w-8 h-8">
                <AvatarImage src={teacher.avatar_url || undefined} />
                <AvatarFallback className="bg-amber/20 text-amber text-xs font-bold">
                  {teacher.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-medium truncate text-white">{teacher.full_name}</p>
                <p className="text-xs text-white/50 truncate">Teacher</p>
              </div>
              <ChevronDown className="w-4 h-4 text-white/50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-navy border-white/10">
            <DropdownMenuItem onClick={() => router.push('/teacher/profile')} className="text-white hover:bg-white/10">
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="text-rose hover:bg-white/10">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </>
  );
}

'use client';

import { useSchoolStore } from '@/store/school';
import type { UserRole } from '@/types';

/**
 * Hook for role-based permission checks.
 */
export function usePermissions() {
  const user = useSchoolStore((s) => s.user);
  const role = user?.role;

  const hasRole = (...roles: UserRole[]) => {
    return role ? roles.includes(role) : false;
  };

  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isSchoolAdmin = role === 'SCHOOL_ADMIN';
  const isBursar = role === 'BURSAR';
  const isTeacher = role === 'TEACHER';
  const isParent = role === 'PARENT';

  // Permission checks
  const canManageSchool = isSuperAdmin || isSchoolAdmin;
  const canEditFees = isSuperAdmin || isSchoolAdmin || isBursar;
  const canRecordPayments = isSuperAdmin || isSchoolAdmin || isBursar;
  const canViewFees = isSuperAdmin || isSchoolAdmin || isBursar;
  const canViewStudents = isSuperAdmin || isSchoolAdmin || isBursar || isTeacher;
  const canEditStudents = isSuperAdmin || isSchoolAdmin || isBursar;
  const canEnterMarks = isSuperAdmin || isSchoolAdmin || isTeacher;
  const canViewMarks = isSuperAdmin || isSchoolAdmin || isBursar || isTeacher;
  const canManageStudents = isSuperAdmin || isSchoolAdmin || isBursar;
  const canManageStaff = isSuperAdmin || isSchoolAdmin;
  const canManagePayroll = isSuperAdmin || isSchoolAdmin;
  const canSendSMS = isSuperAdmin || isSchoolAdmin || isBursar;
  const canManageSettings = isSuperAdmin || isSchoolAdmin;
  const canTakeAttendance = isSuperAdmin || isSchoolAdmin || isTeacher;
  const canViewReports = isSuperAdmin || isSchoolAdmin || isBursar;

  return {
    role,
    hasRole,
    isSuperAdmin,
    isSchoolAdmin,
    isBursar,
    isTeacher,
    isParent,
    canManageSchool,
    canEditFees,
    canRecordPayments,
    canViewFees,
    canViewStudents,
    canEditStudents,
    canEnterMarks,
    canViewMarks,
    canManageStudents,
    canManageStaff,
    canManagePayroll,
    canSendSMS,
    canManageSettings,
    canTakeAttendance,
    canViewReports,
  };
}

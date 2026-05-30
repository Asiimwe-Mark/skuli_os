'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface LinkedStudent {
  student_id: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    admission_number: string;
    class: { id: string; name: string } | null;
    school: { id: string; name: string; motto: string | null } | null;
  };
}

interface PortalContextValue {
  linkedStudents: LinkedStudent[];
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  selectedStudent: LinkedStudent | null;
  loading: boolean;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/students')
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.students) {
          setLinkedStudents(data.students);
          if (data.students.length > 0) {
            setSelectedStudentId(data.students[0].student_id);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selectedStudent =
    linkedStudents.find((s) => s.student_id === selectedStudentId) ?? null;

  return (
    <PortalContext.Provider
      value={{
        linkedStudents,
        selectedStudentId,
        setSelectedStudentId,
        selectedStudent,
        loading,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}

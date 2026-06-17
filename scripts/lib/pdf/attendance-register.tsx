import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface AttendanceRegisterData {
  school_name: string;
  class_name: string;
  teacher_name: string;
  month: number;
  year: number;
  students: Array<{
    admission_number: string;
    full_name: string;
    attendance: Record<number, 'P' | 'A' | 'L' | 'E' | '-'>;
  }>;
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 7,
    fontFamily: 'Helvetica',
  },
  header: {
    textAlign: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#1a1a2e',
  },
  schoolName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: '#555',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    fontSize: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    backgroundColor: '#f8f8f8',
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  cellAdm: {
    width: 45,
    textAlign: 'center',
    fontSize: 7,
  },
  cellName: {
    width: 80,
    fontSize: 7,
    paddingLeft: 2,
  },
  cellDay: {
    width: 15,
    textAlign: 'center',
    fontSize: 6,
  },
  cellTotal: {
    width: 22,
    textAlign: 'center',
    fontSize: 7,
    fontWeight: 'bold',
  },
  cellPct: {
    width: 24,
    textAlign: 'center',
    fontSize: 7,
    fontWeight: 'bold',
  },
  headerCell: {
    fontSize: 7,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerCellLeft: {
    fontSize: 7,
    fontWeight: 'bold',
    textAlign: 'left',
    paddingLeft: 2,
  },
  footer: {
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '40%',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 4,
    height: 30,
  },
  signatureLabel: {
    fontSize: 8,
    color: '#555',
  },
  statusP: { color: '#16a34a', fontWeight: 'bold' },
  statusA: { color: '#dc2626', fontWeight: 'bold' },
  statusL: { color: '#d97706', fontWeight: 'bold' },
  statusE: { color: '#2563eb' },
  statusDash: { color: '#999' },
});

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function isWeekend(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day).getDay();
  return d === 0 || d === 6;
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'P': return styles.statusP;
    case 'A': return styles.statusA;
    case 'L': return styles.statusL;
    case 'E': return styles.statusE;
    default: return styles.statusDash;
  }
}

export function AttendanceRegisterPDF({ data }: { data: AttendanceRegisterData }) {
  const daysInMonth = getDaysInMonth(data.month, data.year);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.schoolName}>{data.school_name}</Text>
          <Text style={styles.subtitle}>
            Monthly Attendance Register — {monthNames[data.month - 1]} {data.year}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text>Class: {data.class_name}</Text>
          <Text>Teacher: {data.teacher_name}</Text>
          <Text>Month: {monthNames[data.month - 1]} {data.year}</Text>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.cellAdm]}>Adm No.</Text>
          <Text style={[styles.headerCellLeft, styles.cellName]}>Student Name</Text>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
            <Text
              key={day}
              style={[
                styles.headerCell,
                styles.cellDay,
                isWeekend(data.year, data.month, day) ? { color: '#f59e0b' } : {},
              ]}
            >
              {day}
            </Text>
          ))}
          <Text style={[styles.headerCell, styles.cellTotal]}>Pres</Text>
          <Text style={[styles.headerCell, styles.cellTotal]}>Abs</Text>
          <Text style={[styles.headerCell, styles.cellPct]}>%</Text>
        </View>

        {/* Table Body */}
        {data.students.map((student, idx) => {
          let present = 0;
          let absent = 0;
          let totalSchoolDays = 0;

          for (let d = 1; d <= daysInMonth; d++) {
            const status = student.attendance[d] || '-';
            if (status !== '-') {
              totalSchoolDays++;
              if (status === 'P' || status === 'L') present++;
              if (status === 'A') absent++;
            }
          }

          const pct = totalSchoolDays > 0 ? Math.round((present / totalSchoolDays) * 100) : 0;

          return (
            <View key={student.admission_number} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={styles.cellAdm}>{student.admission_number}</Text>
              <Text style={styles.cellName}>{student.full_name}</Text>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const status = student.attendance[day] || '-';
                return (
                  <Text key={day} style={[styles.cellDay, getStatusStyle(status)]}>
                    {status}
                  </Text>
                );
              })}
              <Text style={styles.cellTotal}>{present}</Text>
              <Text style={styles.cellTotal}>{absent}</Text>
              <Text style={styles.cellPct}>{pct}%</Text>
            </View>
          );
        })}

        {/* Footer — Signatures */}
        <View style={styles.footer}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Class Teacher: {data.teacher_name}</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Headmaster / Headmistress</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

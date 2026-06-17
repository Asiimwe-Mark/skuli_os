import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface AttendanceCertificateData {
  school_name: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  term: string;
  total_present: number;
  total_days: number;
  attendance_rate: number;
  class_teacher_name: string;
  headmaster_name: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 60,
    fontFamily: 'Helvetica',
    backgroundColor: '#fff',
  },
  border: {
    borderWidth: 2,
    borderColor: '#1a1a2e',
    padding: 40,
    minHeight: '100%',
  },
  innerBorder: {
    borderWidth: 0.5,
    borderColor: '#f59e0b',
    padding: 30,
  },
  header: {
    textAlign: 'center',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  schoolName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 6,
  },
  schoolSubtitle: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  certTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f59e0b',
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  body: {
    fontSize: 12,
    lineHeight: 1.8,
    color: '#333',
    textAlign: 'center',
    marginBottom: 30,
  },
  studentName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a2e',
    textDecoration: 'underline',
  },
  statsBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 30,
    marginVertical: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  statLabel: {
    fontSize: 8,
    color: '#666',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#1a1a2e',
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 4,
    textAlign: 'center',
    alignSelf: 'center',
    marginBottom: 30,
  },
  footer: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '40%',
    alignItems: 'center',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    width: '100%',
    marginBottom: 6,
    height: 30,
  },
  signatureName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  signatureLabel: {
    fontSize: 8,
    color: '#666',
  },
  verifiedBadge: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 8,
    color: '#999',
  },
});

export function AttendanceCertificatePDF({ data }: { data: AttendanceCertificateData }) {
  const termLabel = data.term.replace('Term', 'Term ');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.border}>
          <View style={styles.innerBorder}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.schoolName}>{data.school_name}</Text>
              <Text style={styles.schoolSubtitle}>Certificate of Attendance</Text>
            </View>

            <Text style={styles.certTitle}>Attendance Certificate</Text>

            {/* Body */}
            <View style={styles.body}>
              <Text style={{ marginBottom: 12 }}>This is to certify that</Text>
              <Text style={styles.studentName}>{data.student_name}</Text>
              <Text style={{ marginBottom: 12 }}>
                Admission No. {data.admission_number}, Class {data.class_name}
              </Text>
              <Text>
                attended school for{' '}
                <Text style={{ fontWeight: 'bold' }}>{data.total_present}</Text> out of{' '}
                <Text style={{ fontWeight: 'bold' }}>{data.total_days}</Text> days in{' '}
                <Text style={{ fontWeight: 'bold' }}>{termLabel}</Text>, representing an attendance rate of
              </Text>
            </View>

            {/* Attendance Rate Badge */}
            <View style={styles.statsBox}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{data.total_present}</Text>
                <Text style={styles.statLabel}>Days Present</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{data.total_days - data.total_present}</Text>
                <Text style={styles.statLabel}>Days Absent</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{data.attendance_rate}%</Text>
                <Text style={styles.statLabel}>Attendance Rate</Text>
              </View>
            </View>

            <Text style={styles.badge}>
              {data.attendance_rate >= 90
                ? 'EXCELLENT ATTENDANCE'
                : data.attendance_rate >= 75
                ? 'GOOD ATTENDANCE'
                : 'NEEDS IMPROVEMENT'}
            </Text>

            {/* Signatures */}
            <View style={styles.footer}>
              <View style={styles.signatureBlock}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureName}>{data.class_teacher_name}</Text>
                <Text style={styles.signatureLabel}>Class Teacher</Text>
              </View>
              <View style={styles.signatureBlock}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureName}>{data.headmaster_name}</Text>
                <Text style={styles.signatureLabel}>Headmaster / Headmistress</Text>
              </View>
            </View>

            <Text style={styles.verifiedBadge}>
              Issued by SKULI School Management Platform
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

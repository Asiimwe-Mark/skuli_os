import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#D97706",
  },
  logo: { width: 50, height: 50, marginRight: 15 },
  headerText: { textAlign: "center" },
  schoolName: { fontSize: 16, fontWeight: "bold", color: "#0B1220" },
  motto: { fontSize: 8, color: "#666", marginTop: 2 },
  address: { fontSize: 7, color: "#999", marginTop: 1 },
  title: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 10,
    color: "#0B1220",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  studentInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
  },
  infoItem: { width: "50%", marginBottom: 4 },
  infoLabel: { fontSize: 8, color: "#666" },
  infoValue: { fontSize: 9, fontWeight: "bold", color: "#0B1220" },
  table: { marginBottom: 15 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0B1220",
    padding: 6,
  },
  tableHeaderText: { fontSize: 8, color: "#fff", fontWeight: "bold" },
  tableRow: {
    flexDirection: "row",
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tableCell: { fontSize: 8, color: "#333" },
  colSubject: { width: "30%" },
  colScore: { width: "15%", textAlign: "center" },
  colGrade: { width: "15%", textAlign: "center" },
  colRemarks: { width: "40%" },
  summary: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
  },
  summaryItem: { alignItems: "center" },
  summaryValue: { fontSize: 14, fontWeight: "bold", color: "#D97706" },
  summaryLabel: { fontSize: 7, color: "#666", marginTop: 2 },
  comments: { marginBottom: 15 },
  commentBox: {
    padding: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    marginBottom: 8,
  },
  commentLabel: { fontSize: 8, fontWeight: "bold", color: "#0B1220", marginBottom: 4 },
  commentText: { fontSize: 9, color: "#333" },
  conduct: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  conductLabel: { fontSize: 9, fontWeight: "bold", marginRight: 10 },
  conductGrade: {
    width: 30,
    height: 30,
    borderWidth: 2,
    borderColor: "#D97706",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  conductGradeText: { fontSize: 14, fontWeight: "bold", color: "#D97706" },
  footer: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signature: {
    width: 120,
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 4,
    fontSize: 7,
    color: "#666",
    textAlign: "center",
  },
});

interface ReportCardProps {
  school: {
    name: string;
    address?: string;
    motto?: string;
    logo_url?: string;
  };
  student: {
    full_name: string;
    admission_number: string;
    photo_url?: string;
    class_name: string;
  };
  term: string;
  academic_year: string;
  subjects: Array<{
    name: string;
    bot?: number;
    midterm?: number;
    eot?: number;
    total: number;
    grade: string;
    remarks?: string;
  }>;
  summary: {
    total_marks: number;
    average: number;
    position: number;
    class_size: number;
  };
  attendance: {
    days_present: number;
    days_open: number;
  };
  comments: {
    class_teacher?: string;
    headmaster?: string;
  };
  conduct_grade?: string;
  next_term_date?: string;
}

export function ReportCardPDF({
  school,
  student,
  term,
  academic_year,
  subjects,
  summary,
  attendance,
  comments,
  conduct_grade,
  next_term_date,
}: ReportCardProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {school.logo_url && <Image src={school.logo_url} style={styles.logo} />}
          <View style={styles.headerText}>
            <Text style={styles.schoolName}>{school.name}</Text>
            {school.motto && <Text style={styles.motto}>"{school.motto}"</Text>}
            {school.address && <Text style={styles.address}>{school.address}</Text>}
          </View>
        </View>

        <Text style={styles.title}>Student Report Card</Text>

        {/* Student Info */}
        <View style={styles.studentInfo}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Student Name</Text>
            <Text style={styles.infoValue}>{student.full_name}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Admission No.</Text>
            <Text style={styles.infoValue}>{student.admission_number}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Class</Text>
            <Text style={styles.infoValue}>{student.class_name}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Term / Year</Text>
            <Text style={styles.infoValue}>
              {term} / {academic_year}
            </Text>
          </View>
        </View>

        {/* Marks Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colSubject]}>Subject</Text>
            <Text style={[styles.tableHeaderText, styles.colScore]}>BOT</Text>
            <Text style={[styles.tableHeaderText, styles.colScore]}>MID</Text>
            <Text style={[styles.tableHeaderText, styles.colScore]}>EOT</Text>
            <Text style={[styles.tableHeaderText, styles.colScore]}>Total</Text>
            <Text style={[styles.tableHeaderText, styles.colGrade]}>Grade</Text>
            <Text style={[styles.tableHeaderText, styles.colRemarks]}>Remarks</Text>
          </View>
          {subjects.map((subject, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colSubject]}>{subject.name}</Text>
              <Text style={[styles.tableCell, styles.colScore]}>
                {subject.bot ?? "—"}
              </Text>
              <Text style={[styles.tableCell, styles.colScore]}>
                {subject.midterm ?? "—"}
              </Text>
              <Text style={[styles.tableCell, styles.colScore]}>
                {subject.eot ?? "—"}
              </Text>
              <Text style={[styles.tableCell, styles.colScore, { fontWeight: "bold" }]}>
                {subject.total}
              </Text>
              <Text style={[styles.tableCell, styles.colGrade, { fontWeight: "bold" }]}>
                {subject.grade}
              </Text>
              <Text style={[styles.tableCell, styles.colRemarks]}>
                {subject.remarks || ""}
              </Text>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.total_marks}</Text>
            <Text style={styles.summaryLabel}>Total Marks</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.average}%</Text>
            <Text style={styles.summaryLabel}>Average</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {summary.position}/{summary.class_size}
            </Text>
            <Text style={styles.summaryLabel}>Position</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {attendance.days_present}/{attendance.days_open}
            </Text>
            <Text style={styles.summaryLabel}>Days Present</Text>
          </View>
        </View>

        {/* Conduct Grade */}
        {conduct_grade && (
          <View style={styles.conduct}>
            <Text style={styles.conductLabel}>Conduct Grade:</Text>
            <View style={styles.conductGrade}>
              <Text style={styles.conductGradeText}>{conduct_grade}</Text>
            </View>
          </View>
        )}

        {/* Comments */}
        <View style={styles.comments}>
          {comments.class_teacher && (
            <View style={styles.commentBox}>
              <Text style={styles.commentLabel}>Class Teacher's Comment</Text>
              <Text style={styles.commentText}>{comments.class_teacher}</Text>
            </View>
          )}
          {comments.headmaster && (
            <View style={styles.commentBox}>
              <Text style={styles.commentLabel}>Headmaster's Comment</Text>
              <Text style={styles.commentText}>{comments.headmaster}</Text>
            </View>
          )}
        </View>

        {next_term_date && (
          <Text style={{ fontSize: 9, textAlign: "center", marginBottom: 10 }}>
            Next Term Begins: {next_term_date}
          </Text>
        )}

        {/* Footer Signatures */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.signature}>Class Teacher</Text>
          </View>
          <View>
            <Text style={styles.signature}>Headmaster</Text>
          </View>
          <View>
            <Text style={styles.signature}>School Stamp</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

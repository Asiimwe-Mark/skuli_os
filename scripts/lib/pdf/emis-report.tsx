import React from "react";
import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { EmisData } from "@/lib/emis/aggregate";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#0B1220" },
  cover: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: "#D97706" },
  schoolName: { fontSize: 18, fontWeight: "bold" },
  sub: { fontSize: 8, color: "#666", marginTop: 2 },
  logo: { width: 48, height: 48, objectFit: "contain" },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginTop: 16, marginBottom: 6, color: "#0B1220", textTransform: "uppercase", letterSpacing: 1 },
  table: { width: "100%", borderWidth: 1, borderColor: "#e0e0e0" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  headerRow: { backgroundColor: "#0B1220" },
  headerCell: { color: "#fff", fontWeight: "bold", padding: 4, flex: 1, fontSize: 8 },
  cell: { padding: 4, flex: 1, fontSize: 8 },
  alt: { backgroundColor: "#f9f9f9" },
  kv: { flexDirection: "row", marginBottom: 3 },
  k: { width: 140, color: "#666" },
  v: { fontWeight: "bold" },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#999", borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 6 },
});

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View style={[styles.row, styles.headerRow]}>
      {cols.map((c) => (
        <Text key={c} style={styles.headerCell}>{c}</Text>
      ))}
    </View>
  );
}

export interface EmisReportPDFProps {
  data: EmisData;
  logoUrl?: string | null;
  reportDate: string;
}

export function EmisReportPDF({ data, logoUrl, reportDate }: EmisReportPDFProps) {
  return (
    <Page size="A4" style={styles.page}>
      {/* Cover */}
      <View style={styles.cover}>
        <View>
          <Text style={styles.schoolName}>{data.school.name}</Text>
          <Text style={styles.sub}>EMIS Enrolment Report — Uganda Ministry of Education format</Text>
          <Text style={styles.sub}>
            {data.school.district ? `${data.school.district} District · ` : ""}
            Code: {data.school.schoolCode} · {data.termName} · {reportDate}
          </Text>
        </View>
        {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
      </View>

      {/* Section A */}
      <Text style={styles.sectionTitle}>Section A — School Identification</Text>
      <View style={styles.kv}><Text style={styles.k}>School Name</Text><Text style={styles.v}>{data.school.name}</Text></View>
      <View style={styles.kv}><Text style={styles.k}>District</Text><Text style={styles.v}>{data.school.district || "—"}</Text></View>
      <View style={styles.kv}><Text style={styles.k}>School Code</Text><Text style={styles.v}>{data.school.schoolCode}</Text></View>
      <View style={styles.kv}><Text style={styles.k}>School Type</Text><Text style={styles.v}>{data.school.schoolType || "—"}</Text></View>
      <View style={styles.kv}><Text style={styles.k}>Subscription Plan</Text><Text style={styles.v}>{data.school.subscriptionPlan || "—"}</Text></View>

      {/* Section B */}
      <Text style={styles.sectionTitle}>Section B — Enrolment by Class and Gender</Text>
      <View style={styles.table}>
        <TableHeader cols={["Class", "Boys", "Girls", "Total"]} />
        {data.enrolmentByClass.map((r, i) => (
          <View key={r.className} style={[styles.row, i % 2 === 0 ? styles.alt : {}]}>
            <Text style={styles.cell}>{r.className}</Text>
            <Text style={styles.cell}>{r.boys}</Text>
            <Text style={styles.cell}>{r.girls}</Text>
            <Text style={styles.cell}>{r.total}</Text>
          </View>
        ))}
        <View style={[styles.row, styles.headerRow]}>
          <Text style={styles.headerCell}>Total</Text>
          <Text style={styles.headerCell}>{data.totals.boys}</Text>
          <Text style={styles.headerCell}>{data.totals.girls}</Text>
          <Text style={styles.headerCell}>{data.totals.total}</Text>
        </View>
      </View>

      {/* Section C */}
      <Text style={styles.sectionTitle}>Section C — Enrolment by Age Group</Text>
      <View style={styles.table}>
        <TableHeader cols={["Age group", "Boys", "Girls", "Total"]} />
        {data.enrolmentByAge.map((r, i) => (
          <View key={r.bracket} style={[styles.row, i % 2 === 0 ? styles.alt : {}]}>
            <Text style={styles.cell}>{r.bracket}</Text>
            <Text style={styles.cell}>{r.boys}</Text>
            <Text style={styles.cell}>{r.girls}</Text>
            <Text style={styles.cell}>{r.total}</Text>
          </View>
        ))}
      </View>

      {/* Section D */}
      <Text style={styles.sectionTitle}>Section D — Teacher Statistics</Text>
      <View style={styles.kv}><Text style={styles.k}>Total active staff</Text><Text style={styles.v}>{data.staff.totalActive}</Text></View>
      <View style={styles.kv}><Text style={styles.k}>Qualified teachers</Text><Text style={styles.v}>{data.staff.qualifiedTeachers}</Text></View>
      <View style={styles.kv}><Text style={styles.k}>Teacher:pupil ratio</Text><Text style={styles.v}>{data.staff.teacherPupilRatio}</Text></View>

      {/* Section E */}
      <Text style={styles.sectionTitle}>Section E — Attendance Summary</Text>
      <View style={styles.kv}><Text style={styles.k}>Days present</Text><Text style={styles.v}>{data.attendance.daysPresent}</Text></View>
      <View style={styles.kv}><Text style={styles.k}>Days possible</Text><Text style={styles.v}>{data.attendance.daysPossible}</Text></View>
      <View style={styles.kv}><Text style={styles.k}>Overall attendance rate</Text><Text style={styles.v}>{data.attendance.rate}%</Text></View>

      <View style={styles.footer} fixed>
        <Text>Generated by SKULI School Management System — Confidential</Text>
        <Text render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

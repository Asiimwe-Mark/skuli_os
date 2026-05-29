import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

interface FieldDef {
  key: string;
  label: string;
  select: string;
  type: "string" | "number" | "date";
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: "#F5A623" },
  schoolName: { fontSize: 16, fontWeight: "bold", color: "#0A1628" },
  schoolAddress: { fontSize: 8, color: "#999", marginTop: 2 },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center", marginBottom: 16, color: "#0A1628", textTransform: "uppercase", letterSpacing: 1.5 },
  table: { width: "100%", borderStyle: "solid", borderWidth: 1, borderColor: "#e0e0e0" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  tableHeader: { backgroundColor: "#0A1628", color: "#fff", fontWeight: "bold" },
  tableCell: { padding: 4, fontSize: 8, flex: 1, borderRightWidth: 1, borderRightColor: "#e0e0e0" },
  tableCellLast: { padding: 4, fontSize: 8, flex: 1 },
  footer: { position: "absolute", bottom: 20, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#999" },
  meta: { fontSize: 8, color: "#666", marginBottom: 12 },
});

const SOURCE_LABELS: Record<string, string> = {
  "students-fees": "Students & Fees Report",
  academics: "Academic Marks Report",
  attendance: "Attendance Report",
  payments: "Payments Report",
};

export interface CustomReportPDFProps {
  schoolName: string;
  schoolAddress: string;
  source: string;
  columns: string[];
  dateFrom?: string;
  dateTo?: string;
  data: any[];
  fieldDefs: FieldDef[];
}

export function CustomReportPDF({
  schoolName,
  schoolAddress,
  source,
  columns,
  dateFrom,
  dateTo,
  data,
  fieldDefs,
}: CustomReportPDFProps) {
  const selectedFields = columns
    .map((k) => fieldDefs.find((f) => f.key === k))
    .filter(Boolean) as FieldDef[];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.schoolName}>{schoolName}</Text>
            {schoolAddress ? <Text style={styles.schoolAddress}>{schoolAddress}</Text> : null}
          </View>
          <Text style={{ fontSize: 8, color: "#999" }}>
            Generated: {new Date().toLocaleDateString("en-UG")}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{SOURCE_LABELS[source] || "Custom Report"}</Text>

        {/* Meta */}
        <Text style={styles.meta}>
          Records: {data.length} | Columns: {selectedFields.length}
          {dateFrom ? ` | From: ${dateFrom}` : ""}
          {dateTo ? ` | To: ${dateTo}` : ""}
        </Text>

        {/* Table */}
        <View style={styles.table}>
          {/* Header row */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            {selectedFields.map((field, i) => (
              <Text key={field.key} style={i < selectedFields.length - 1 ? styles.tableCell : styles.tableCellLast}>
                {field.label}
              </Text>
            ))}
          </View>

          {/* Data rows */}
          {data.map((row, rowIdx) => (
            <View key={rowIdx} style={[styles.tableRow, rowIdx % 2 === 0 ? { backgroundColor: "#f9f9f9" } : {}]}>
              {selectedFields.map((field, colIdx) => {
                let value: any;
                if (field.select.includes(".")) {
                  value = getNestedValue(row, field.select);
                } else {
                  value = row[field.select];
                }
                if (value === null || value === undefined) value = "";
                return (
                  <Text key={field.key} style={colIdx < selectedFields.length - 1 ? styles.tableCell : styles.tableCellLast}>
                    {String(value)}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>{schoolName} — Custom Report</Text>
          <Text render={({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}`} fixed />
        </View>
      </Page>
    </Document>
  );
}

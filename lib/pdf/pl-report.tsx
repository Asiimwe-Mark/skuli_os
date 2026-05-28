import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

interface IncomeRow {
  class_name: string;
  fee_name: string;
  amount: number;
}

interface ExpenseRow {
  category_name: string;
  amount: number;
}

export interface PlReportProps {
  school_name: string;
  term_name: string;
  academic_year_name: string;
  date_generated: string;
  income_rows: IncomeRow[];
  expense_rows: ExpenseRow[];
  total_income: number;
  total_expenses: number;
}

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#F5A623",
  },
  schoolName: { fontSize: 16, fontWeight: "bold", color: "#0A1628" },
  title: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 10,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#0A1628",
  },
  subtitle: {
    fontSize: 9,
    textAlign: "center",
    color: "#666",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0A1628",
    marginBottom: 8,
    marginTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  table: { marginBottom: 15 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0A1628",
    padding: 6,
  },
  th: { fontSize: 8, color: "#fff", fontWeight: "bold" },
  tableRow: {
    flexDirection: "row",
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  td: { fontSize: 8, color: "#333" },
  col1: { width: "50%" },
  col2: { width: "50%", textAlign: "right" },
  subtotalRow: {
    flexDirection: "row",
    padding: 6,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    backgroundColor: "#f8f8f8",
  },
  subtotalLabel: { fontSize: 9, fontWeight: "bold", color: "#0A1628" },
  subtotalValue: { fontSize: 9, fontWeight: "bold", color: "#0A1628" },
  netRow: {
    flexDirection: "row",
    padding: 8,
    marginTop: 10,
    backgroundColor: "#0A1628",
  },
  netLabel: { fontSize: 10, fontWeight: "bold", color: "#fff" },
  netValue: { fontSize: 10, fontWeight: "bold", color: "#F5A623" },
  footer: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#333",
    width: 200,
    paddingTop: 5,
    marginTop: 40,
  },
  signatureLabel: { fontSize: 8, color: "#666" },
});

export function PlReportPDF({
  school_name,
  term_name,
  academic_year_name,
  date_generated,
  income_rows,
  expense_rows,
  total_income,
  total_expenses,
}: PlReportProps) {
  const net = total_income - total_expenses;
  const isSurplus = net >= 0;

  // Group income by class
  const incomeByClass = new Map<string, number>();
  income_rows.forEach((row) => {
    const key = row.class_name;
    incomeByClass.set(key, (incomeByClass.get(key) || 0) + row.amount);
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.schoolName}>{school_name}</Text>
        </View>

        <Text style={styles.title}>Income & Expenditure Statement</Text>
        <Text style={styles.subtitle}>
          {term_name} — {academic_year_name} | Generated: {date_generated}
        </Text>

        {/* Income Section */}
        <Text style={styles.sectionTitle}>Income</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>Description</Text>
            <Text style={[styles.th, { textAlign: "right" }]}>Amount (UGX)</Text>
          </View>
          {Array.from(incomeByClass.entries()).map(([className, amount], i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.td}>Fee Collections — {className}</Text>
              <Text style={[styles.td, styles.col2]}>{formatUGX(amount)}</Text>
            </View>
          ))}
          <View style={styles.subtotalRow}>
            <Text style={[styles.subtotalLabel, styles.col1]}>Total Income</Text>
            <Text style={[styles.subtotalValue, styles.col2]}>
              {formatUGX(total_income)}
            </Text>
          </View>
        </View>

        {/* Expenditure Section */}
        <Text style={styles.sectionTitle}>Expenditure</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>Category</Text>
            <Text style={[styles.th, { textAlign: "right" }]}>Amount (UGX)</Text>
          </View>
          {expense_rows.map((row, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.td}>{row.category_name}</Text>
              <Text style={[styles.td, styles.col2]}>{formatUGX(row.amount)}</Text>
            </View>
          ))}
          <View style={styles.subtotalRow}>
            <Text style={[styles.subtotalLabel, styles.col1]}>Total Expenditure</Text>
            <Text style={[styles.subtotalValue, styles.col2]}>
              {formatUGX(total_expenses)}
            </Text>
          </View>
        </View>

        {/* Net Surplus/Deficit */}
        <View style={styles.netRow}>
          <Text style={[styles.netLabel, styles.col1]}>
            Net {isSurplus ? "Surplus" : "Deficit"}
          </Text>
          <Text style={[styles.netValue, styles.col2]}>
            {formatUGX(Math.abs(net))}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>Bursar</Text>
            </View>
          </View>
          <View>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>Date</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

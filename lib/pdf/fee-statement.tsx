import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString("en-UG")}`;
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
    borderBottomColor: "#D97706",
  },
  logo: { width: 50, height: 50, marginRight: 15 },
  schoolName: { fontSize: 16, fontWeight: "bold", color: "#0B1220" },
  address: { fontSize: 7, color: "#999", marginTop: 1 },
  title: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 10,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  studentInfo: {
    padding: 10,
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
    marginBottom: 15,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  label: { fontSize: 8, color: "#666" },
  value: { fontSize: 9, fontWeight: "bold", color: "#0B1220" },
  table: { marginBottom: 15 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0B1220",
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
  col1: { width: "25%" },
  col2: { width: "25%" },
  col3: { width: "25%", textAlign: "right" },
  col4: { width: "25%", textAlign: "right" },
  summary: {
    padding: 12,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    marginTop: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  summaryLabel: { fontSize: 10, color: "#666" },
  summaryValue: { fontSize: 10, fontWeight: "bold" },
  balance: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: "#D97706",
  },
  balanceLabel: { fontSize: 12, fontWeight: "bold" },
  balanceValue: { fontSize: 14, fontWeight: "bold" },
  footer: { marginTop: 30 },
  signature: {
    width: 150,
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 4,
    fontSize: 7,
    color: "#666",
    textAlign: "center",
  },
});

interface FeeStatementProps {
  school: {
    name: string;
    address?: string;
    logo_url?: string;
  };
  student: {
    full_name: string;
    admission_number: string;
    class_name: string;
    parent_name?: string;
  };
  terms: Array<{
    term_name: string;
    academic_year: string;
    fee_items: Array<{ name: string; amount: number }>;
    total_expected: number;
    payments: Array<{
      date: string;
      amount: number;
      method: string;
      receipt: string;
    }>;
    total_paid: number;
    balance: number;
  }>;
  generated_date: string;
}

export function FeeStatementPDF({
  school,
  student,
  terms,
  generated_date,
}: FeeStatementProps) {
  const grandExpected = terms.reduce((s, t) => s + t.total_expected, 0);
  const grandPaid = terms.reduce((s, t) => s + t.total_paid, 0);
  const grandBalance = grandExpected - grandPaid;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {school.logo_url && <Image src={school.logo_url} style={styles.logo} />}
          <View>
            <Text style={styles.schoolName}>{school.name}</Text>
            {school.address && <Text style={styles.address}>{school.address}</Text>}
          </View>
        </View>

        <Text style={styles.title}>Fee Statement</Text>

        <View style={styles.studentInfo}>
          <View style={styles.row}>
            <Text style={styles.label}>Student Name:</Text>
            <Text style={styles.value}>{student.full_name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Admission No:</Text>
            <Text style={styles.value}>{student.admission_number}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Class:</Text>
            <Text style={styles.value}>{student.class_name}</Text>
          </View>
          {student.parent_name && (
            <View style={styles.row}>
              <Text style={styles.label}>Parent/Guardian:</Text>
              <Text style={styles.value}>{student.parent_name}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Generated:</Text>
            <Text style={styles.value}>{generated_date}</Text>
          </View>
        </View>

        {terms.map((term, i) => (
          <View key={i} style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 10, fontWeight: "bold", marginBottom: 8 }}>
              {term.term_name} — {term.academic_year}
            </Text>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.col1]}>Fee Item</Text>
                <Text style={[styles.th, styles.col2]}>Date</Text>
                <Text style={[styles.th, styles.col3]}>Amount (UGX)</Text>
                <Text style={[styles.th, styles.col4]}>Running Balance</Text>
              </View>

              {term.fee_items.map((item, j) => (
                <View key={`fee-${j}`} style={styles.tableRow}>
                  <Text style={[styles.td, styles.col1]}>{item.name}</Text>
                  <Text style={[styles.td, styles.col2]}>—</Text>
                  <Text style={[styles.td, styles.col3]}>
                    {formatUGX(item.amount)}
                  </Text>
                  <Text style={[styles.td, styles.col4]}>—</Text>
                </View>
              ))}

              {term.payments.map((payment, j) => (
                <View key={`pay-${j}`} style={styles.tableRow}>
                  <Text style={[styles.td, styles.col1, { color: "#16A34A" }]}>
                    Payment ({payment.method})
                  </Text>
                  <Text style={[styles.td, styles.col2]}>{payment.date}</Text>
                  <Text style={[styles.td, styles.col3, { color: "#16A34A" }]}>
                    ({formatUGX(payment.amount)})
                  </Text>
                  <Text style={[styles.td, styles.col4]}>
                    {payment.receipt}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <View style={{ width: "50%" }}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Expected:</Text>
                  <Text style={styles.summaryValue}>
                    {formatUGX(term.total_expected)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Paid:</Text>
                  <Text style={[styles.summaryValue, { color: "#16A34A" }]}>
                    {formatUGX(term.total_paid)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Balance:</Text>
                  <Text
                    style={[
                      styles.summaryValue,
                      { color: term.balance > 0 ? "#DC2626" : "#16A34A" },
                    ]}
                  >
                    {formatUGX(term.balance)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))}

        {/* Grand Total */}
        <View style={styles.summary}>
          <View style={styles.balance}>
            <Text style={styles.balanceLabel}>Overall Balance:</Text>
            <Text
              style={[
                styles.balanceValue,
                { color: grandBalance > 0 ? "#DC2626" : "#16A34A" },
              ]}
            >
              {formatUGX(grandBalance)}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.signature}>Bursar's Signature</Text>
        </View>
      </Page>
    </Document>
  );
}

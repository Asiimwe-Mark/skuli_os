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
  staffInfo: {
    padding: 10,
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
    marginBottom: 15,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  label: { fontSize: 8, color: "#666" },
  value: { fontSize: 9, fontWeight: "bold", color: "#0B1220" },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0B1220",
    marginBottom: 8,
    marginTop: 10,
    textTransform: "uppercase",
  },
  table: { marginBottom: 10 },
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
  col1: { width: "60%" },
  col2: { width: "40%", textAlign: "right" },
  netPay: {
    marginTop: 15,
    padding: 15,
    backgroundColor: "#0B1220",
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netPayLabel: { fontSize: 12, color: "#fff", fontWeight: "bold" },
  netPayValue: { fontSize: 18, color: "#D97706", fontWeight: "bold" },
  footer: { marginTop: 30, flexDirection: "row", justifyContent: "space-between" },
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

interface PayslipProps {
  school: { name: string; address?: string; logo_url?: string };
  staff: {
    full_name: string;
    employee_number: string;
    role_title: string;
    bank_name?: string;
    bank_account?: string;
    nssf_number?: string;
  };
  payroll: {
    month: string;
    year: number;
    basic_salary: number;
    allowances: Record<string, number>;
    deductions: Record<string, number>;
    nssf_employee: number;
    nssf_employer: number;
    net_salary: number;
  };
}

export function PayslipPDF({ school, staff, payroll }: PayslipProps) {
  const totalAllowances = Object.values(payroll.allowances).reduce(
    (s, v) => s + v,
    0
  );
  const totalDeductions = Object.values(payroll.deductions).reduce(
    (s, v) => s + v,
    0
  );
  const gross = payroll.basic_salary + totalAllowances;

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

        <Text style={styles.title}>Payslip</Text>

        <View style={styles.staffInfo}>
          <View style={styles.row}>
            <Text style={styles.label}>Employee Name:</Text>
            <Text style={styles.value}>{staff.full_name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Employee No:</Text>
            <Text style={styles.value}>{staff.employee_number}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Designation:</Text>
            <Text style={styles.value}>{staff.role_title}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Period:</Text>
            <Text style={styles.value}>
              {payroll.month} {payroll.year}
            </Text>
          </View>
          {staff.bank_name && (
            <View style={styles.row}>
              <Text style={styles.label}>Bank:</Text>
              <Text style={styles.value}>
                {staff.bank_name} — {staff.bank_account}
              </Text>
            </View>
          )}
        </View>

        {/* Earnings */}
        <Text style={styles.sectionTitle}>Earnings</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.col1]}>Description</Text>
            <Text style={[styles.th, styles.col2]}>Amount (UGX)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.td, styles.col1]}>Basic Salary</Text>
            <Text style={[styles.td, styles.col2]}>
              {formatUGX(payroll.basic_salary)}
            </Text>
          </View>
          {Object.entries(payroll.allowances).map(([name, amount]) => (
            <View key={name} style={styles.tableRow}>
              <Text style={[styles.td, styles.col1]}>{name}</Text>
              <Text style={[styles.td, styles.col2]}>
                {formatUGX(amount)}
              </Text>
            </View>
          ))}
          <View style={[styles.tableRow, { backgroundColor: "#f0f0f0" }]}>
            <Text style={[styles.td, styles.col1, { fontWeight: "bold" }]}>
              Gross Earnings
            </Text>
            <Text style={[styles.td, styles.col2, { fontWeight: "bold" }]}>
              {formatUGX(gross)}
            </Text>
          </View>
        </View>

        {/* Deductions */}
        <Text style={styles.sectionTitle}>Deductions</Text>
        <View style={styles.table}>
          {Object.entries(payroll.deductions).map(([name, amount]) => (
            <View key={name} style={styles.tableRow}>
              <Text style={[styles.td, styles.col1]}>{name}</Text>
              <Text style={[styles.td, styles.col2]}>
                {formatUGX(amount)}
              </Text>
            </View>
          ))}
          <View style={styles.tableRow}>
            <Text style={[styles.td, styles.col1]}>NSSF (Employee 5%)</Text>
            <Text style={[styles.td, styles.col2]}>
              {formatUGX(payroll.nssf_employee)}
            </Text>
          </View>
          <View style={[styles.tableRow, { backgroundColor: "#f0f0f0" }]}>
            <Text style={[styles.td, styles.col1, { fontWeight: "bold" }]}>
              Total Deductions
            </Text>
            <Text style={[styles.td, styles.col2, { fontWeight: "bold" }]}>
              {formatUGX(totalDeductions + payroll.nssf_employee)}
            </Text>
          </View>
        </View>

        {/* NSSF Summary */}
        <View style={{ marginTop: 10 }}>
          <View style={styles.row}>
            <Text style={styles.label}>NSSF Employee (5%):</Text>
            <Text style={styles.value}>
              {formatUGX(payroll.nssf_employee)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>NSSF Employer (10%):</Text>
            <Text style={styles.value}>
              {formatUGX(payroll.nssf_employer)}
            </Text>
          </View>
        </View>

        {/* Net Pay */}
        <View style={styles.netPay}>
          <Text style={styles.netPayLabel}>NET PAY</Text>
          <Text style={styles.netPayValue}>
            {formatUGX(payroll.net_salary)}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.signature}>Employee Signature</Text>
          <Text style={styles.signature}>Employer Signature</Text>
        </View>
      </Page>
    </Document>
  );
}

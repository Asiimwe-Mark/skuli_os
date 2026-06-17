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
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#D97706",
  },
  schoolInfo: {
    flex: 1,
  },
  schoolName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0B1220",
  },
  schoolMotto: {
    fontSize: 9,
    color: "#666",
    marginTop: 2,
  },
  schoolAddress: {
    fontSize: 8,
    color: "#999",
    marginTop: 2,
  },
  logo: {
    width: 60,
    height: 60,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#0B1220",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  receiptNumber: {
    fontSize: 10,
    textAlign: "center",
    marginBottom: 20,
    color: "#D97706",
    fontWeight: "bold",
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0B1220",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    color: "#666",
  },
  value: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0B1220",
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0B1220",
    padding: 8,
    borderRadius: 4,
  },
  tableHeaderText: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tableCell: {
    fontSize: 9,
    color: "#333",
  },
  amountSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 10,
    color: "#666",
  },
  totalValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0B1220",
  },
  balanceValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#D97706",
  },
  footer: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signature: {
    width: 150,
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 5,
    fontSize: 8,
    color: "#666",
    textAlign: "center",
  },
  watermark: {
    position: "absolute",
    top: "40%",
    left: "25%",
    fontSize: 60,
    color: "#f0f0f0",
    transform: "rotate(-45deg)",
  },
});

interface ReceiptProps {
  school: {
    name: string;
    address?: string;
    motto?: string;
    logo_url?: string;
    phone?: string;
  };
  student: {
    full_name: string;
    admission_number: string;
    current_class?: string;
  };
  payment: {
    receipt_number: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    mobile_money_transaction_id?: string;
    notes?: string;
  };
  balance: number;
  received_by: string;
  qrDataUrl?: string;
}

export function ReceiptPDF({
  school,
  student,
  payment,
  balance,
  received_by,
  qrDataUrl,
}: ReceiptProps) {
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.schoolInfo}>
            <Text style={styles.schoolName}>{school.name}</Text>
            {school.motto && <Text style={styles.schoolMotto}>{school.motto}</Text>}
            {school.address && <Text style={styles.schoolAddress}>{school.address}</Text>}
            {school.phone && <Text style={styles.schoolAddress}>Tel: {school.phone}</Text>}
          </View>
          {school.logo_url && <Image src={school.logo_url} style={styles.logo} />}
        </View>

        {/* Title */}
        <Text style={styles.title}>Payment Receipt</Text>
        <Text style={styles.receiptNumber}>{payment.receipt_number}</Text>

        {/* Student Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Student Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{student.full_name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Admission No:</Text>
            <Text style={styles.value}>{student.admission_number}</Text>
          </View>
          {student.current_class && (
            <View style={styles.row}>
              <Text style={styles.label}>Class:</Text>
              <Text style={styles.value}>{student.current_class}</Text>
            </View>
          )}
        </View>

        {/* Payment Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Amount Paid:</Text>
            <Text style={[styles.value, { color: "#16A34A" }]}>
              {formatUGX(payment.amount)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Payment Method:</Text>
            <Text style={styles.value}>
              {payment.payment_method.replace("_", " ").toUpperCase()}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date:</Text>
            <Text style={styles.value}>{payment.payment_date}</Text>
          </View>
          {payment.mobile_money_transaction_id && (
            <View style={styles.row}>
              <Text style={styles.label}>Transaction ID:</Text>
              <Text style={styles.value}>
                {payment.mobile_money_transaction_id}
              </Text>
            </View>
          )}
        </View>

        {/* Balance */}
        <View style={styles.amountSection}>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Outstanding Balance:</Text>
            <Text
              style={[
                styles.balanceValue,
                { color: balance > 0 ? "#DC2626" : "#16A34A" },
              ]}
            >
              {formatUGX(balance)}
            </Text>
          </View>
        </View>

        {/* QR Code */}
        {qrDataUrl && (
          <View style={{ alignItems: "center", marginTop: 15 }}>
            <Image src={qrDataUrl} style={{ width: 60, height: 60 }} />
            <Text style={{ fontSize: 7, color: "#999", marginTop: 3 }}>Scan to verify</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.signature}>Received By</Text>
            <Text style={{ fontSize: 8, textAlign: "center", marginTop: 2 }}>
              {received_by}
            </Text>
          </View>
          <View>
            <Text style={styles.signature}>School Stamp</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

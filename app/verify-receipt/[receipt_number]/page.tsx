import { createClient } from "@supabase/supabase-js";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, GraduationCap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function VerifyReceiptPage({
  params,
}: {
  params: Promise<{ receipt_number: string }>;
}) {
  const { receipt_number } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: payment } = await supabase
    .from("fee_payments")
    .select(`
      id,
      receipt_number,
      amount,
      payment_method,
      payment_date,
      status,
      mobile_money_provider,
      mobile_money_transaction_id,
      phone_used,
      notes,
      students(full_name, admission_number, current_class:classes(name)),
      schools(name),
      received_by:users!received_by_user_id(full_name)
    `)
    .eq("receipt_number", receipt_number)
    .single();

  const student = payment?.students as unknown as { full_name: string; admission_number: string; current_class: { name: string } | null } | null;
  const school = payment?.schools as unknown as { name: string } | null;
  const receivedBy = payment?.received_by as unknown as { full_name: string } | null;

  return (
    <div className="min-h-screen bg-bg-tertiary flex items-center justify-center p-4">
      <div className="fixed inset-0 opacity-50" />
      <div className="fixed top-1/3 left-1/3 w-96 h-96 bg-warning-50 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-display font-bold text-heading">
              SK<span className="text-warning-600">U</span>LI
            </h1>
          </Link>
          <p className="text-heading text-sm mt-1">Receipt Verification</p>
        </div>

        <Card className="border-border bg-bg-tertiary backdrop-blur-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Receipt Verification</CardTitle>
          </CardHeader>
          <CardContent>
            {!payment ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-8 h-8 text-danger-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Receipt Not Found</h3>
                <p className="text-heading text-sm">
                  The receipt number <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-xs">{receipt_number}</code> was not found or is invalid.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center mb-4">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success-50 border border-success-50">
                    <CheckCircle2 className="w-5 h-5 text-success-600" />
                    <span className="text-success-600 font-medium text-sm">Verified by SKULI</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-heading text-sm">School</span>
                    <span className="font-medium text-sm">{school?.name || "\u2014"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-heading text-sm">Student</span>
                    <span className="font-medium text-sm">{student?.full_name || "\u2014"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-heading text-sm">Admission No.</span>
                    <span className="font-medium text-sm">{student?.admission_number || "\u2014"}</span>
                  </div>
                  {student?.current_class?.name && (
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-heading text-sm">Class</span>
                      <span className="font-medium text-sm">{student.current_class.name}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-heading text-sm">Amount</span>
                    <span className="font-semibold text-success-600 text-sm">
                      {formatUGX(payment.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-heading text-sm">Date</span>
                    <span className="text-sm">{formatDate(payment.payment_date)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-heading text-sm">Method</span>
                    <span className="text-sm capitalize">
                      {payment.payment_method === "mobile_money"
                        ? "Mobile Money"
                        : payment.payment_method === "cash"
                        ? "Cash"
                        : payment.payment_method === "bank"
                        ? "Bank Transfer"
                        : "Waiver"}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-heading text-sm">Receipt No.</span>
                    <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-xs font-mono">
                      {payment.receipt_number}
                    </code>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-heading text-sm">Status</span>
                    <Badge
                      variant={payment.status === "confirmed" ? "default" : payment.status === "pending" ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {payment.status}
                    </Badge>
                  </div>
                  {payment.payment_method === "mobile_money" && payment.mobile_money_transaction_id && (
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-heading text-sm">Transaction ID</span>
                      <span className="font-mono text-sm">{payment.mobile_money_transaction_id}</span>
                    </div>
                  )}
                  {receivedBy && (
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-heading text-sm">Received By</span>
                      <span className="font-medium text-sm">{receivedBy.full_name}</span>
                    </div>
                  )}
                  {payment.notes && (
                    <div className="flex justify-between py-2">
                      <span className="text-heading text-sm">Notes</span>
                      <span className="text-sm">{payment.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-4">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-heading hover:text-heading">
              <GraduationCap className="w-4 h-4 mr-2" />
              Go to SKULI Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

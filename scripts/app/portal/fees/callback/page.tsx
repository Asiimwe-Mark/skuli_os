"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatUGX } from "@/lib/utils/currency";
import { CheckCircle2, XCircle, Loader2, Download } from "lucide-react";

type State = "verifying" | "success" | "failed";

function CallbackInner() {
  const params = useSearchParams();
  const merchantRef = params.get("OrderMerchantReference");
  const [state, setState] = useState<State>("verifying");
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!merchantRef) { setState("failed"); return; }
    let cancelled = false;
    const deadline = Date.now() + 30_000; // 30s

    async function poll() {
      try {
        const res = await fetch(`/api/v1/payments/status?ref=${encodeURIComponent(merchantRef!)}`);
        const data = await res.json();
        const status = data?.data?.status;
        if (cancelled) return;
        if (status === "COMPLETED") {
          setReceiptNumber(data.data.receipt_number ?? null);
          setAmount(data.data.amount ?? null);
          setState("success");
          return;
        }
        if (status === "FAILED") { setState("failed"); return; }
      } catch { /* keep polling */ }
      if (Date.now() < deadline) {
        setTimeout(poll, 3000);
      } else if (!cancelled) {
        setState("failed");
      }
    }
    poll();
    return () => { cancelled = true; };
  }, [merchantRef]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm"
      >
        {state === "verifying" && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-warning-600" />
            <p className="mt-4 text-base font-semibold text-heading">Verifying your payment?EUR?</p>
            <p className="mt-1 text-sm text-muted">This can take a few seconds. Please wait.</p>
          </>
        )}
        {state === "success" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-50">
              <CheckCircle2 className="h-10 w-10 text-success-600" />
            </div>
            <p className="mt-4 text-lg font-bold text-heading">Payment Successful!</p>
            {amount != null && (
              <p className="mt-1 text-sm text-muted">{formatUGX(amount)} received.</p>
            )}
            {receiptNumber && (
              <p className="mt-1 font-mono text-xs text-muted">Receipt: {receiptNumber}</p>
            )}
            <div className="mt-6 flex flex-col gap-3">
              {merchantRef && (
                <a
                  href={`/api/fees/receipt-pdf/${encodeURIComponent(merchantRef)}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-onbrand hover:bg-brand-700"
                >
                  <Download className="h-4 w-4" /> Download Receipt
                </a>
              )}
              <Link href="/portal/fees" className="rounded-lg bg-bg-tertiary px-6 py-2.5 text-sm font-medium text-heading">
                Back to Fees
              </Link>
            </div>
          </>
        )}
        {state === "failed" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger-50">
              <XCircle className="h-10 w-10 text-danger-600" />
            </div>
            <p className="mt-4 text-lg font-bold text-heading">Payment Not Confirmed</p>
            <p className="mt-1 text-sm text-muted">
              We could not confirm your payment. If you were charged it may take a moment to reflect.
            </p>
            <Link
              href="/portal/fees"
              className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-onbrand hover:bg-brand-700"
            >
              Try Again
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function FeesCallbackPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Loading?EUR?</div>}>
      <CallbackInner />
    </Suspense>
  );
}

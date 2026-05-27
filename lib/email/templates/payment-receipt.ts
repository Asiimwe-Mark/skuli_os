import type { PaymentReceiptData } from '../send';
import { formatUGX } from '@/lib/utils/currency';
import { formatDate } from '@/lib/utils/dates';

export function getPaymentReceiptEmailHtml(data: PaymentReceiptData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin: 0; padding: 0; background: #f4f4f5; font-family: Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #1a1a2e; font-size: 28px; margin: 0;">
            SK<span style="color: #f59e0b;">U</span>LI
          </h1>
        </div>

        <!-- Receipt Card -->
        <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="color: #1a1a2e; margin-top: 0;">Payment Receipt</h2>
          <p style="color: #333;">A payment has been recorded for <strong>${data.studentName}</strong>.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Receipt No.</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${data.receiptNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Amount</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #10b981;">${formatUGX(data.amount)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Date</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right;">${formatDate(data.paymentDate)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Method</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right;">${data.paymentMethod}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666;">Remaining Balance</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold; color: ${data.remainingBalance > 0 ? '#ef4444' : '#10b981'};">${formatUGX(data.remainingBalance)}</td>
            </tr>
          </table>

          <p style="color: #666; font-size: 14px;">
            School: <strong>${data.schoolName}</strong>
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px; color: #999; font-size: 12px;">
          <p>This is an automated receipt from ${data.schoolName} via SKULI.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

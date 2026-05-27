import { resend } from './client';
import { getWelcomeEmailHtml } from './templates/welcome';
import { getPaymentReceiptEmailHtml } from './templates/payment-receipt';

export interface PaymentReceiptData {
  studentName: string;
  amount: number;
  receiptNumber: string;
  remainingBalance: number;
  paymentDate: string;
  paymentMethod: string;
  schoolName: string;
}

export async function sendWelcomeEmail(
  to: string,
  schoolName: string,
  adminName: string,
  loginUrl: string
): Promise<void> {
  await resend.emails.send({
    from: 'SKULI <noreply@skuli.app>',
    to,
    subject: 'Welcome to SKULI — Your School Dashboard is Ready',
    html: getWelcomeEmailHtml(schoolName, adminName, loginUrl),
  });
}

export async function sendPaymentReceiptEmail(
  to: string,
  data: PaymentReceiptData
): Promise<void> {
  await resend.emails.send({
    from: 'SKULI <noreply@skuli.app>',
    to,
    subject: `Payment Receipt — ${data.schoolName}`,
    html: getPaymentReceiptEmailHtml(data),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  await resend.emails.send({
    from: 'SKULI <noreply@skuli.app>',
    to,
    subject: 'Reset Your SKULI Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #1a1a2e;">Reset Your Password</h1>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display: inline-block; background: #f59e0b; color: #1a1a2e; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">The SKULI Team</p>
      </div>
    `,
  });
}

/**
 * SECURITY (audit 12.x): both `contactName` and `schoolName` are
 * supplied by the lead-submission form (lib/validations/concierge.ts
 * allows up to 120/200 chars respectively). The previous version
 * interpolated them directly into HTML, which let a lead submit
 * `</h1><script>...</script>` and have it render in the recipient's
 * email client. Modern email clients strip <script>, but HTML
 * injection still works for phishing and UI-redress attacks. Escape
 * both values before they hit the template.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getConciergeConfirmationHtml(contactName: string, schoolName: string): string {
  const safeName = escapeHtml(contactName);
  const safeSchool = escapeHtml(schoolName);
  return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;"> <h1 style="color: #1a1a2e;">Thank you, ${safeName}!</h1> <p>We have received your request for the SKULI onboarding concierge service for <strong>${safeSchool}</strong>.</p> <p>Our team will contact you within 24 hours to schedule your data migration and staff training.</p> <div style="background: #fff7ed; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 6px;"> <p style="margin: 0; color: #92400e;">What's included: data migration, a staff training session, and 30-day priority support.</p> </div> <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" /> <p style="color: #999; font-size: 12px;">The SKULI Team</p> </div>`;
}

// Audit §10.2: the previous version of this function was:
//   function escapeHtml(str) {
//     return str.replace(/&amp;/g,'&amp;').replace(/&lt;/g,'&lt;')...
//   }
// Every replacement matched an *already-escaped* entity and replaced
// it with itself — a series of no-ops. Raw `&`, `<`, `>` were never
// escaped, so a `full_name` containing `<img src=x onerror=...>` was
// injected verbatim into the invite email HTML (stored XSS in the
// mail client). The order also matters: `&` must be replaced first
// or the subsequent `&lt;` / `&gt;` introductions get re-escaped.
//
// This is the correct escaper: replace source characters in the
// required order (ampersand first, then the other four).
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getInviteEmailHtml(
  schoolName: string,
  userName: string,
  loginUrl: string,
): string {
  return `<!DOCTYPE html> <html> <head> <meta charset="utf-8" /> <meta name="viewport" content="width=device-width, initial-scale=1.0" /> </head> <body style="margin: 0; padding: 0; background: #f4f4f5; font-family: Arial, sans-serif;"> <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;"> <!-- Header --> <div style="text-align: center; margin-bottom: 32px;"> <h1 style="color: #1a1a2e; font-size: 32px; margin: 0;"> SK<span style="color: #f59e0b;">U</span>LI </h1> <p style="color: #666; margin-top: 4px;">School Management Platform</p> </div> <!-- Main Card --> <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"> <h2 style="color: #1a1a2e; margin-top: 0;">You're Invited, ${escapeHtml(userName)}!</h2> <p style="color: #333; line-height: 1.6;"> You've been invited to join <strong>${escapeHtml(schoolName)}</strong> on SKULI. Use the secure link below to set your password and log in: </p> <a href="${loginUrl}" style="display: inline-block; background: #f59e0b; color: #1a1a2e; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 24px 0;"> Set Your Password </a> <p style="color: #666; font-size: 14px; line-height: 1.5;"> For security, this link expires in 24 hours and can only be used once. </p> </div> <!-- Footer --> <div style="text-align: center; margin-top: 32px; color: #999; font-size: 12px;"> <p>The SKULI Team</p> <p>Manage your school smarter.</p> </div> </div> </body> </html>`;
}

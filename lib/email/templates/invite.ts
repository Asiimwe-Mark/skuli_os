export function getInviteEmailHtml(
  schoolName: string,
  userName: string,
  loginUrl: string,
  email: string,
  tempPassword: string
): string {
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
          <h1 style="color: #1a1a2e; font-size: 32px; margin: 0;">
            SK<span style="color: #f59e0b;">U</span>LI
          </h1>
          <p style="color: #666; margin-top: 4px;">School Management Platform</p>
        </div>

        <!-- Main Card -->
        <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="color: #1a1a2e; margin-top: 0;">You're Invited, ${userName}!</h2>
          <p style="color: #333; line-height: 1.6;">
            You've been invited to join <strong>${schoolName}</strong> on SKULI.
            Use the credentials below to log in:
          </p>

          <!-- Credentials Box -->
          <div style="background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #666; font-size: 14px;">Email</p>
            <p style="margin: 0 0 16px; color: #1a1a2e; font-size: 16px; font-weight: bold; font-family: monospace;">${email}</p>
            <p style="margin: 0 0 8px; color: #666; font-size: 14px;">Temporary Password</p>
            <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: bold; font-family: monospace;">${tempPassword}</p>
          </div>

          <p style="color: #666; font-size: 14px; line-height: 1.5;">
            For security, please change your password after your first login.
          </p>

          <a href="${loginUrl}" style="display: inline-block; background: #f59e0b; color: #1a1a2e; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 24px 0;">
            Log In to SKULI
          </a>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px; color: #999; font-size: 12px;">
          <p>The SKULI Team</p>
          <p>Manage your school smarter.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
